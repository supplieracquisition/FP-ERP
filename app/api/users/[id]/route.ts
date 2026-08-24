import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { denyUnlessAdmin } from "@/lib/permissions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseAuthEnabled } from "@/lib/auth-mode";

/**
 * Send a password reset email.
 *
 * This used to accept a password, consume the request body, write nothing, and
 * return { ok: true } — the UI reported "Password updated" for an operation
 * that had never happened. It now sends a real Supabase recovery email.
 *
 * Emailed reset rather than an admin-chosen password, for three reasons: the
 * invitee is the only one who should ever know their password, /set-password
 * already handles a `recovery` link so no new page is needed, and
 * resetPasswordForEmail() runs on the anon key — so this keeps working even
 * while SUPABASE_SERVICE_ROLE_KEY is missing, which invites do not.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const { id } = await params;

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, Number(id)))
    .limit(1);

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!supabaseAuthEnabled) {
    // Refused rather than faked. The local stub signs in on an email alone and
    // has no password to reset; reporting success here is the bug this route
    // was written to remove.
    return NextResponse.json(
      {
        error:
          "This environment uses the local dev sign-in stub, which has no passwords.",
      },
      { status: 501 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is not set, so the reset link has nowhere to point." },
      { status: 500 }
    );
  }

  // A throwaway client: this must not touch the admin's own session cookies.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${appUrl.replace(/\/$/, "")}/set-password`,
  });

  if (error) {
    console.error("[users] password reset failed", error);
    return NextResponse.json(
      { error: `Supabase rejected the reset: ${error.message}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, sentTo: user.email });
}

/**
 * Delete a team account.
 *
 * Removes the local row first: that is what actually revokes access, since
 * auth() resolves sessions by matching users.auth_id and a missing row means no
 * session. The Supabase auth user is then cleaned up on a best-effort basis.
 *
 * That order matters. Local-first means a failed cleanup leaves someone locked
 * out with a stranded auth user — recoverable, and the invite path already
 * reports that case by name. The reverse order would leave a row pointing at an
 * auth user that no longer exists.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;

  const session = await auth();
  const { id } = await params;
  const targetId = Number(id);

  const [user] = await db
    .select({ id: users.id, name: users.name, role: users.role, authId: users.authId })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Deleting yourself is an instant self-lockout with nothing to undo it from.
  if (targetId === Number(session.user.id)) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 }
    );
  }

  // Deleting the last admin would lock the organisation out of every
  // admin-only route, including this one, with nobody left who could create a
  // replacement.
  //
  // Unreachable as the code stands, and kept deliberately. The caller is
  // necessarily an admin, and the guard above already stopped them deleting
  // themselves — so a second, distinct admin exists by construction and the
  // count below cannot be zero. It becomes live the moment that stops holding:
  // a role-demotion endpoint, a bulk delete, or any relaxation of the
  // self-delete rule. Cheap to keep, and the failure it prevents is
  // unrecoverable without database access.
  if (user.role === "admin") {
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

  await db.delete(users).where(eq(users.id, targetId));

  // Best effort, and reported rather than thrown: access is already revoked by
  // the delete above. A stranded auth user only matters later, when re-inviting
  // that address returns "already registered" — so say so now.
  let authDeleted: boolean | null = null;
  if (user.authId) {
    const supabaseAdmin = getSupabaseAdmin();
    if (supabaseAdmin) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user.authId);
      authDeleted = !error;
      if (error) console.error("[users] auth user not deleted", error);
    } else {
      authDeleted = false;
    }
  }

  return NextResponse.json({ ok: true, authDeleted });
}
