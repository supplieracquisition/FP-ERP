/**
 * What it means for an order to occupy a factory's capacity.
 *
 * Two views answer this question — the capacity heatmap (/api/capacity) and the
 * "available capacity" figure inside the PO Builder
 * (/api/product-library/suppliers) — and until now each carried its own copy of
 * the predicate. They had not drifted yet, but the same duplication in the
 * import routes is exactly how the supplier resolver ended up weaker on one path
 * than the other, so the rule lives here and both consumers import it.
 */

import { and, isNotNull, notInArray } from "drizzle-orm";
import { orderItems } from "@/lib/db/schema";

/**
 * Statuses whose orders no longer consume production capacity.
 *
 * "shipped" belongs here: the item has left the factory, so the bench it was
 * occupying is free for something else. Leaving it out was a real bug — an
 * order marked shipped today went on holding its supplier's capacity every day
 * up to its planned ship date, so a factory that had actually cleared its work
 * still read as loaded.
 *
 * "completed" is what the UI labels *Delivered* (see STAGE_LABEL in
 * CapacityGrid). "delivered" is vestigial — no code path ever writes it — but
 * it is kept because a stray row carrying it should still be treated as done
 * rather than as live work.
 */
export const CAPACITY_RELEASED_STATUSES = ["shipped", "completed", "delivered"];

/**
 * The rows that draw load on the heatmap.
 *
 * supplier_ship_date must be present because it is the anchor the production
 * window is measured backwards from — a row without one cannot be placed on a
 * calendar at all. Note this deliberately does NOT test supplier_id: an
 * unassigned order has no factory to load, and both callers skip it when they
 * resolve the supplier.
 */
export function occupiesCapacity() {
  return and(
    notInArray(orderItems.status, CAPACITY_RELEASED_STATUSES),
    isNotNull(orderItems.supplierShipDate)
  );
}
