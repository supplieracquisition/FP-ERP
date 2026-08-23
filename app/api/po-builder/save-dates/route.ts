import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireInternal, denyOrderItemIds } from "@/lib/permissions";

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
