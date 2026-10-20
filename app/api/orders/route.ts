import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, suppliers, statusHistory, comments, orderImages, csvImports, csvImportErrors, notifications, notificationReads, testPrintQueue } from "@/lib/db/schema";
import { eq, and, sql, asc, desc, inArray } from "drizzle-orm";
import { requireAuth, denyNonAdmin, orderScope } from "@/lib/permissions";
import { IN_POOL, claimable, claimCutoff, claimIsActive } from "@/lib/claims";
import { logActivity } from "@/lib/activity";
import { ordersToCsv, exportFilename } from "@/lib/orders-export";
import { addDays, format } from "date-fns";

const BASE_SELECT = {
  id: orderItems.id,
  orderId: orderItems.orderId,
  orderItemId: orderItems.orderItemId,
  orderName: orderItems.orderName,
  orderCreatedAt: orderItems.orderCreatedAt,
  styleCode: orderItems.styleCode,
  color: orderItems.color,
  quantity: orderItems.quantity,
  printType: orderItems.printType,
  decoratingMethods: orderItems.decoratingMethods,
  dueDate: orderItems.dueDate,
  supplierShipDate: orderItems.supplierShipDate,
  originalSupplierShipDate: orderItems.originalSupplierShipDate,
  delayReason: orderItems.delayReason,
  totalValue: orderItems.totalValue,
  status: orderItems.status,
  productionStage: orderItems.productionStage,
  testPrintStatus: orderItems.testPrintStatus,
  shippingMethod: orderItems.shippingMethod,
  requiresTestPrint: orderItems.requiresTestPrint,
  trackingNumber: orderItems.trackingNumber,
  templatePdf: orderItems.templatePdf,
  supplierId: orderItems.supplierId,
  nominatedSupplierId: orderItems.nominatedSupplierId,
  supplierName: suppliers.name,
  supplierNickname: suppliers.nickname,
  clientName: orderItems.clientName,
  deliveryAddress: orderItems.deliveryAddress,
  processorUserId: orderItems.processorUserId,
  claimedAt: orderItems.claimedAt,
};

/**
 * What the CSV export selects.
 *
 * Separate from BASE_SELECT rather than reusing it, because the two answer to
 * different things. BASE_SELECT is shaped by what the table and the Kanban
 * draw; this is shaped by EXPORT_COLUMNS in lib/orders-export.ts, which is
 * shaped in turn by what the IMPORTER can read back. Two of these columns —
 * assigned date and print locations — are importable and exportable but have
 * never been needed on screen, and folding them into BASE_SELECT would have
 * widened every orders query in the app to serve a file.
 *
 * Keep the keys in step with the `field` values in EXPORT_COLUMNS: a field
 * named there and missing here exports as an empty column, silently.
 */
const EXPORT_SELECT = {
  orderId: orderItems.orderId,
  orderItemId: orderItems.orderItemId,
  orderName: orderItems.orderName,
  orderCreatedAt: orderItems.orderCreatedAt,
  styleCode: orderItems.styleCode,
  color: orderItems.color,
  supplierName: suppliers.name,
  assignedDate: orderItems.assignedDate,
  supplierShipDate: orderItems.supplierShipDate,
  originalSupplierShipDate: orderItems.originalSupplierShipDate,
  dueDate: orderItems.dueDate,
  printType: orderItems.printType,
  printLocations: orderItems.printLocations,
  decoratingMethods: orderItems.decoratingMethods,
  quantity: orderItems.quantity,
  totalValue: orderItems.totalValue,
  requiresTestPrint: orderItems.requiresTestPrint,
  trackingNumber: orderItems.trackingNumber,
  shippingMethod: orderItems.shippingMethod,
  templatePdf: orderItems.templatePdf,
  clientName: orderItems.clientName,
  deliveryAddress: orderItems.deliveryAddress,
  status: orderItems.status,
  productionStage: orderItems.productionStage,
  testPrintStatus: orderItems.testPrintStatus,
  delayReason: orderItems.delayReason,
};

