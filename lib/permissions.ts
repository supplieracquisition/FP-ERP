import { auth, type AppSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, suppliers } from "@/lib/db/schema";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireInternal() {
  const session = await requireAuth();
  if (session.user.role === "supplier") redirect("/supplier/orders");
  return session;
}


export async function requireAdmin() {
  const session = await requireAuth();
  if (session.user.role !== "admin") redirect("/orders");
  return session;
}

export async function requireSupplier() {
  const session = await requireAuth();
  if (session.user.role !== "supplier") redirect("/orders");
  return session as typeof session & { user: { supplierId: string } };
}

export function isInternal(role: string) {
  return role === "admin" || role === "internal";
}

/**
 * Admin check for API routes.
 *
 * requireAdmin() cannot be used from a route handler: it signals by calling
 * redirect(), which becomes a 307 rather than a status the caller can act on.
 * fetch() follows the redirect, lands on a page, and reports res.ok — so a
 * refused request reads as a successful one. That is exactly wrong for the
 * destructive endpoints this guards.
 */
export async function denyNonAdmin(session: {
  user: { role: string };
}): Promise<NextResponse | null> {
  if (session.user.role === "admin") return null;
  return NextResponse.json({ error: "Admin only" }, { status: 403 });
}

/**
 * Supplier check for the API routes a supplier writes through.
 *
 * requireSupplier() cannot be used here for the reason denyNonAdmin() gives
 * above: it redirects, and a redirect reads as success to fetch().
 *
 * Returns null when the session may write its own supplier record. Callers
 * then take the supplier id from `session.user.supplierId` and never from the
 * URL or body — a supplier write route that accepts an id from the request
 * lets one supplier write another's record, which is why these routes carry no
 * [id] segment at all.
 *
 * Fails closed four ways:
 *  - not a supplier account: refused
 *  - a supplier account with no supplier_id: refused, never treated as "all"
 *  - an admin previewing a supplier via impersonation: refused. The preview
 *    exists to see what the supplier sees; writing through it would file
 *    changes and send mail under the supplier's name with no record that an
 *    admin was behind it. Admins edit supplier records through the admin UI.
 */
export function denySupplierWrite(session: AppSession | null): NextResponse | null {
  const refuse = (error: string, status = 403) =>
    NextResponse.json({ error }, { status });

  if (!session?.user) return refuse("Not signed in", 401);
  if (session.impersonating)
    return refuse("Read-only while previewing a supplier account");
  if (session.user.role !== "supplier") return refuse("Supplier only");
  if (!session.user.supplierId) return refuse("No supplier linked to this account");

  return null;
}

/**
 * The whole admin gate for a route handler: session, then role.
 *
 * denyNonAdmin() above assumes a session and would throw on null, and its usual
 * partner requireAuth() redirects — the 307-reads-as-success trap again, this
 * time on the no-session branch. This pairs the two safely so that every
 * refusal, for either reason, comes back as a status the caller can act on.
 */
export async function denyUnlessAdmin(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return denyNonAdmin(session);
}

/**
 * The whole admin gate for a route handler, returning the session so the
 * caller does not have to fetch it twice.
 *
 * denyUnlessAdmin() above is the same gate for handlers that need no session.
 * This exists for the ones that do — an admin route that writes an audit entry
 * needs to say who acted — and it is the shape to reach for rather than
 * requireAdmin(), which signals by redirect(): a 307 that fetch() follows to a
 * page and reports as res.ok, so a refused request reads as a successful one.
 * The API-keys screen sat behind exactly that and silently did nothing for a
 * non-admin instead of refusing.
 *
 * Returned as a discriminated union, like internalSession(), so that
 * `if (denied) return denied;` narrows `session` to non-null with no non-null
 * assertion at the call site.
 *
 * Impersonation is refused explicitly. applyImpersonation() rewrites `role` to
 * "supplier" while leaving `user.id` as the ADMIN's, so the role check below
 * happens to catch it too; this states the reason so neither check reads as
 * redundant.
 */
export async function adminSession(): Promise<
  { session: AppSession; denied: null } | { session: null; denied: NextResponse }
