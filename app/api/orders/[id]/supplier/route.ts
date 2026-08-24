import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, statusHistory, suppliers } from "@/lib/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { denyUnlessAdmin } from "@/lib/permissions";
import { auth } from "@/lib/auth";

/**
 * Admin reassignment: change the manufacturer on an order that ALREADY has one.
 *
 * Not to be confused with releasing a claim (DELETE on ../claim), which is
 * about work still in the pool. This is the other end of the lifecycle — a PO
 * exists, went to the wrong factory or that factory fell through, and an admin
 * needs to move it.
 *
 * It exists as its own endpoint because PATCH /api/orders/[id] deliberately
 * refuses supplierId. Pooled orders are reachable by every internal user, so a
 * supplierId in the general field allowlist would let any of them assign any
 * pooled order straight past the claim. Reassignment is a genuinely different
 * operation with a genuinely different audience, so it gets its own door with
 * its own lock rather than a hole in that allowlist.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const session = await auth();
  const me = Number(session!.user.id);

  const { id: orderItemId } = await params;

  let body: { supplierId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supplierId = Number(body?.supplierId);
  if (!supplierId || Number.isNaN(supplierId)) {
    return NextResponse.json({ error: "supplierId is required" }, { status: 400 });
  }

  const [supplier] = await db
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!supplier) {
    return NextResponse.json({ error: "Unknown supplier" }, { status: 400 });
  }

  const [current] = await db
    .select({ supplierId: orderItems.supplierId, name: suppliers.name })
    .from(orderItems)
    .leftJoin(suppliers, eq(orderItems.supplierId, suppliers.id))
    .where(eq(orderItems.orderItemId, orderItemId))
    .limit(1);

  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (current.supplierId === supplierId) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const now = new Date().toISOString();

  const moved = await db
    .update(orderItems)
    .set({ supplierId, updatedAt: now })
    .where(
      and(
        eq(orderItems.orderItemId, orderItemId),
        // Reassignment only. A pooled order must go through the PO Builder so
        // that FIRST assignment always passes the claim guard — otherwise this
        // endpoint becomes the bypass the whole lock exists to prevent.
        //
        // Also note what is NOT set here: processor_user_id. Whoever built the
        // original PO stays recorded. Moving the work to another factory does
        // not rewrite who did it.
        isNotNull(orderItems.supplierId)
      )
    )
    .returning({ id: orderItems.id });

  if (moved.length === 0) {
    return NextResponse.json(
      {
        error:
          "That order has no manufacturer yet. Assign it by building its PO in the PO Builder.",
      },
      { status: 409 }
    );
  }

  await db.insert(statusHistory).values({
    orderItemId,
    fromStatus: `supplier:${current.name ?? current.supplierId}`,
    toStatus: `supplier:${supplier.name}`,
    changedBy: me,
    changedAt: now,
    note: `Manufacturer reassigned by admin`,
  });

  return NextResponse.json({ ok: true, supplierId, supplierName: supplier.name });
}