/**
 * Stamp each row with whether its claim is live.
 *
 * Computed here rather than in the browser on purpose. The client's clock is
 * not the one the claim write will be judged against, so a card that looked
 * takeable because the viewer's machine was a minute fast would fail the guard
 * with no explanation. One authority for expiry, and it is this one.
 *
 * supplierId is in the constraint because a claim is a pool-only concept and
 * claimIsActive needs to see that the order has left it — see lib/claims.ts.
 * Both callers select it; the CSV export, which does not, never comes here.
 *
 * The holder's NAME is deliberately not joined in. Aliasing a second join onto
 * users would need drizzle's alias(), which is imported per-dialect — and this
 * schema switches dialect at runtime, so that import would be wrong on one of
 * them. The Kanban resolves the id against the team roster it is already given.
 */
function withClaimState<
  T extends { supplierId: number | null; processorUserId: number | null; claimedAt: string | null }
>(rows: T[]): (T & { claimActive: boolean })[] {
  const cutoff = claimCutoff();
  return rows.map((r) => ({ ...r, claimActive: claimIsActive(r, cutoff) }));
}

async function buildConditions(params: URLSearchParams, session: { user: { id: string; role: string; supplierId: string | null } }, includeDelivered: boolean) {
  const conditions = [];
  const isSupplier = session.user.role === "supplier";

  if (!includeDelivered) {
    conditions.push(sql`${orderItems.status} != 'completed' AND ${orderItems.status} != 'delivered'`);
  }

  // Who this session may see at all. Only a supplier gets a restriction back
  // now — the internal team sees every order; see orderScope(). Pushed before
  // the request's own filters so everything below can only narrow it further.
  const scope = await orderScope(session);
  if (scope) conditions.push(scope);

  if (!isSupplier) {
    // A supplier filter from the query string: one id, several comma-separated
    // ids, or "0" for the unassigned pool, which may be combined with real ids.
    // An intersection with the scope above, never an escape from it.
    //
    // NaN is filtered out rather than passed through. Number("") is 0, which is
    // the pool sentinel, so a trailing comma in the parameter would otherwise
    // silently add every unassigned order to a filter that asked for neither.
    const raw = (params.get("supplierId") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const wantsPool = raw.includes("0");
    const ids = raw
      .filter((s) => s !== "0")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);

    if (wantsPool && ids.length) {
      conditions.push(sql`(${IN_POOL} OR ${inArray(orderItems.supplierId, ids)})`);
    } else if (wantsPool) {
      conditions.push(IN_POOL);
    } else if (ids.length) {
      conditions.push(inArray(orderItems.supplierId, ids));
    }
  }

  const column = params.get("column") ?? "";
  if (column) {
    if (column === "unassigned") {
      // Same expression the scope filter and the claim guard use, imported
      // rather than rewritten so this cannot drift from them again.
      conditions.push(IN_POOL);
    } else if (column === "shipped") {
      conditions.push(eq(orderItems.status, "shipped"));
    } else if (column === "completed") {
      conditions.push(eq(orderItems.status, "completed"));
    } else {
      // For all other stages (sample_production, printing, etc.), must have a supplier AND match the stage
      conditions.push(sql`${orderItems.supplierId} IS NOT NULL`);
      conditions.push(eq(orderItems.productionStage, column));
    }
  }

  // What the PO Builder lists: pool orders this user could actually take right
  // now. Filtering here rather than greying in the builder means you cannot
  // start assembling a PO around an order that will refuse you at the end.
  if (params.get("claimable") === "1") {
    conditions.push(claimable(Number(session.user.id)));
  }

  const nominatedSupplierId = params.get("nominatedSupplierId") ?? "";
  if (nominatedSupplierId) {
    conditions.push(eq(orderItems.nominatedSupplierId, Number(nominatedSupplierId)));
  }

  const styleCode = params.get("styleCode") ?? "";
  if (styleCode) conditions.push(sql`lower(${orderItems.styleCode}) like lower(${"%" + styleCode + "%"})`);

  const color = params.get("color") ?? "";
  if (color) conditions.push(sql`lower(${orderItems.color}) like lower(${"%" + color + "%"})`);

  const printType = params.get("printType") ?? "";
  if (printType) conditions.push(sql`lower(${orderItems.printType}) like lower(${"%" + printType + "%"})`);

  const decoration = params.get("decoration") ?? "";
  if (decoration) conditions.push(sql`lower(${orderItems.decoratingMethods}) like lower(${"%" + decoration + "%"})`);

  const search = params.get("search") ?? "";
  if (search) {
    conditions.push(sql`(
      lower(${orderItems.orderItemId}) like lower(${"%" + search + "%"})
      OR lower(${orderItems.orderName}) like lower(${"%" + search + "%"})
      OR lower(${orderItems.orderId}) like lower(${"%" + search + "%"})
      OR lower(${orderItems.styleCode}) like lower(${"%" + search + "%"})
    )`);
  }

  const shipDate = params.get("shipDate") ?? "";
  if (shipDate) {
    const today = format(new Date(), "yyyy-MM-dd");
    if (shipDate === "today") {
      conditions.push(eq(orderItems.supplierShipDate, today));
    } else {
      const cutoff = format(addDays(new Date(), Number(shipDate)), "yyyy-MM-dd");
      conditions.push(and(
        sql`${orderItems.supplierShipDate} >= ${today}`,
        sql`${orderItems.supplierShipDate} <= ${cutoff}`
      )!);
    }
  }

  return conditions.length ? and(...conditions) : undefined;
}

