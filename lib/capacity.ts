/**
 * Capacity: what it means for an order to occupy a factory, and the two
 * measurements built on top of that.
 *
 * Two views ask these questions — the capacity heatmap (/api/capacity) and the
 * "available capacity" figure in the Product Library
 * (/api/product-library/suppliers) — and each used to carry its own copy of the
 * rules. They had drifted in the Product Library's case into something that
 * attributed capacity to the wrong supplier entirely. The rules live here now
 * and both consumers import them.
 *
 * ONE entered number, two measurements. suppliers.weekly_capacity is the only
 * capacity figure anyone types; everything else is derived from it and the
 * supplier's own production_time. The retired capacity_units was an
 * orders-per-DAY value that had to be reconciled by hand against
 * production_time, and that reconciliation being wrong is what made the old
 * display untrustworthy.
 */

import { and, isNotNull, notInArray, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderItems } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Calendar-date handling
// ---------------------------------------------------------------------------
//
// A ship date is a CALENDAR date, not an instant, and everything here treats it
// that way. The column holds two shapes — the PO Builder writes a full ISO
// timestamp, an import writes whatever the sheet had, often a bare
// "2026-09-14" — and parseISO() reads the first as UTC midnight and the second
// as LOCAL midnight. Normalising to UTC midnight removes the difference.

/** Any stored date string -> that calendar day at UTC midnight. */
export const utcDay = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

/**
 * Step whole days without touching local components.
 *
 * date-fns addDays() works on local fields, so a window spanning a DST change
 * drifts an hour — enough to push a key onto the adjacent day. Stepping across
 * 2026-11-01 that way produced 10-30, 10-31, 11-02, 11-03 and dropped November
 * 1 from the board entirely. UTC has no DST, so exact 24h arithmetic keeps
 * every date pinned to its own midnight.
 */
export const addUtcDays = (d: Date, n: number) =>
  new Date(d.getTime() + n * 86_400_000);

/** The YYYY-MM-DD key a date occupies. */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Occupancy
// ---------------------------------------------------------------------------

/**
 * Statuses whose orders no longer consume production capacity.
 *
 * "shipped" belongs here: the item has left the factory, so the bench it was
 * occupying is free. Leaving it out was a real bug — an order marked shipped
 * today went on holding capacity every day up to its planned ship date.
 *
 * "completed" is what the UI labels *Delivered* (see STAGE_LABEL in
 * CapacityGrid). "delivered" is vestigial — no code path writes it — but a
 * stray row carrying it should still read as done rather than as live work.
 */
export const CAPACITY_RELEASED_STATUSES = ["shipped", "completed", "delivered"];

/**
 * The rows that draw load. supplier_ship_date must be present because it is the
 * anchor the production window is measured backwards from. Deliberately does
 * NOT test supplier_id — callers skip unassigned rows when resolving the
 * supplier, and an unassigned order has no factory to load.
 */
export function occupiesCapacity() {
  return and(
    notInArray(orderItems.status, CAPACITY_RELEASED_STATUSES),
    isNotNull(orderItems.supplierShipDate)
  );
}

/**
 * How many days of production a supplier needs, for SPREADING work across the
 * calendar.
 *
 * Keeps the long-standing fallback chain, because the heatmap has always drawn
 * a bar for every assigned order and silently dropping suppliers that never
 * filled in a lead time would hide real work. Contrast pipelineCeiling() below,
 * which refuses to guess — it is one thing to place a bar approximately, and
 * another to judge a factory overloaded against a number nobody entered.
 */
export function spreadDays(supplier: {
  productionTime?: number | null;
  turnTime?: number | null;
}): number {
  return supplier.productionTime ?? supplier.turnTime ?? 7;
}

// ---------------------------------------------------------------------------
// The two measurements
// ---------------------------------------------------------------------------

export type CapacityStatus = "green" | "amber" | "red" | "unset";

/** Matches the heatmap's cell shading, so indicators and grid never disagree. */
export const AMBER_AT = 0.7;
export const RED_AT = 1.0;

/**
 * Ratio -> traffic light. A missing or zero ceiling is "unset", never green:
 * an unmeasurable supplier must not read as a healthy one.
 */
export function ratioStatus(count: number, ceiling: number | null): CapacityStatus {
  if (ceiling == null || ceiling <= 0) return "unset";
  const ratio = count / ceiling;
  if (ratio <= AMBER_AT) return "green";
  if (ratio <= RED_AT) return "amber";
  return "red";
}

/**
 * PIPELINE ceiling — how many orders a factory can have in progress at once.
 *
 *     weekly_capacity x (production_time / 7)
 *
 * If it takes in 20 orders a week and each spends 14 days on the floor, then at
 * steady state 40 are in progress. That is the concurrent work-in-progress a
 * healthy factory carries, which is exactly what a day column on the heatmap
 * counts.
 *
 * Uses the supplier's OWN production_time. No default, no fallback: a supplier
 * that has not recorded a lead time returns null and renders "not set" rather
 * than being judged against an invented number.
 */
export function pipelineCeiling(supplier: {
  weeklyCapacity?: number | null;
  productionTime?: number | null;
}): number | null {
  const { weeklyCapacity, productionTime } = supplier;
  if (weeklyCapacity == null || productionTime == null) return null;
  if (weeklyCapacity <= 0 || productionTime <= 0) return null;
  return Math.round(weeklyCapacity * (productionTime / 7));
}

/** INTAKE ceiling — simply the entered weekly figure. */
export function intakeCeiling(supplier: {
  weeklyCapacity?: number | null;
}): number | null {
  const w = supplier.weeklyCapacity;
  return w == null || w <= 0 ? null : w;
}

/** Start of the trailing intake window, as an ISO string. */
export function intakeWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - 7 * 86_400_000).toISOString();
}

/**
 * INTAKE — orders newly handed to each supplier in the trailing 7 days.
 *
 * Counted by assigned_at, NOT by ship date: this measures how fast work is
 * being pushed at a factory, which is a different question from how much is
 * currently on its floor. An order assigned today that ships in six weeks is
 * intake now and pipeline for the next six weeks.
 *
 * The comparison is a lexicographic string compare, which is correct only
 * because assigned_at is written exclusively as toISOString(). See the column
 * comment in schema.pg.ts — a column holding two timestamp formats compares
 * wrong and this window silently stops meaning anything.
 *
 * Rows with a NULL assigned_at are orders assigned before this column existed.
 * They score zero, which is the right answer for a trailing-7-day window.
 */
export async function intakeBySupplier(
  now: Date = new Date()
): Promise<Map<number, number>> {
  const since = intakeWindowStart(now);

  const rows = await db
    .select({
      supplierId: orderItems.supplierId,
      n: sql<number>`count(*)`,
    })
    .from(orderItems)
    .where(and(isNotNull(orderItems.supplierId), gte(orderItems.assignedAt, since)))
    .groupBy(orderItems.supplierId);

  const out = new Map<number, number>();
  for (const r of rows) {
    if (r.supplierId != null) out.set(r.supplierId, Number(r.n));
  }
  return out;
}
