import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { denyAccountWrite } from "@/lib/permissions";
import { supabaseAuthEnabled } from "@/lib/auth-mode";

/** Matches the invite landing page, so the two never disagree on what's valid. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Change your own password.
 *
 * Nothing here touches this database. `users` has no password column — the
 * credential lives only in Supabase Auth — so there is no second copy to fall
 * out of step with the login. That is the whole reason this route is separate
 * from PATCH /api/account, which writes only local columns.
 *
 * Self-scoping is structural rather than checked. The update runs on the
 * session-bound Supabase client, whose updateUser() acts on the caller's own
 * auth user and takes no id at all: reaching another user's password through
 * this route is not guarded against, it is unrepresentable. The service-role
 * admin API (auth.admin.updateUserById) is what would need guarding, and is
 * avoided for that reason as much as for the fact that
 * SUPABASE_SERVICE_ROLE_KEY is still unset on Vercel.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  const denied = denyAccountWrite(session);
  if (denied) return denied;

  if (!supabaseAuthEnabled) {
    // The local dev stub has no password to change: it signs in on an email
    // alone. Refused rather than faked, so a dev cannot come away believing a
    // password was set on an account that has none.
    return NextResponse.json(
      {
        error:
          "This environment uses the local dev sign-in stub, which has no passwords. Passwords are changed in the Supabase-backed environments.",
      },
      { status: 501 }
    );
  }

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword) {
    return NextResponse.json({ error: "Enter your current password" }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "Your new password must be different from your current one" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // The address to re-authenticate against comes from Supabase, not from
  // users.email. If our copy has drifted, users.email is the one address the
  // sign-in check is guaranteed to reject — and the user would be told their
  // correct password was wrong.
  const { data: me, error: meError } = await supabase.auth.getUser();
  if (meError || !me.user?.email) {
    return NextResponse.json(
      { error: "Your session has expired. Sign in again and retry." },
      { status: 401 }
    );
  }

  // Proof of the current password, on a throwaway client so it cannot disturb
  // the caller's cookies. Supabase does mint a refresh token for this sign-in,
  // which is never persisted (persistSession: false), never returned, and goes
  // out of scope with this request. It cannot be revoked without a scope that
  // would also kill the caller's real session, so it is left to expire unused.
  const verifier = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error: reauthError } = await verifier.auth.signInWithPassword({
    email: me.user.email,
    password: currentPassword,
  });

  if (reauthError) {
    // Not passed through verbatim: Supabase's own rate-limit and lockout
    // messages here are about the throwaway sign-in, not about this form, and
    // would read as nonsense. 403 rather than 401 — the session is fine, the
    // proof is not, and a 401 invites the client to bounce to /login.
    console.warn("[account-password] re-auth failed", reauthError.message);
    return NextResponse.json(
      { error: "That is not your current password" },
      { status: 403 }
    );
  }

  // The write. updateUser() rotates the caller's tokens and @supabase/ssr hands
  // the new ones to cookieStore.set() — legal in a Route Handler, unlike in a
  // Server Component — so they ride back on this response and the user stays
  // signed in. `fp-user-id` holds the auth UUID, which a password change does
  // not alter, so the Stage 2 fallback path stays valid too.
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

  if (updateError) {
    // "Secure password change" (SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION)
    // lands here: it wants a nonce mailed via auth.reauthenticate(), which the
    // sign-in check above does not satisfy. Off by default; named explicitly so
    // that turning it on in the Supabase dashboard produces an answer somebody
    // can act on rather than a raw GoTrue string.
    if (/reauthentication/i.test(updateError.message)) {
      console.error("[account-password] project requires emailed reauthentication", updateError);
      return NextResponse.json(
        {
          error:
            "This Supabase project requires email reauthentication for password changes, which this form does not do yet. Ask an admin to send you a reset link.",
        },
        { status: 501 }
      );
    }

    console.error("[account-password] update failed", updateError);
    return NextResponse.json(
      { error: updateError.message || "Could not change your password" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
