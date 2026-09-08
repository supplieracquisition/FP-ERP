import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers, orderItems, supplierOverrides } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import { occupiesCapacity } from "@/lib/capacity";
import { addDays } from "date-fns";

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

  // Get the orders still occupying capacity, for spreading across the calendar.
  // What counts as "still occupying" lives in lib/capacity.ts and is shared with
  // the PO Builder's available-capacity figure — notably, a shipped order has
  // left the factory and releases its bench.
  //
  // Anchored on supplier_ship_date, which is the date the PO Builder actually
  // collects when a PO is built. This read was on printer_ship_date until the
  // ship-date consolidation, and that single mismatch is what made the heatmap
  // look stale: assign-items never writes printer_ship_date, so every order
  // assigned through the normal flow failed the IS NOT NULL test below and was
  // dropped from the load counts before any JS ran. The assignment was real,
  // the supplier simply showed zero.
  const orders = await db
    .select({
      orderItemId: orderItems.orderItemId,
      supplierShipDate: orderItems.supplierShipDate,
      status: orderItems.status,
      productionStage: orderItems.productionStage,
      styleCode: orderItems.styleCode,
      color: orderItems.color,
      quantity: orderItems.quantity,
      requiresTestPrint: orderItems.requiresTestPrint,
      supplierId: orderItems.supplierId,
    })
    .from(orderItems)
    .where(occupiesCapacity());

  // Build OOO map: supplierId -> date -> reason
  const ooo: Record<number, Record<string, string | null>> = {};
  for (const r of oooRecords) {
    if (!ooo[r.supplierId]) ooo[r.supplierId] = {};
    ooo[r.supplierId][r.date] = r.reason ?? null;
  }

  const supplierMap = new Map<number, any>(allSuppliers.map((s: any) => [s.id, s]));

  // A ship date is a CALENDAR date, not an instant, and everything below treats
  // it that way. Three details make that worth spelling out:
  //
  //   1. The column holds two shapes. The PO Builder writes a full ISO
  //      timestamp ("2026-09-14T00:00:00.000Z"); an import writes whatever the
  //      sheet had, often a bare "2026-09-14". parseISO() reads the first as UTC
  //      midnight and the second as LOCAL midnight, so mixing them shifts whole
  //      rows by a day depending on which path created them. Slicing to 10
  //      characters and forcing UTC removes the difference.
  //   2. from/to arrive as plain YYYY-MM-DD. Parsed with parseISO() they became
  //      LOCAL midnight while ship dates were UTC midnight, so the window clamp
  //      compared two different kinds of instant.
  //   3. addDays() does its arithmetic on local components, so a window
  //      spanning a DST change drifts by an hour — enough to push a key onto the
  //      adjacent day. UTC has no DST, so stepping by exactly 24h keeps every
  //      date pinned to UTC midnight.
  const utcDay = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  const addUtcDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  const fromDate = utcDay(from);
  const toDate = utcDay(to);

  // loads: supplierId -> date -> count
  const loads: Record<number, Record<string, number>> = {};
  // ordersByDate: supplierId -> date -> OrderEntry[]
  const ordersByDate: Record<number, Record<string, typeof orders>> = {};

  for (const order of orders) {
    if (!order.supplierId || !order.supplierShipDate) continue;
    const supplier = supplierMap.get(order.supplierId);
    if (!supplier) continue;

    const prodTime = supplier.productionTime ?? supplier.turnTime ?? 7;
    const shipDate = utcDay(order.supplierShipDate);
    const startDate = addUtcDays(shipDate, -prodTime);

    // Clamp the window to [from, to]
    const windowStart = startDate < fromDate ? fromDate : startDate;
    const windowEnd = shipDate > toDate ? toDate : shipDate;

    let current = new Date(windowStart);
    while (current <= windowEnd) {
      const dateStr = dayKey(current);

      if (!loads[order.supplierId]) loads[order.supplierId] = {};
      loads[order.supplierId][dateStr] = (loads[order.supplierId][dateStr] ?? 0) + 1;

      if (!ordersByDate[order.supplierId]) ordersByDate[order.supplierId] = {};
      if (!ordersByDate[order.supplierId][dateStr]) ordersByDate[order.supplierId][dateStr] = [];
      ordersByDate[order.supplierId][dateStr].push(order);

      current = addUtcDays(current, 1);
    }
  }

  return NextResponse.json({ suppliers: allSuppliers, loads, ordersByDate, ooo, from, to });
}
