import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers, users, orderItems } from "@/lib/db/schema";
import { asc, eq, ne, sql } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import { inviteSupplierUser } from "@/lib/supplierInvite";

export async function GET() {
  await requireInternal();

  const allSuppliers = await db.select().from(suppliers).orderBy(asc(suppliers.name));

  const [supplierUsers, internalUsers, orderCounts] = await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email, supplierId: users.supplierId })
      .from(users).where(eq(users.role, "supplier")),
    db.select({ id: users.id, name: users.name })
      .from(users).where(ne(users.role, "supplier")).orderBy(asc(users.name)),
    db.select({ supplierId: orderItems.supplierId, count: sql<number>`count(*)` })
      .from(orderItems).groupBy(orderItems.supplierId),
  ]);

  const countsMap = new Map(orderCounts.map((r) => [r.supplierId, Number(r.count)]));
  const pocMap = new Map(internalUsers.map((u) => [u.id, u.name]));

  const usersMap = new Map<number, { id: number; name: string; email: string }[]>();
  for (const u of supplierUsers) {
    if (u.supplierId) {
      if (!usersMap.has(u.supplierId)) usersMap.set(u.supplierId, []);
      usersMap.get(u.supplierId)!.push({ id: u.id, name: u.name, email: u.email });
    }
  }

  return NextResponse.json({
    suppliers: allSuppliers.map((s) => ({
      ...s,
      orderCount: countsMap.get(s.id) ?? 0,
      users: usersMap.get(s.id) ?? [],
      pocName: s.pocUserId ? (pocMap.get(s.pocUserId) ?? null) : null,
    })),
    internalUsers,
  });
}

/**
 * Operational fields the create form collects, each mapping to a column that
 * already existed — these are the same values the per-supplier edit view has
 * always written, just gathered up front instead of after the fact.
 */
const NUMERIC_FIELDS = [
  "testPrintTat",
  "productionTime",
  "shippingTimeSea",
  "shippingTimeAir",
  "capacityUnits",
] as const;

/** Blank means "not known yet" (null), not zero. Zero is a real capacity. */
function coerceOptionalInt(raw: unknown): number | null | "invalid" {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0) return "invalid";
  return n;
}

export async function POST(request: NextRequest) {
  await requireInternal();
  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const values: Record<string, unknown> = {
    name: body.name.trim(),
    contactEmail: body.contactEmail?.trim() || null,
  };

  for (const field of NUMERIC_FIELDS) {
    const parsed = coerceOptionalInt(body[field]);
    if (parsed === "invalid") {
      return NextResponse.json(
        { error: `${field} must be a whole number of 0 or more` },
        { status: 400 }
      );
    }
    values[field] = parsed;
  }

  // poc_user_id points at an internal team member, not at the supplier-side
  // poc_name/poc_email/poc_phone free-text fields that sit beside it.
  const pocUserId = coerceOptionalInt(body.pocUserId);
  if (pocUserId === "invalid") {
    return NextResponse.json({ error: "pocUserId must be a user id" }, { status: 400 });
  }
  if (pocUserId !== null) {
    const [poc] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, pocUserId))
      .limit(1);
    if (!poc || poc.role === "supplier") {
      return NextResponse.json(
        { error: "POC must be an internal team member" },
        { status: 400 }
      );
    }
  }
  values.pocUserId = pocUserId;

  let supplierId: number;
  try {
    const [created] = await db
      .insert(suppliers)
      .values(values)
      .returning({ id: suppliers.id });
    supplierId = created.id;
  } catch (error) {
    // suppliers.name is unique, and retrying after a failed invite is exactly
    // when an admin resubmits the same name.
    const message = error instanceof Error ? error.message : "";
    if (/unique|duplicate/i.test(message)) {
      return NextResponse.json({ error: "A supplier with this name already exists" }, { status: 409 });
    }
    throw error;
  }

  // The portal login is optional: register the supplier now, invite whoever
  // will use the portal once that's known. A failed invite leaves the supplier
  // in place — the admin retries from "Add login" rather than re-entering
  // every field.
  let invite: { ok: boolean; error?: string; invited?: boolean } | null = null;
  if (body.loginEmail?.trim()) {
    const result = await inviteSupplierUser({
      supplierId,
      name: body.loginName?.trim() || body.name.trim(),
      email: body.loginEmail,
    });
    invite = result.ok
      ? { ok: true, invited: result.invited }
      : { ok: false, error: result.error };
  }

  return NextResponse.json({ ok: true, supplierId, invite });
}
