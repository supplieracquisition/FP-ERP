import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers, orderItems, supplierOverrides } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import { addDays, parseISO } from "date-fns";

export async function GET(request: NextRequest) {
  await requireInternal();
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const to = searchParams.get("to") ?? addDays(new Date(), 27).toISOString().slice(0, 10);

  const allSuppliers = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      nickname: suppliers.nickname,
      comments: suppliers.comments,
      turnTime: suppliers.turnTime,
      capacityUnits: suppliers.capacityUnits,
      testPrintTat: suppliers.testPrintTat,
      productionTime: suppliers.productionTime,
      shippingTimeAir: suppliers.shippingTimeAir,
      shippingTimeSea: suppliers.shippingTimeSea,
    })
    .from(suppliers)
    .where(eq(suppliers.active, true));

  // Get OOO overrides in range
  const oooRecords = await db
    .select()
    .from(supplierOverrides)
    .where(sql`${supplierOverrides.date} >= ${from} AND ${supplierOverrides.date} <= ${to}`);

  // Get active orders (not completed/delivered) for capacity spreading
  const orders = await db
    .select({
      orderItemId: orderItems.orderItemId,
      printerShipDate: orderItems.printerShipDate,
      status: orderItems.status,
      productionStage: orderItems.productionStage,
      styleCode: orderItems.styleCode,
      color: orderItems.color,
      quantity: orderItems.quantity,
      requiresTestPrint: orderItems.requiresTestPrint,
      supplierId: orderItems.supplierId,
    })
    .from(orderItems)
    .where(
      sql`${orderItems.status} != 'completed' AND ${orderItems.status} != 'delivered' AND ${orderItems.printerShipDate} IS NOT NULL`
    );

  // Build OOO map: supplierId -> date -> reason
  const ooo: Record<number, Record<string, string | null>> = {};
  for (const r of oooRecords) {
    if (!ooo[r.supplierId]) ooo[r.supplierId] = {};
    ooo[r.supplierId][r.date] = r.reason ?? null;
  }

  const supplierMap = new Map<number, any>(allSuppliers.map((s: any) => [s.id, s]));
  const fromDate = parseISO(from);
  const toDate = parseISO(to);

  // loads: supplierId -> date -> count
  const loads: Record<number, Record<string, number>> = {};
  // ordersByDate: supplierId -> date -> OrderEntry[]
  const ordersByDate: Record<number, Record<string, typeof orders>> = {};

  for (const order of orders) {
    if (!order.supplierId || !order.printerShipDate) continue;
    const supplier = supplierMap.get(order.supplierId);
    if (!supplier) continue;

    const prodTime = supplier.productionTime ?? supplier.turnTime ?? 7;
    const shipDate = parseISO(order.printerShipDate);
    const startDate = addDays(shipDate, -prodTime);

    // Clamp the window to [from, to]
    const windowStart = startDate < fromDate ? fromDate : startDate;
    const windowEnd = shipDate > toDate ? toDate : shipDate;

    let current = new Date(windowStart);
    while (current <= windowEnd) {
      const dateStr = current.toISOString().slice(0, 10);

      if (!loads[order.supplierId]) loads[order.supplierId] = {};
      loads[order.supplierId][dateStr] = (loads[order.supplierId][dateStr] ?? 0) + 1;

      if (!ordersByDate[order.supplierId]) ordersByDate[order.supplierId] = {};
      if (!ordersByDate[order.supplierId][dateStr]) ordersByDate[order.supplierId][dateStr] = [];
      ordersByDate[order.supplierId][dateStr].push(order);

      current = addDays(current, 1);
    }
  }

  return NextResponse.json({ suppliers: allSuppliers, loads, ordersByDate, ooo, from, to });
}