/**
 * Every branch ends in `id` and that is not decoration — it is what stops
 * Kanban cards jumping around.
 *
 * None of these sort keys is unique. Dozens of orders share a due date, and the
 * pool is full of rows with no due date at all, so the leading keys leave large
 * groups of ties. SQL does not order within a tie, so the database is free to
 * return those rows however the scan happened to reach them — and an UPDATE
 * changes that. Postgres does not edit a row in place; it writes a new version,
 * usually at the end of the heap, so the updated row comes back LATER among its
 * ties than it did before.
 *
 * That is exactly what nominating and claiming do: both are UPDATEs on
 * order_items, both call onRefresh(), and the board replaces its whole list
 * with the server's order. So the card someone just touched — and any card tied
 * with it — visibly reshuffled, which reads as the board scrambling itself
 * every time a colleague claims something.
 *
 * A unique final key removes the ties entirely, so the order is total and the
 * same rows come back in the same sequence no matter what was written since.
 *
 * The paginated path below shares this and needs it more, not less: LIMIT/OFFSET
 * over a non-deterministic sort can show a row on two pages and never on the
 * one in between.
 */
function buildOrderBy(sortBy: string) {
  const tiebreak = asc(orderItems.id);
  switch (sortBy) {
    case "ship_date":     return [asc(orderItems.supplierShipDate), asc(orderItems.dueDate), tiebreak];
    case "quantity_asc":  return [asc(orderItems.quantity), tiebreak];
    case "quantity_desc": return [desc(orderItems.quantity), tiebreak];
    case "value_asc":     return [asc(orderItems.totalValue), tiebreak];
    case "value_desc":    return [desc(orderItems.totalValue), tiebreak];
    default:              return [asc(orderItems.dueDate), asc(orderItems.supplierShipDate), tiebreak];
  }
}

