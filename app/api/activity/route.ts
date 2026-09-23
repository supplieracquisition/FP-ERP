import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { denyUnlessAdmin } from "@/lib/permissions";

/**
 * Read the audit trail. Admin only.
 *
 * denyUnlessAdmin() rather than requireAuth() + a role check: requireAuth()
 * signals a missing session by calling redirect(), which leaves the handler as
 * a 307 that fetch() follows to the login page — arriving as a 200 full of
 * HTML, which the client would read as success. This answers both refusals
 * with a real status.
 *
 * Internal users deliberately cannot read this. The log spans every supplier
 * and every colleague, including role changes and deletions, and it is not
 * scoped by POC the way orders are — there is no meaningful partial view of an
 * audit trail, so it is admin or nothing.
 */
const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const conditions = [];

  /**
   * One box, every field an admin would type into it.
   *
   * The ask was "search keywords like order id, agent name, supplier name",
   * which in practice means somebody pastes a string and expects the log to
   * find it wherever it lives. Splitting that into per-field inputs would make
   * them choose the column first — so this matches across all of them at once.
   *
   * The name and supplier columns are searchable precisely because they are
   * denormalised snapshots: no joins, and it still finds the work of someone
   * whose account has since been deleted.
   *
   * LIKE with a leading wildcard cannot use a btree index, so this is a scan.
   * That is fine at this table's scale (low tens of thousands of rows a year)
   * and stays fine for years; if it ever stops being fine the answer is a
   * trigram index on summary, not a narrower search.
   */
  const search = searchParams.get("search")?.trim() ?? "";
  if (search) {
    const needle = `%${search}%`;
    conditions.push(sql`(
      lower(${activityLog.orderItemId}) like lower(${needle})
      OR lower(${activityLog.actorName}) like lower(${needle})
      OR lower(${activityLog.supplierName}) like lower(${needle})
      OR lower(${activityLog.summary}) like lower(${needle})
      OR lower(${activityLog.entityId}) like lower(${needle})
    )`);
  }

  // Exact action ("order.claim") or a whole group ("order."). The dropdown
  // sends both shapes; a trailing dot is what distinguishes them.
  const action = searchParams.get("action") ?? "";
  if (action.endsWith(".")) {
    conditions.push(sql`${activityLog.action} like ${action + "%"}`);
  } else if (action) {
    conditions.push(eq(activityLog.action, action));
  }

  const actorUserId = searchParams.get("actorUserId") ?? "";
  if (actorUserId) {
    conditions.push(eq(activityLog.actorUserId, Number(actorUserId)));
  }

  // Inclusive day bounds. created_at is an ISO string, so "2026-09-22" as a
  // lower bound works directly, but as an upper bound it would exclude the
  // whole of that day — every timestamp on it sorts after the bare date. The
  // ￿ suffix extends it past any time-of-day on the same date.
  const from = searchParams.get("from") ?? "";
  if (from) conditions.push(sql`${activityLog.createdAt} >= ${from}`);
  const to = searchParams.get("to") ?? "";
  if (to) conditions.push(sql`${activityLog.createdAt} <= ${to + "￿"}`);

  const where = conditions.length ? and(...conditions) : undefined;

  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));

  const rows = await db
    .select()
    .from(activityLog)
    .where(where)
    // Newest first, with id as the tiebreaker. Two entries written in the same
    // millisecond — a bulk action logging several rows — would otherwise come
    // back in an order the database was free to change between pages, which is
    // how a row appears twice across a paginated read and another never shows.
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activityLog)
    .where(where);

  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      // Parsed here rather than in the browser: a malformed row should degrade
      // to "no details" in one place, not throw inside a render.
      details: safeParse(r.details),
    })),
    total: Number(count),
    pageSize: PAGE_SIZE,
  });
}

function safeParse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
