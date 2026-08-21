import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
 * Per-order access check for API routes.
 *
 * Returns a response to hand straight back to the caller, or null when the
 * session may touch this order:
 *
 *   const denied = await denyOrderAccess(session, orderItemId);
 *   if (denied) return denied;
 *
 * This is the rule `GET /api/orders/[id]` already applied inline, extracted so
 * every order route enforces the same one. `/api/*` is exempt from the proxy
 * gate, so a route that omits this check has no other net beneath it.
 *
 * Fails closed: a supplier account with no supplier_id matches no order at all,
 * rather than falling through to an unfiltered result.
 *
 * Internal and admin sessions pass for any existing order — scoping team
 * members to assigned suppliers is not implemented, and there is no assignment
 * model to implement it against yet.
 */
export async function denyOrderAccess(
  session: { user: { role: string; supplierId: string | null } },
  orderItemId: string
): Promise<NextResponse | null> {
  const [order] = await db
    .select({ supplierId: orderItems.supplierId })
    .from(orderItems)
    .where(eq(orderItems.orderItemId, orderItemId))
    .limit(1);

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session.user.role !== "supplier") return null;

  const ownsIt =
    Boolean(session.user.supplierId) &&
    order.supplierId === Number(session.user.supplierId);

  return ownsIt ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
