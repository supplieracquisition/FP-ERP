import { inArray, sql, type SQL } from "drizzle-orm";
import { orderItems } from "@/lib/db/schema";

/**
 * The order-processor claim: the lock that stops two people building a PO for
 * the same order at once.
 *
 * A processor is whoever builds the PO. It is a separate axis from
 * suppliers.poc_user_id, which is the handler of a SUPPLIER — anyone internal
 * can process any order, and being POC of it is unrelated.
 *
 * Everything about "is this order available" lives in this file so there is
 * exactly one definition. The rule is enforced twice by necessity — once in SQL
 * over many rows (the list queries) and once in the WHERE clause of the write
 * that takes the claim — and those two must agree, so neither re-derives it.
 */

/**
 * How long a claim survives without the PO being built.
 *
 * Expiry is evaluated ON READ, which is why this feature ships with no cron
 * job: an order whose claim has aged past this simply starts matching the
 * available filters again. A missed background run cannot leave an order
 * locked forever, because there is no background run.
 */
export const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The instant a claim must be newer than to still count.
 *
 * Returned as an ISO string because claimed_at is TEXT and the comparison is
 * lexicographic. That only works while every value in the column shares one
 * format, which is why claimed_at has no database default and is always
 * written from JS as new Date().toISOString(). See the column comments in
 * schema.pg.ts for what breaks otherwise.
 */
export function claimCutoff(): string {
  return new Date(Date.now() - CLAIM_TTL_MS).toISOString();
}

/**
 * In the claimable pool at all — claimed or not.
 *
 * THE definition of "unassigned" for the whole codebase. It used to be spelled
 * three different ways: this expression, the same thing plus
 * `nominated_supplier_id IS NULL` in permissions.ts, and a falsy-supplierId
 * check in the Kanban. They now all route through here.
 *
 * Note what this deliberately does NOT consider: nomination. A nominated
 * supplier is a suggestion about who should MAKE the order, not a statement
 * that anyone is working it. An order stays in the pool until it is actually
 * assigned.
 */
export const IN_POOL: SQL = sql`${orderItems.supplierId} IS NULL`;

/**
 * In the pool AND takeable by this user right now.
 *
 * Three ways an order is takeable: nobody holds it, this user already holds it
 * (so re-claiming your own is a refresh rather than a conflict), or the
 * existing claim has aged out.
 *
 * The `claimed_at IS NULL` branch is defensive. A row with a processor but no
 * timestamp is malformed — the two are always written together — and treating
 * it as expired means the worst case is a lock that releases early, not one
 * that never releases.
 */
export function claimable(userId: number, cutoff = claimCutoff()): SQL {
  return sql`(
    ${IN_POOL}
    AND (
      ${orderItems.processorUserId} IS NULL
      OR ${orderItems.processorUserId} = ${userId}
      OR ${orderItems.claimedAt} IS NULL
      OR ${orderItems.claimedAt} < ${cutoff}
    )
  )`;
}

/**
 * All-or-nothing guard for a bulk write that must not half-apply.
 *
 * A guarded bulk UPDATE whose WHERE matches only some of its ids will assign
 * two of three line items and report success. This counts how many of the ids
 * qualify and lets the UPDATE touch nothing unless that is all of them, so the
 * statement is atomically all-or-nothing.
 *
 * Why not a transaction: `db` picks its dialect at runtime, and
 * db.transaction(async …) is unsupported on the better-sqlite3 driver — it
 * throws "Transaction function cannot return a promise" and the body never
 * runs. Code written that way would work in production on Postgres and fail in
 * local dev, which is also where the tests run. A single statement behaves
 * identically on both, and needs no lock held across round trips.
 *
 * Pass the SAME cutoff to this and to the claimable() in the same statement.
 * Two calls to claimCutoff() a millisecond apart can disagree about a claim
 * expiring exactly on the boundary, which would let the count and the row
 * filter reach different answers.
 */
export function allClaimable(
  ids: number[],
  userId: number,
  cutoff = claimCutoff()
): SQL {
  return sql`(
    SELECT count(*) FROM ${orderItems}
    WHERE ${inArray(orderItems.id, ids)} AND ${claimable(userId, cutoff)}
  ) = ${ids.length}`;
}

/**
 * The row-level twin of the expiry half of claimable(), for turning a fetched
 * row into the boolean the UI greys cards on.
 *
 * Computed server-side and sent to the client rather than re-derived there:
 * the browser's clock is not the one the write will be judged against, and a
 * card that looks takeable but fails the guard is a worse experience than one
 * that looks locked for a few extra seconds.
 */
export function claimIsActive(
  row: { processorUserId: number | null; claimedAt: string | null },
  cutoff = claimCutoff()
): boolean {
  if (row.processorUserId === null) return false;
  if (row.claimedAt === null) return false;
  return row.claimedAt >= cutoff;
}
