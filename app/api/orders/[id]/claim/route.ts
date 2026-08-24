import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, users } from "@/lib/db/schema";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { internalSession, denyOrderAccess } from "@/lib/permissions";
import { claimCutoff } from "@/lib/claims";

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

  if (released.length > 0) return NextResponse.json({ ok: true });

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
