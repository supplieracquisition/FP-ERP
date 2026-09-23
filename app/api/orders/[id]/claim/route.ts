import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, users } from "@/lib/db/schema";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { internalSession, denyOrderAccess } from "@/lib/permissions";
import { claimCutoff } from "@/lib/claims";
import { logActivity } from "@/lib/activity";

/**
 * The order-processor claim: the lock that stops two people building a PO for
 * the same order at once.
 *
 * POST takes a claim, DELETE releases one. Everything about what "available"
 * means lives in lib/claims.ts; this file is about taking and giving back.
 */

/** Who holds this order, for explaining a refusal. */
async function describe(orderItemId: string) {
  const [row] = await db
    .select({
      supplierId: orderItems.supplierId,
      processorUserId: orderItems.processorUserId,
      claimedAt: orderItems.claimedAt,
      processorName: users.name,
    })
    .from(orderItems)
    .leftJoin(users, eq(orderItems.processorUserId, users.id))
    .where(eq(orderItems.orderItemId, orderItemId))
    .limit(1);
  return row ?? null;
}

/**
 * Take the claim.
 *
 * The entire concurrency control is the single UPDATE below. The predicate and
 * the write are one statement, so the database evaluates the WHERE under a row
 * lock and applies the SET before releasing it: there is no window between
 * deciding and acting. Two simultaneous callers serialise on that row, and the
 * second one's predicate is evaluated against the row the first already
 * changed, so it matches nothing.
 *
 * This must never be split into a SELECT that checks and an UPDATE that
 * writes. Both callers would pass the SELECT and both would write — which is
 * precisely the bug this exists to prevent.
 *
 * .returning() is the verdict, deliberately, not a row count: row-count
 * semantics differ between the postgres-js and better-sqlite3 drivers, while
 * .returning() is consistent on both. One row back means you hold it; none
 * means you lost.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, denied } = await internalSession();
  if (denied) return denied;

  const { id: orderItemId } = await params;

  const noAccess = await denyOrderAccess(session, orderItemId);
  if (noAccess) return noAccess;

  const me = Number(session.user.id);
  const now = new Date().toISOString();

  /**
   * Who held it a moment ago — for the audit log ONLY.
   *
   * This does NOT reintroduce the check-then-act bug the file warns about. It
   * decides nothing: the UPDATE below is still the single conditional write
   * that settles who wins, and its WHERE is evaluated against the row as it is
   * at that instant, not against this. If this read is stale the worst outcome
   * is a log entry saying "claimed" where "refreshed" would have been more
   * precise — never a second winner.
   *
   * It exists because re-claiming your own order succeeds by design (an
   * idempotent refresh, and the PO Builder does it every time an order is
   * re-added), and recording each of those as a fresh claim would bury the
   * real ones.
   */
  const [before] = await db
    .select({ processorUserId: orderItems.processorUserId })
    .from(orderItems)
    .where(eq(orderItems.orderItemId, orderItemId))
    .limit(1);
  const wasAlreadyMine = before?.processorUserId === me;

  const won = await db
    .update(orderItems)
    .set({ processorUserId: me, claimedAt: now, updatedAt: now })
    .where(
      and(
        eq(orderItems.orderItemId, orderItemId),
        // Still in the pool. Once a PO is built this fails, which is what
        // stops a claim being taken on finished work.
        isNull(orderItems.supplierId),
        or(
          isNull(orderItems.processorUserId), // nobody holds it
          eq(orderItems.processorUserId, me), // I hold it — refresh, not conflict
          isNull(orderItems.claimedAt), // malformed; treat as expired
          lt(orderItems.claimedAt, claimCutoff()) // aged out
        )
      )
    )
    .returning({ id: orderItems.id });

  if (won.length > 0) {
    if (!wasAlreadyMine) {
      await logActivity(session, {
        action: "order.claim",
        entityType: "order",
        entityId: orderItemId,
        orderItemId,
        summary: `Claimed order ${orderItemId} to build its PO`,
      });
    }
    return NextResponse.json({ ok: true, processorUserId: me, claimedAt: now });
  }

  // Lost. Work out why so the UI can say something better than "failed".
  const row = await describe(orderItemId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.supplierId !== null) {
    return NextResponse.json(
      { error: "That order already has a PO, so it is no longer in the pool." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      error: `${row.processorName ?? "Someone else"} is already building a PO for this order.`,
      claimedBy: row.processorName,
      claimedAt: row.claimedAt,
    },
    { status: 409 }
  );
}

/**
 * Release a claim, putting the order back in the pool.
 *
 * Two callers may do this: the holder, giving up work they started, and an
 * admin, clearing anyone's claim.
 *
 * `supplier_id IS NULL` in the WHERE is the permanence guarantee and is not
 * optional. Once the PO is built, processor_user_id is the permanent record of
 * who processed the order; a release that reached a built order would erase
 * that. Releasing only ever applies to work still in the pool.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, denied } = await internalSession();
  if (denied) return denied;

  const { id: orderItemId } = await params;

  const noAccess = await denyOrderAccess(session, orderItemId);
  if (noAccess) return noAccess;

  const me = Number(session.user.id);
  const isAdmin = session.user.role === "admin";
  const now = new Date().toISOString();

  // Whose claim this is, read BEFORE the release clears it — afterwards there
  // is nothing left to name. describe() already exists for the failure path;
  // this is the same lookup moved earlier so the success path can use it too.
  // It decides nothing: the UPDATE's own WHERE still settles whether the
  // release is allowed.
  const held = await describe(orderItemId);

  const released = await db
    .update(orderItems)
    .set({ processorUserId: null, claimedAt: null, updatedAt: now })
    .where(
      and(
        eq(orderItems.orderItemId, orderItemId),
        isNull(orderItems.supplierId),
        // drizzle's and() drops undefined, which is how the admin branch
        // widens without a second query being built.
        isAdmin ? undefined : eq(orderItems.processorUserId, me)
      )
    )
    .returning({ id: orderItems.id });

  if (released.length > 0) {
    // An admin clearing someone else's claim is a different event from a
    // processor giving up their own, and it is the one worth being able to
    // find later — so the summary names whose claim it was.
    const releasedOther = held && held.processorUserId !== me;
    await logActivity(session, {
      action: "order.release",
      entityType: "order",
      entityId: orderItemId,
      orderItemId,
      summary: releasedOther
        ? `Released ${held?.processorName ?? "another user"}'s claim on order ${orderItemId} (admin)`
        : `Released their claim on order ${orderItemId}`,
      details: releasedOther
        ? { releasedProcessorUserId: held?.processorUserId }
        : undefined,
    });
    return NextResponse.json({ ok: true });
  }

  // Re-read rather than reusing `held`: the release failed, and the most
  // likely reason is that the row changed between the two — so the explanation
  // has to come from the row as it is now, not as it was before the attempt.
  const row = await describe(orderItemId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.supplierId !== null) {
    return NextResponse.json(
      {
        error:
          "That order's PO has already been built. Its processor is a permanent record and cannot be released.",
      },
      { status: 409 }
    );
  }

  if (row.processorUserId === null) {
    return NextResponse.json(
      { error: "Nobody has claimed that order." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      error: `That claim belongs to ${row.processorName ?? "someone else"}. Only they or an admin can release it.`,
      claimedBy: row.processorName,
    },
    { status: 403 }
  );
}