export async function GET(request: NextRequest) {
  const session = await requireAuth();
  const { searchParams } = new URL(request.url);

  const isKanban     = searchParams.get("kanban") === "1";
  const isCsv        = searchParams.get("format") === "csv";
  const showDelivered = searchParams.get("showDelivered") === "1";
  const where = await buildConditions(searchParams, session, isKanban || showDelivered);
  const orderByClause = buildOrderBy(searchParams.get("sortBy") ?? "");

  // The CSV export is a FORMAT of this endpoint, not an endpoint of its own.
  //
  // Scoping is the reason. buildConditions() is where a supplier is held to
  // their own orders and an internal user to the suppliers they are POC of,
  // and it is not exported from this file. A /api/orders/export route would
  // therefore have had to restate that rule, and a second copy of a scope
  // check is a second copy that can drift out of step with the first — which
  // here means an export quietly handing someone orders the list refuses them.
  // Sharing the branch makes that unrepresentable: the file contains exactly
  // the rows the table would show, because it is the same query.
  if (isCsv) {
    // No pagination and no limit: an export of the first 50 rows would be a
    // trap. Bounded in practice by the scope above.
    const rows = await db
      .select(EXPORT_SELECT)
      .from(orderItems)
      .leftJoin(suppliers, eq(orderItems.supplierId, suppliers.id))
      .where(where)
      .orderBy(...orderByClause);

    const csv = ordersToCsv(rows, {
      includeInternalOnly: session.user.role !== "supplier",
    });

    // Recorded like any other bulk action. One entry per export, naming the
    // row count — this is the whole order book leaving the tool as a file, and
    // an audit log that notes imports but not exports tells half the story.
    await logActivity(session, {
      action: "order.export",
      entityType: "order",
      entityId: null,
      summary: `Exported ${rows.length} order${rows.length !== 1 ? "s" : ""} as CSV`,
      details: { rows: rows.length, filters: Object.fromEntries(searchParams) },
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename()}"`,
        // The file is scoped to the caller. A shared cache holding one user's
        // orders and serving them to the next would undo everything above.
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (isKanban) {
    // Return all items (no pagination) for the kanban board
    const rows = await db
      .select(BASE_SELECT)
      .from(orderItems)
      .leftJoin(suppliers, eq(orderItems.supplierId, suppliers.id))
      .where(where)
      .orderBy(...orderByClause);
    return NextResponse.json({ items: withClaimState(rows) });
  }

  // Paginated table view
  const page   = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit  = 50;
  const offset = (page - 1) * limit;

  const rows = await db
    .select(BASE_SELECT)
    .from(orderItems)
    .leftJoin(suppliers, eq(orderItems.supplierId, suppliers.id))
    .where(where)
    .orderBy(...orderByClause)
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orderItems)
    .where(where);

  return NextResponse.json({ items: withClaimState(rows), total: Number(count) });
}

export async function DELETE() {
  // Admin only: this wipes every order, along with its history, comments and
  // images. It is not part of the routine import flow.
  const session = await requireAuth();
  const denied = await denyNonAdmin(session);
  if (denied) return denied;

  // Counted before the wipe, because afterwards there is nothing to count. The
  // audit entry is the only remaining record that these orders ever existed.
  const [{ count: doomedCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orderItems);

  // Delete in dependency order.
  //
  // FOUR tables carry a foreign key to order_items.order_item_id --
  // status_history, comments, order_images and NOTIFICATIONS. The last one was
  // missing here, and because these run as separate statements rather than one
  // transaction (db.transaction with an async callback is unsupported on the
  // better-sqlite3 driver -- it throws "Transaction function cannot return a
  // promise" and the body never runs), the failure was the worst shape
  // available: the first five deletes committed, then the orders delete hit the
  // notifications FK and threw. That destroys the import history, audit trail,
  // comments and images while leaving every order in place -- the exact
  // opposite of what the button promises.
  //
  // Correct ordering is what makes this safe, not atomicity: once every
  // referencing row is gone, the final delete cannot fail, so there is no
  // partial state to roll back.
  await db.delete(csvImportErrors);
  await db.delete(csvImports);
  await db.delete(statusHistory);
  await db.delete(comments);
  await db.delete(orderImages);
  // notification_reads references notifications.id, so it has to go first. The
  // notifications delete below was added without it, which left the same bug one
  // table further down: as soon as anyone had marked a notification read, this
  // threw here — after the deletes above had committed.
  await db.delete(notificationReads);
  await db.delete(notifications);
  // No FK on this one, so it never blocked the delete -- it just left rows
  // pointing at orders that no longer exist, which would then collide with the
  // unique order_item_id the next time the same order was re-imported and
  // uploaded a test print.
  await db.delete(testPrintQueue);
  await db.delete(orderItems);

  // Logged last, and deliberately AFTER the deletes rather than before: this
  // records what happened, not what was attempted. activity_log is untouched by
  // the wipe above — it holds no foreign key to order_items, so clearing every
  // order leaves the history of who cleared them intact.
  await logActivity(session, {
    action: "order.clear_all",
    entityType: "order",
    summary: `Cleared ALL orders (${Number(doomedCount)} deleted), with their history, comments, images and notifications`,
    details: { deleted: Number(doomedCount) },
  });

  return NextResponse.json({ ok: true });
}
