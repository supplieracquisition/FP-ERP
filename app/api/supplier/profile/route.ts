import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { denySupplierWrite } from "@/lib/permissions";
import {
  SUPPLIER_EDITABLE_FIELDS,
  SUPPLIER_FIELD_LABELS,
  illegalSupplierFields,
  type SupplierEditableField,
} from "@/lib/supplierEditable";
import { notifyProfileUpdated, type FieldChange } from "@/lib/supplierNotify";

/**
 * The supplier's own account record.
 *
 * There is no [id] segment on this route by design: the supplier id comes from
 * the session, so there is no parameter through which one supplier could read
 * or write another's record.
 */
export async function GET() {
  const session = await auth();
  const denied = denySupplierWrite(session);
  if (denied) return denied;

  const supplierId = Number(session.user.supplierId);

  const [row] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  return NextResponse.json({
    // Group A — the supplier edits these.
    editable: {
      name: row.name,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      pocName: row.pocName,
      pocEmail: row.pocEmail,
      pocPhone: row.pocPhone,
      address: row.address,
    },
    // Group B — display only. Sent for rendering; never accepted back.
    operational: {
      testPrintTat: row.testPrintTat,
      productionTime: row.productionTime,
      shippingTimeSea: row.shippingTimeSea,
      shippingTimeAir: row.shippingTimeAir,
      capacityUnits: row.capacityUnits,
      turnTime: row.turnTime,
    },
    signInEmail: session.user.email,
  });
}

const trim = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export async function PATCH(request: NextRequest) {
  const session = await auth();
  const denied = denySupplierWrite(session);
  if (denied) return denied;

  // From the session, never the request. See denySupplierWrite().
  const supplierId = Number(session.user.supplierId);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Expected an object" }, { status: 400 });
  }

  // The Group B gate. Refused loudly and by name rather than stripped: dropping
  // the keys and returning 200 would report a save that did not happen, and the
  // supplier would believe their production time had changed.
  const illegal = illegalSupplierFields(body);
  if (illegal.length > 0) {
    return NextResponse.json(
      {
        error:
          `These fields cannot be changed from the supplier account page: ` +
          `${illegal.join(", ")}. Use "Request a change" instead.`,
        fields: illegal,
      },
      { status: 403 }
    );
  }

  const [current] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!current) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  // Built by walking the allowlist, never Object.keys(body). Even if the check
  // above were bypassed, an unlisted key has no route into this object.
  const updates: Partial<Record<SupplierEditableField, string | null>> = {};
  const changes: FieldChange[] = [];

  for (const field of SUPPLIER_EDITABLE_FIELDS) {
    if (body[field] === undefined) continue;

    const next = trim(body[field]);
    const prev = (current[field] as string | null) ?? null;
    if (next === prev) continue;

    if (field === "name" && next === null) {
      return NextResponse.json({ error: "Company name cannot be empty" }, { status: 400 });
    }
    if ((field === "contactEmail" || field === "pocEmail") && next && !looksLikeEmail(next)) {
      return NextResponse.json(
        { error: `${SUPPLIER_FIELD_LABELS[field]} is not a valid email address` },
        { status: 400 }
      );
    }

    updates[field] = next;
    changes.push({
      label: SUPPLIER_FIELD_LABELS[field],
      before: prev ?? "",
      after: next ?? "",
    });
  }

  if (changes.length === 0) {
    return NextResponse.json({ ok: true, changed: 0 });
  }

  // suppliers.name is UNIQUE NOT NULL. Checked up front so the supplier gets a
  // usable message; the catch below is the backstop for two renames racing.
  if (updates.name) {
    const [clash] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.name, updates.name), ne(suppliers.id, supplierId)))
      .limit(1);

    if (clash) {
      return NextResponse.json(
        { error: "Another supplier already uses that company name" },
        { status: 409 }
      );
    }
  }

  try {
    await db.update(suppliers).set(updates).where(eq(suppliers.id, supplierId));
  } catch (err) {
    const msg = String(err);
    if (msg.includes("23505") || msg.includes("UNIQUE constraint failed")) {
      return NextResponse.json(
        { error: "Another supplier already uses that company name" },
        { status: 409 }
      );
    }
    console.error("[supplier-profile] update failed", err);
    return NextResponse.json({ error: "Could not save your changes" }, { status: 500 });
  }

  // The write has committed. A mail failure past this point must not be
  // reported as a failed save — the supplier's change is stored either way —
  // so this reports the notification separately rather than throwing.
  let notified = true;
  try {
    await notifyProfileUpdated({
      supplierId: supplierId,
      actorEmail: session.user.email,
      changes,
    });
  } catch (err) {
    notified = false;
    console.error("[supplier-profile] saved but notification failed", err);
  }

  return NextResponse.json({ ok: true, changed: changes.length, notified });
}
