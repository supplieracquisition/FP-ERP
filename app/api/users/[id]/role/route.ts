import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { denyUnlessAdmin } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

/**
 * The two roles this endpoint may set.
 *
 * "supplier" is deliberately absent. A supplier login is only meaningful with a
 * supplier record attached to it — denySupplierWrite() refuses a supplier
 * session whose supplier_id is null, and orderScope() matches it against no
 * rows at all — and this route has no way to name which supplier that would be.
 * Supplier accounts are created from the Suppliers page, where the link is made.
 */
const TEAM_ROLES = ["admin", "internal"] as const;
type TeamRole = (typeof TEAM_ROLES)[number];

function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);
}

/**
 * Change a team member's role.
 *
 * Its own route rather than a field on PATCH /api/users/[id], because that verb
 * on that path already means "send this person a password reset" — it takes no
 * body and acts on the bare request. Folding a second, unrelated action into it
 * by sniffing for a body would make a no-body reset request and a malformed
 * role request indistinguishable.
 *
 * The role is the whole permission model: isInternal() and orderScope() read it
 * on every request, resolved from the database rather than from anything in the
 * cookie (see sessionForAuthId in lib/auth.ts). So a change here takes effect on
 * the target's very next request — they do not sign out and back in, and a
 * demotion cannot be outrun by an already-open tab.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const session = await auth();
  const { id } = await params;
  const targetId = Number(id);

  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  let body: { role?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isTeamRole(body?.role)) {
    return NextResponse.json(
      { error: `role must be one of: ${TEAM_ROLES.join(", ")}` },
      { status: 400 }
    );
  }
  const role: TeamRole = body.role;

  const [user] = await db
    .select({ id: users.id, name: users.name, role: users.role, supplierId: users.supplierId })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Promoting a supplier login to a team role would be a privilege escalation
  // with no way back through this endpoint — "supplier" is not settable here, so
  // the account could not be returned to what it was. It would also leave
  // supplier_id populated on an internal user, a combination nothing else in the
  // codebase expects. Suppliers are not team members; refuse outright.
  if (user.role === "supplier" || user.supplierId !== null) {
    return NextResponse.json(
      { error: "This is a supplier account. Supplier access is managed from the Suppliers page." },
      { status: 400 }
    );
  }

  // Demoting yourself is an instant self-lockout: the next request resolves you
  // as internal, every admin-only route — including this one — starts refusing
  // you, and there may be nobody else who can put it back.
  if (targetId === Number(session!.user.id)) {
    return NextResponse.json(
      { error: "You cannot change your own role. Ask another admin." },
      { status: 400 }
    );
  }

  // Demoting the last admin would lock the organisation out of every admin-only
  // route with nobody left who could grant the role back.
  //
  // Unreachable as the code stands, and kept for the same reason the twin guard
  // in DELETE /api/users/[id] is: the caller is necessarily an admin and cannot
  // be the target, so a second admin exists by construction. It goes live the
  // moment that stops holding — if self-demotion is ever allowed, or a bulk role
  // edit lands. Cheap to keep; the failure it prevents needs database access to
  // undo.
  if (user.role === "admin" && role !== "admin") {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "admin"), ne(users.id, targetId)));

    if (Number(count) === 0) {
      return NextResponse.json(
        { error: "This is the last admin account. Promote someone else first." },
        { status: 400 }
      );
    }
  }

  if (user.role === role) {
    return NextResponse.json({ ok: true, role, unchanged: true });
  }

  await db.update(users).set({ role }).where(eq(users.id, targetId));

  console.log(
    `[users] role change by=${session!.user.id} target=${targetId} ${user.role} -> ${role}`
  );

  await logActivity(session!, {
    action: "user.role",
    entityType: "user",
    entityId: targetId,
    summary: `Changed ${user.name}'s role from ${user.role} to ${role}`,
    details: { from: user.role, to: role },
  });

  return NextResponse.json({ ok: true, role });
}
