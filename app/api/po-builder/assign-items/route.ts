import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, statusHistory, suppliers } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { internalSession, denyOrderRowIds } from "@/lib/permissions";
import { claimCutoff, heldBy, allClaimable } from "@/lib/claims";

/**
 * Building the PO: the event that completes a claim and takes an order out of
 * the pool for good.
 *
 * There is no purchase-order table — a PO is a rendered artifact — so this
 * write IS the record that one was built. It is also the only path allowed to
 * set supplier_id; PATCH /api/orders/[id] refuses that field precisely so this
 * guard cannot be walked around.
 */
export async function POST(request: NextRequest) {
  const { session, denied } = await internalSession();
  if (denied) return denied;

  const body = await request.json();
  const {
    orderItemIds,
    supplierId,
    productionStage,
    inHandsDate,
    supplierShipDate,
    shippingMethod,
    testPrintDate,
  } = body as {
    orderItemIds: number[];
    supplierId: number;
    productionStage: string;
    inHandsDate?: string;
    supplierShipDate?: string;
    shippingMethod?: string;
    testPrintDate?: string;
  };

  if (!orderItemIds || orderItemIds.length === 0) {
    return NextResponse.json({ error: "No order items provided" }, { status: 400 });
  }

  if (!supplierId) {
    return NextResponse.json({ error: "No supplier ID provided" }, { status: 400 });
  }

  if (!productionStage) {
    return NextResponse.json({ error: "No production stage provided" }, { status: 400 });
  }

  // Deduped, because the count guard below compares against this length and a
  // repeated id would make the expected total unreachable.
  const ids = [...new Set(orderItemIds)];

  // The normal flow assigns out of the pool, which every internal user can
  // reach — so this only refuses a request aimed at orders already belonging to
  // someone else's suppliers. Defence in depth: the claim guard below is what
  // actually decides.
  const outOfScope = await denyOrderRowIds(session, ids);
  if (outOfScope) return outOfScope;

  const [supplier] = await db
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!supplier) {
    return NextResponse.json({ error: "Unknown supplier" }, { status: 400 });
  }

  const me = Number(session.user.id);
  const now = new Date().toISOString();
  // One cutoff for the whole statement. Calling claimCutoff() twice could
  // straddle a claim expiring exactly on the boundary and let the row filter
  // and the count guard disagree.
  const cutoff = claimCutoff();

  try {
    const assigned = await db
      .update(orderItems)
      .set({
        supplierId: supplierId,
        productionStage: productionStage,
        status: "in_production",
        // Whoever builds the PO is the processor, recorded permanently — and
        // that has to be written HERE, not just by the claim endpoint. The
        // guard below admits unclaimed orders (and ones whose earlier claim
        // expired), so on those paths nothing else would ever set this and the
        // "who processed it" record would be silently NULL on a built order.
        // Correct in all three admitted cases: unclaimed means this user is the
        // processor, already-mine is a no-op, and a stale claim means the
        // person who actually finished it takes the record.
        processorUserId: me,
        // Keep the original claim time if there is one — it is when processing
        // actually started, which is the only thing this column is good for
        // once the order leaves the pool (no guard reads it after supplier_id
        // is set), and it is the input a future PO turnaround metric would
        // want. Only stamp now when the order was never claimed. One caveat:
        // if this assignment took over someone else's EXPIRED claim, the
        // preserved timestamp is their start, not this user's.
        claimedAt: sql`COALESCE(${orderItems.claimedAt}, ${now})`,
        updatedAt: now,
        ...(inHandsDate && { inHandsDate }),
        ...(supplierShipDate && { supplierShipDate }),
        ...(shippingMethod && { shippingMethod }),
        ...(testPrintDate && { testPrintDate }),
      })
      .where(
        and(
          inArray(orderItems.id, ids),
          // Per-row: still in the pool, and actively held by THIS user.
          //
          // Now strict. This was claimable(me) for one deploy, which also
          // admitted unclaimed orders — necessary while the PO Builder did not
          // yet claim, since a strict check would have refused every
          // assignment. The builder claims at add time now, so an assignment
          // with no claim behind it did not come through the flow and is
          // refused.
          //
          // The double-assign race is closed by the pool half either way:
          // whoever writes first takes the row out of the pool and the second
          // matches nothing.
          heldBy(me, cutoff),
          // Whole-request: unless EVERY id qualifies, touch nothing. Without
          // this a bulk update assigns the rows it can reach and reports
          // success, leaving a PO covering orders that were only partly
          // assigned.
          allClaimable(ids, me, cutoff)
        )
      )
      .returning({ id: orderItems.id, orderItemId: orderItems.orderItemId });

    if (assigned.length !== ids.length) {
      return NextResponse.json(
        {
          error:
            "One or more of those orders is no longer available — it may have been claimed by someone else, or already had its PO built. Refresh and try again.",
          assigned: 0,
        },
        { status: 409 }
      );
    }

    // The audit trail this route never had. Assignment is the single most
    // significant transition in the system and, until now, left no history row
    // at all — an order simply appeared in a production stage with no record of
    // who put it there.
    //
    // Written as a second statement because it cannot share one with the update
    // above: data-modifying CTEs would do it on Postgres but SQLite has no
    // equivalent, and an async transaction callback is unsupported on the
    // better-sqlite3 driver. The exposure is a process death between the two
    // statements, which costs an audit row rather than corrupting an
    // assignment, so it is logged rather than surfaced as a failed request —
    // the assignment really did happen, and telling the caller it failed would
    // invite a retry that then 409s.
    try {
      await db.insert(statusHistory).values(
        assigned.map((row: { orderItemId: string }) => ({
          orderItemId: row.orderItemId,
          fromStatus: "unassigned",
          toStatus: productionStage,
          changedBy: me,
          changedAt: now,
          note: `PO built — assigned to ${supplier.name}`,
        }))
      );
    } catch (historyErr) {
      console.error(
        `[assign-items] assignment committed but status history failed for ${assigned
          .map((r: { orderItemId: string }) => r.orderItemId)
          .join(", ")}:`,
        historyErr
      );
    }

    return NextResponse.json({ ok: true, assigned: assigned.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
