import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  await requireInternal();
  const body = await request.json();
  const {
    orderItemIds,
    supplierId,
    productionStage,
    inHandsDate,
    supplierShipDate,
    shippingMethod,
    testPrintDate,
  } = body as {
    orderItemIds: number[];
    supplierId: number;
    productionStage: string;
    inHandsDate?: string;
    supplierShipDate?: string;
    shippingMethod?: string;
    testPrintDate?: string;
  };

  if (!orderItemIds || orderItemIds.length === 0) {
    return NextResponse.json({ error: "No order items provided" }, { status: 400 });
  }

  if (!supplierId) {
    return NextResponse.json({ error: "No supplier ID provided" }, { status: 400 });
  }

  if (!productionStage) {
    return NextResponse.json({ error: "No production stage provided" }, { status: 400 });
  }

  try {
    await db
      .update(orderItems)
      .set({
        supplierId: supplierId,
        productionStage: productionStage,
        status: "in_production",
        ...(inHandsDate && { inHandsDate }),
        ...(supplierShipDate && { supplierShipDate }),
        ...(shippingMethod && { shippingMethod }),
        ...(testPrintDate && { testPrintDate }),
      })
      .where(inArray(orderItems.id, orderItemIds));

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
