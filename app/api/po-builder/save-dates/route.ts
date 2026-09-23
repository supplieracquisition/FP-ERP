import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireInternal, denyOrderItemIds } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

export async function POST(request: NextRequest) {
  const session = await requireInternal();
  const body = await request.json();
  const { orderItemIds, inHandsDate } = body as { orderItemIds: string[]; inHandsDate: string };

  if (!orderItemIds || orderItemIds.length === 0) {
    return NextResponse.json({ error: "No order items provided" }, { status: 400 });
  }

  if (!inHandsDate) {
    return NextResponse.json({ error: "No in-hands date provided" }, { status: 400 });
  }

  const denied = await denyOrderItemIds(session, orderItemIds);
  if (denied) return denied;

  try {
    await db
      .update(orderItems)
      .set({ inHandsDate: new Date(inHandsDate).toISOString() })
      .where(inArray(orderItems.orderItemId, orderItemIds));

    // One entry per order, as with assignment: a date change is per-order
    // information and has to be findable by that order's id.
    for (const orderItemId of orderItemIds) {
      await logActivity(session, {
        action: "order.dates",
        entityType: "order",
        entityId: orderItemId,
        orderItemId,
        summary: `Set the in-hands date on order ${orderItemId} to ${inHandsDate}`,
        details: { inHandsDate },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
