import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers, orderItems, supplierOverrides } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import {
  occupiesCapacity,
  spreadDays,
  pipelineCeiling,
  intakeCeiling,
  intakeBySupplier,
  ratioStatus,
  utcDay,
  addUtcDays,
  dayKey,
} from "@/lib/capacity";
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
      weeklyCapacity: suppliers.weeklyCapacity,
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

    const prodTime = spreadDays(supplier);
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

  // ---------------------------------------------------------------------------
  // The two measurements. Reported separately and never summed — they answer
  // different questions and a supplier can be healthy on one and not the other.
  // ---------------------------------------------------------------------------

  // INTAKE — how much new work was handed over in the trailing 7 days. Counted
  // by assigned_at, independent of the window being displayed: paging the grid
  // forward does not change how much work arrived last week.
  const intakeCounts = await intakeBySupplier();

  // PIPELINE — how much is on the floor RIGHT NOW. Computed against today
  // rather than read out of `loads`, because `loads` only covers [from, to] and
  // would report zero the moment someone paged away from the current week.
  const today = utcDay(new Date().toISOString());
  const pipelineCounts = new Map<number, number>();
  for (const order of orders) {
    if (!order.supplierId || !order.supplierShipDate) continue;
    const supplier = supplierMap.get(order.supplierId);
    if (!supplier) continue;

    const shipDate = utcDay(order.supplierShipDate);
    const startDate = addUtcDays(shipDate, -spreadDays(supplier));
    if (today >= startDate && today <= shipDate) {
      pipelineCounts.set(order.supplierId, (pipelineCounts.get(order.supplierId) ?? 0) + 1);
    }
  }

  const capacity: Record<
    number,
    {
      intake: { count: number; ceiling: number | null; status: string };
      pipeline: { count: number; ceiling: number | null; status: string };
    }
  > = {};

  for (const s of allSuppliers as any[]) {
    const intakeCount = intakeCounts.get(s.id) ?? 0;
    const pipelineCount = pipelineCounts.get(s.id) ?? 0;
    // Both ceilings derive from weekly_capacity; the pipeline one also needs
    // this supplier's OWN production_time and is null without it, so a factory
    // with no recorded lead time shows its count with no verdict rather than a
    // verdict against a number nobody entered.
    const iCeil = intakeCeiling(s);
    const pCeil = pipelineCeiling(s);
    capacity[s.id] = {
      intake: { count: intakeCount, ceiling: iCeil, status: ratioStatus(intakeCount, iCeil) },
      pipeline: { count: pipelineCount, ceiling: pCeil, status: ratioStatus(pipelineCount, pCeil) },
    };
  }

  return NextResponse.json({
    suppliers: allSuppliers,
    loads,
    ordersByDate,
    ooo,
    capacity,
    from,
    to,
  });
}
