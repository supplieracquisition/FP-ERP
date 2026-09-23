import { db } from "@/lib/db";
import { activityLog, suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Writing to the audit trail.
 *
 * One call per meaningful change, placed AFTER the write it describes has
 * succeeded. Logging before would record intentions rather than facts — a
 * delete that then hit a foreign key would leave the log claiming it happened.
 *
 * See activity_log in schema.pg.ts for why the table references nothing and
 * stores name snapshots instead of joins.
 */

/** What a session looks like to this module. Structural, so any caller fits. */
export interface ActivitySession {
  user: { id: string; name?: string | null; email?: string | null; role: string };
  impersonating?: { supplierId: number; supplierName: string };
}

export interface ActivityEntry {
  action: string;
  entityType: "order" | "supplier" | "user" | "import" | "api_key" | "capacity";
  entityId?: string | number | null;
  orderItemId?: string | null;
  supplierId?: number | null;
  /** Skips the supplier name lookup when the caller already has it. */
  supplierName?: string | null;
  /** The sentence an admin reads. Name the thing, not the table. */
  summary: string;
  details?: unknown;
}

/**
 * The actor for anything no human triggered — n8n imports, cron jobs.
 *
 * Recorded as a real entry rather than skipped. "Nobody knows who changed
 * this" and "the importer changed this" are very different answers, and an
 * audit log that quietly omits automated writes is worse than none: it makes
 * the gaps look like nothing happened.
 */
export const SYSTEM_ACTOR = { id: null, name: "System", role: "system" } as const;

interface Actor {
  id: number | null;
  name: string;
  role: string;
}

/**
 * Who to record for a request.
 *
 * Impersonation is resolved back to the REAL person. auth() rewrites
 * session.user.role to "supplier" while an admin is impersonating, so logging
 * the session as-is would attribute an admin's actions to the supplier they
 * were viewing as — which is precisely backwards for an audit trail, and would
 * hide the one kind of access most worth recording. The supplier being
 * impersonated goes in the name so the context is not lost.
 */
export function actorFrom(session: ActivitySession): Actor {
  const id = Number(session.user.id);
  const name = session.user.name || session.user.email || `User ${id}`;

  if (session.impersonating) {
    return {
      id: Number.isInteger(id) ? id : null,
      name: `${name} (impersonating ${session.impersonating.supplierName})`,
      role: "admin",
    };
  }

  return {
    id: Number.isInteger(id) ? id : null,
    name,
    role: session.user.role,
  };
}

/**
 * Record one change.
 *
 * NEVER THROWS. A failed audit write must not fail the action it was
 * describing: the order really was claimed, and turning that into a 500 would
 * mean a logging bug could take down every mutation in the tool. The failure
 * goes to the server console instead, where it is visible in Vercel's logs
 * without being visible to the user mid-task.
 *
 * That is a deliberate trade — it makes the log best-effort rather than
 * guaranteed. The alternative (refuse the action unless it can be logged)
 * needs a transaction spanning both writes, and db.transaction() with an async
 * callback is unsupported on the better-sqlite3 driver, so it would work in
 * production and silently do nothing in local dev. Given the choice between a
 * log that can lose an entry to a database blip and a mechanism that behaves
 * differently in dev than in prod, this takes the former.
 */
export async function logActivity(
  session: ActivitySession | typeof SYSTEM_ACTOR,
  entry: ActivityEntry
): Promise<void> {
  try {
    const actor: Actor =
      "user" in session ? actorFrom(session) : { ...SYSTEM_ACTOR };

    // Resolve the supplier name only when one is needed and wasn't supplied.
    // A snapshot is the point: if the supplier is renamed or removed later,
    // this entry still says who it was at the time.
    let supplierName = entry.supplierName ?? null;
    if (!supplierName && entry.supplierId) {
      const [row] = await db
        .select({ name: suppliers.name, nickname: suppliers.nickname })
        .from(suppliers)
        .where(eq(suppliers.id, entry.supplierId))
        .limit(1);
      supplierName = row?.nickname ?? row?.name ?? null;
    }

    await db.insert(activityLog).values({
      // toISOString, never a now() default — see the column comment in
      // schema.pg.ts. Mixed formats in this column sort wrong, and in a log
      // that means entries appearing in the wrong order.
      createdAt: new Date().toISOString(),
      actorUserId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId != null ? String(entry.entityId) : null,
      orderItemId: entry.orderItemId ?? null,
      supplierId: entry.supplierId ?? null,
      supplierName,
      summary: entry.summary,
      details: entry.details === undefined ? null : JSON.stringify(entry.details),
    });
  } catch (err) {
    console.error("[activity] failed to record", entry.action, err);
  }
}

/**
 * Which of `fields` actually changed, as { field: { from, to } }.
 *
 * Returns null when nothing did, so a caller can skip logging a PATCH that
 * rewrote a row with its own values — a log full of "edited order (no
 * changes)" is a log nobody reads.
 *
 * Compared with Object.is after normalising null and undefined together: a
 * field absent from the update body and a field explicitly set to null both
 * mean "no value" everywhere else in this codebase, and treating them as
 * different would report a change every time a form submitted a blank.
 */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T & string)[]
): Record<string, { from: unknown; to: unknown }> | null {
  const diff: Record<string, { from: unknown; to: unknown }> = {};

  for (const field of fields) {
    if (!(field in after)) continue;
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (!Object.is(from, to)) diff[field] = { from, to };
  }

  return Object.keys(diff).length > 0 ? diff : null;
}
