import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { denySupplierWrite } from "@/lib/permissions";
import { notifyChangeRequested } from "@/lib/supplierNotify";

const MAX_MESSAGE = 4000;

/**
 * A supplier's request to change an operational field they cannot edit.
 *
 * This route contains no write to the suppliers table, deliberately. The
 * operational fields are not merely validated as off-limits here — there is no
 * code path from this handler to an UPDATE on them at all. Approving a request
 * is a human action an admin takes in the admin UI.
 *
 * Delivery is email only: notifications.order_item_id is NOT NULL with an FK to
 * order_items, so a request tied to no order cannot be stored as an in-app
 * notification without a schema migration.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  const denied = denySupplierWrite(session);
  if (denied) return denied;

  // From the session, never the request. See denySupplierWrite().
  const supplierId = Number(session.user.supplierId);

  let body: { message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json(
      { error: "Describe the change you need" },
      { status: 400 }
    );
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json(
      { error: `Please keep the request under ${MAX_MESSAGE} characters` },
      { status: 400 }
    );
  }

  // Read the operational values so the mail says what the settings are today —
  // whoever acts on this should not have to go look them up.
  const [row] = await db
    .select({
      testPrintTat: suppliers.testPrintTat,
      productionTime: suppliers.productionTime,
      shippingTimeSea: suppliers.shippingTimeSea,
      shippingTimeAir: suppliers.shippingTimeAir,
      capacityUnits: suppliers.capacityUnits,
      turnTime: suppliers.turnTime,
    })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Supplier not found" }, { status: 404 });

  const days = (n: number | null) => (n === null ? "" : `${n} day${n === 1 ? "" : "s"}`);

  try {
    await notifyChangeRequested({
      supplierId: supplierId,
      actorEmail: session.user.email,
      message,
      currentValues: [
        { label: "Test print turnaround", value: days(row.testPrintTat) },
        { label: "Production time", value: days(row.productionTime) },
        { label: "Shipping time (sea)", value: days(row.shippingTimeSea) },
        { label: "Shipping time (air)", value: days(row.shippingTimeAir) },
        {
          label: "Capacity",
          value: row.capacityUnits === null ? "" : `${row.capacityUnits} units`,
        },
        { label: "Turn time", value: days(row.turnTime) },
      ],
    });
  } catch (err) {
    // Nothing was stored, so unlike the profile route there is no saved change
    // to preserve: a mail failure means the request did not reach anyone and
    // must be reported as a failure so the supplier retries.
    console.error("[supplier-change-request] delivery failed", err);
    return NextResponse.json(
      { error: "Could not send your request. Please try again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
