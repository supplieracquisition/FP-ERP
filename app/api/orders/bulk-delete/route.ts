import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  orderItems,
  statusHistory,
  comments,
  orderImages,
  notifications,
  notificationReads,
  testPrintQueue,
} from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { denyUnlessAdmin } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

/**
 * How many orders one request may delete.
 *
 * The table page shows 50, so this is well clear of anything the UI can select
 * while still bounding the id list a single request can put into an IN clause.
 */
const MAX_BATCH = 500;

/**
 * Delete several orders at once.
 *
 * POST rather than DELETE-with-a-body: a body on DELETE is poorly specified and
 * is dropped outright by some proxies and fetch implementations, which here
 * would arrive as a request to delete nothing — or, if a handler ever guessed at
 * "no ids means all", everything. The ids are required and explicit.
 *
 * Admin-only, matching DELETE /api/orders (clear all) rather than the per-order
 * DELETE, which is internal-and-scoped. Bulk destruction is not a routine
 * handling action, and an admin's scope is unrestricted anyway.
 */
export async function POST(request: NextRequest) {
  // denyUnlessAdmin() rather than requireAuth() + denyNonAdmin(): requireAuth()
  // signals a missing session by calling redirect(), which leaves the handler as
  // a 307. fetch() follows it to the login page, gets HTML and a 200, and
  // reports res.ok — so a refused delete would be announced to the admin as a
  // successful one. This pair answers both refusals with a real status.
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  // Cached per request by auth(), so this costs nothing after the check above.
  const session = (await auth())!;

  let body: { orderItemIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body?.orderItemIds)) {
    return NextResponse.json(
      { error: "orderItemIds must be an array" },
      { status: 400 }
    );
  }

  // Deduplicated before the count check so that a UI bug repeating an id cannot
  // trip the batch limit, and before the delete so the reported count is honest.
  const ids = [
    ...new Set(
      body.orderItemIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  // Refused rather than treated as a no-op success: an empty selection reaching
  // here means the caller thinks it selected something.
  if (ids.length === 0) {
    return NextResponse.json({ error: "No orders selected" }, { status: 400 });
  }

  if (ids.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Too many orders at once (max ${MAX_BATCH}). Delete in smaller batches.` },
      { status: 400 }
    );
  }

  // Which of those ids are real. Reported back so the caller can tell a delete
  // of 12 from a delete of 12 where 3 had already gone — the UI's selection can
  // be a few seconds stale, and silently rounding that down to "ok" hides it.
  const existing = await db
    .select({ orderItemId: orderItems.orderItemId })
    .from(orderItems)
    .where(inArray(orderItems.orderItemId, ids));

  if (existing.length === 0) {
    return NextResponse.json({ error: "None of those orders exist" }, { status: 404 });
  }

  const targets = existing.map((r) => r.orderItemId);

  // Delete in dependency order, child rows first.
  //
  // There is no transaction here on purpose: db.transaction() with an async
  // callback is unsupported on the better-sqlite3 driver — it throws
  // "Transaction function cannot return a promise" and the body never runs — so
  // code written that way works in production and silently does nothing in local
  // dev. Ordering is what makes this safe instead of atomicity: once every
  // referencing row is gone the final delete cannot fail, so there is no partial
  // state to roll back.
  //
  // FIVE tables reference an order, not three. statusHistory, comments and
  // orderImages are the obvious ones; notifications carries a real FK to
  // order_items.order_item_id, and notification_reads then carries one to
  // notifications.id — so reads must go before notifications, which must go
  // before the orders. Missing either link does not fail quietly: it raises a
  // foreign key violation partway through, after earlier deletes have already
  // committed.
  const doomedNotifications = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(inArray(notifications.orderItemId, targets));

  if (doomedNotifications.length > 0) {
    await db.delete(notificationReads).where(
      inArray(
        notificationReads.notificationId,
        doomedNotifications.map((n) => n.id)
      )
    );
  }

  await db.delete(notifications).where(inArray(notifications.orderItemId, targets));
  await db.delete(statusHistory).where(inArray(statusHistory.orderItemId, targets));
  await db.delete(comments).where(inArray(comments.orderItemId, targets));
  await db.delete(orderImages).where(inArray(orderImages.orderItemId, targets));
  // No FK on this one, so it never blocks the delete — it would just leave rows
  // pointing at orders that no longer exist, which then collide with the unique
  // order_item_id the next time the same order is re-imported and uploaded a
  // test print.
  await db.delete(testPrintQueue).where(inArray(testPrintQueue.orderItemId, targets));
  await db.delete(orderItems).where(inArray(orderItems.orderItemId, targets));

  console.log(`[orders] bulk delete by=${session.user.id} count=${targets.length}`);

  /**
   * One entry for the batch, plus one per order.
   *
   * The batch entry is what an admin reads ("deleted 12 orders"); the per-order
   * entries are what makes a deleted order findable by its id afterwards, which
   * is the single most likely search anyone runs against this log — "what
   * happened to 190943A". Those two needs genuinely differ, and a batch of at
   * most 500 is small enough to afford both.
   *
   * This is the opposite of the choice made for imports, where one upload can
   * touch hundreds of rows routinely rather than exceptionally, and per-order
   * entries would bury a day of human activity.
   */
  await logActivity(session, {
    action: "order.bulk_delete",
    entityType: "order",
    summary: `Deleted ${targets.length} order${targets.length !== 1 ? "s" : ""} in bulk`,
    details: { orderItemIds: targets, requested: ids.length },
  });

  for (const orderItemId of targets) {
    await logActivity(session, {
      action: "order.delete",
      entityType: "order",
      entityId: orderItemId,
      orderItemId,
      summary: `Deleted order ${orderItemId} (part of a bulk delete of ${targets.length})`,
    });
  }

  return NextResponse.json({
    ok: true,
    deleted: targets.length,
    requested: ids.length,
  });
}