> {
  const refuse = (error: string, status = 403) => ({
    session: null as null,
    denied: NextResponse.json({ error }, { status }),
  });

  const session = await auth();
  if (!session?.user) return refuse("Not signed in", 401);
  if (session.impersonating)
    return refuse("Read-only while previewing a supplier account");
  if (session.user.role !== "admin") return refuse("Admin only");

  return { session, denied: null };
}

/**
 * Self-service check for the routes an internal user edits their OWN account
 * through.
 *
 * requireInternal() cannot be used here for the reason denyNonAdmin() gives
 * above: it redirects, and a redirect reads as success to fetch().
 *
 * Returns null when the session may edit its own user row. Callers then take
 * the user id from `session.user.id` and never from the URL or body — which is
 * why these routes carry no [id] segment at all. Editing another team member is
 * an admin action and belongs in the admin UI, not here.
 *
 * The impersonation refusal is not decoration. applyImpersonation() rewrites
 * `role` to "supplier" but leaves `user.id` as the ADMIN's id, so an
 * unguarded self-service route reached while previewing a supplier would edit
 * the admin's own account behind a page claiming to be the supplier's. The role
 * check below happens to catch that too; this states the reason so neither
 * check can be removed as redundant.
 */
export function denyAccountWrite(session: AppSession | null): NextResponse | null {
  const refuse = (error: string, status = 403) =>
    NextResponse.json({ error }, { status });

  if (!session?.user) return refuse("Not signed in", 401);
  if (session.impersonating)
    return refuse("Read-only while previewing a supplier account");
  if (!isInternal(session.user.role)) return refuse("Internal users only");

  return null;
}

/**
 * The whole internal gate for a route handler: session, then role, returning
 * the session so the caller does not have to fetch it twice.
 *
 * requireInternal() cannot be used from a route handler for the reason
 * denyNonAdmin() gives above: it redirects, and a redirect reads as success to
 * fetch(). A claim endpoint that "succeeded" by landing on a login page would
 * be a particularly bad way to find that out.
 *
 * Returned as a discriminated union rather than NextResponse | null so that
 * `if (denied) return denied;` narrows `session` to non-null for the rest of
 * the handler, with no non-null assertion at the call site.
 *
 * Impersonation is refused explicitly. applyImpersonation() rewrites `role` to
 * "supplier" while leaving `user.id` as the ADMIN's, so a claim taken through
 * a supplier preview would record the admin as processor behind a UI claiming
 * to be the supplier. The role check below happens to catch that too; this
 * states the reason so neither check reads as redundant.
 */
export async function internalSession(): Promise<
  { session: AppSession; denied: null } | { session: null; denied: NextResponse }
> {
  const refuse = (error: string, status = 403) => ({
    session: null as null,
    denied: NextResponse.json({ error }, { status }),
  });

  const session = await auth();
  if (!session?.user) return refuse("Not signed in", 401);
  if (session.impersonating)
    return refuse("Read-only while previewing a supplier account");
  if (!isInternal(session.user.role)) return refuse("Internal users only");

  return { session, denied: null };
}

/** The session shape every scoping decision below reads from. */
type ScopeSession = {
  user: { id: string; role: string; supplierId: string | null };
};

/**
 * The suppliers an internal user handles: the ones they are POC of.
 *
 * This is the single seam the whole feature turns on. Temporary coverage —
 * holding someone else's suppliers for a period without permanent
 * reassignment — lands by unioning its supplier ids into the list returned
 * here. Every caller below (list query, per-order check, bulk writes) then
 * inherits it with no edit of its own, so keep this function about nothing
 * except "which suppliers count as this user's right now".
 */
export async function scopeSupplierIds(session: ScopeSession): Promise<number[]> {
  const rows = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.pocUserId, Number(session.user.id)));

  return rows.map((r) => r.id);
}

