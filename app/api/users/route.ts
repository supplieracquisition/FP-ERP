import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { asc, ne } from "drizzle-orm";
import { requireInternal, denyUnlessAdmin } from "@/lib/permissions";
import { inviteUser, type InvitableRole } from "@/lib/invite";

/**
 * The team roster. Readable by any internal user — knowing who your colleagues
 * are is coordination, not administration — while every action below is
 * admin-only. The UI hides the action buttons from non-admins, but this is
 * where that boundary is actually enforced.
 */
export async function GET() {
  await requireInternal();
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(ne(users.role, "supplier"))
    .orderBy(asc(users.name));
  return NextResponse.json(rows);
}

/**
 * Create a team account by invitation.
 *
 * This used to insert a `users` row directly, with no auth_id and with the
 * password the form collected thrown away. That row could never sign in —
 * sessions resolve by users.auth_id — and on Postgres the NOT NULL constraint
 * rejected it outright, so the endpoint 500'd. It now goes through the same
 * invite path the supplier portal uses: a real Supabase Auth user, its id
 * stored, and the invitee choosing their own password from the email.
 */
export async function POST(request: NextRequest) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  let body: { name?: unknown; email?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!name || !email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  // Only the two team roles. A supplier login needs a supplier attached to it,
  // which this endpoint has no way to name — those are created from the
  // Suppliers page, and inviteUser() refuses the combination anyway.
  const role: InvitableRole = body.role === "admin" ? "admin" : "internal";

  const result = await inviteUser({ name, email, role, supplierId: null });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, userId: result.userId, invited: result.invited });
}