/**
 * The order-visibility filter for a session, as a WHERE fragment.
 *
 * undefined means "no filter". Every other branch returns a real restriction,
 * so a caller that forgets to handle undefined over-filters rather than
 * under-filters.
 *
 * THE INTERNAL TEAM SEES EVERY ORDER. Admin and ordinary internal users are
 * the same thing here, deliberately — this is the one line that decides it.
 *
 * It used to be POC-scoped: an internal user saw orders for the suppliers they
 * were POC of, plus the unassigned pool, and nothing else. That was removed on
 * request (2026-10-18). The team is small, everyone covers for everyone, and
 * the scoping mostly produced orders that existed but could not be found by
 * the person looking for them — including, routinely, an order somebody had
 * just imported themselves.
 *
 * What that costs, stated plainly so it is a choice and not a surprise: there
 * is no longer any per-order boundary between internal users. Anyone internal
 * can read, edit, claim and process any order in the tool. poc_user_id still
 * records who HANDLES a supplier and still drives the account views; it just
 * no longer limits what anyone can see.
 *
 * Supplier scoping is untouched and still fails closed: a supplier sees their
 * own orders, and a supplier account with no supplier_id matches nothing.
 * To put the team boundary back, restore the pocIds branch here and the
 * matching one in denyOrderAccess below — they must change together.
 */
export async function orderScope(session: ScopeSession): Promise<SQL | undefined> {
  if (session.user.role === "supplier") {
    return session.user.supplierId
      ? eq(orderItems.supplierId, Number(session.user.supplierId))
      : sql`1 = 0`;
  }

  // Admin and internal alike.
  return undefined;
}

/**
 * Per-order access check for API routes.
 *
 * Returns a response to hand straight back to the caller, or null when the
 * session may touch this order:
 *
 *   const denied = await denyOrderAccess(session, orderItemId);
 *   if (denied) return denied;
 *
 * `/api/*` is exempt from the proxy gate, so a route that omits this check has
 * no other net beneath it.
 *
 * This is the row-level twin of orderScope() and must agree with it: an order
 * the list query hides is an order this rejects. The two are written out
 * separately because one runs in SQL over many rows and the other in TS over
 * one, but they encode the same rule — change them together.
 */
export async function denyOrderAccess(
  session: ScopeSession,
  orderItemId: string
): Promise<NextResponse | null> {
  const [order] = await db
    .select({
      supplierId: orderItems.supplierId,
      nominatedSupplierId: orderItems.nominatedSupplierId,
    })
    .from(orderItems)
    .where(eq(orderItems.orderItemId, orderItemId))
    .limit(1);

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const forbidden = NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (session.user.role === "supplier") {
    const ownsIt =
      Boolean(session.user.supplierId) &&
      order.supplierId === Number(session.user.supplierId);
    return ownsIt ? null : forbidden;
  }

  // Internal, admin or not: every order is reachable. The row-level twin of
  // orderScope() returning undefined above — keep the two in step.
  return null;
}

/**
 * Scope check for the bulk writes that take an array of ids.
 *
 * Counts how many of the submitted rows the session can actually reach and
 * refuses the whole request unless that is all of them — a partial write here
 * would silently edit some orders and skip others with a 200, which reads as
 * success. Ids that do not exist also fail the count, deliberately: the caller
 * asked to write rows that cannot be written.
 */
async function denyIdsOutOfScope(
  session: ScopeSession,
  keyed: SQL,
  expected: number
): Promise<NextResponse | null> {
  const scope = await orderScope(session);
  const where = scope ? and(keyed, scope) : keyed;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orderItems)
    .where(where);

  if (Number(count) !== expected) {
    return NextResponse.json(
      { error: "One or more of those orders are not yours to change" },
      { status: 403 }
    );
  }

  return null;
}

/** Bulk scope check keyed on the numeric order_items.id. */
export async function denyOrderRowIds(
  session: ScopeSession,
  ids: number[]
): Promise<NextResponse | null> {
  const unique = [...new Set(ids)];
  return denyIdsOutOfScope(session, inArray(orderItems.id, unique), unique.length);
}

/** Bulk scope check keyed on the text order_items.order_item_id. */
export async function denyOrderItemIds(
  session: ScopeSession,
  orderItemIds: string[]
): Promise<NextResponse | null> {
  const unique = [...new Set(orderItemIds)];
  return denyIdsOutOfScope(
    session,
    inArray(orderItems.orderItemId, unique),
    unique.length
  );
}
