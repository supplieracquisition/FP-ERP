import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { localAuthEnabled } from "@/lib/auth-mode";

/**
 * Flat rather than a discriminated union on `ok`: this project compiles with
 * strict: false, and without strictNullChecks TypeScript will not narrow a
 * union by its boolean tag — every caller would see errors on both branches.
 */
export type InviteResult = {
  ok: boolean;
  /** HTTP status to hand back; 200 on success. */
  status: number;
  error?: string;
  userId?: number;
  /** false when a local dev account was made instead of sending an invite. */
  invited?: boolean;
};

export type InviteInput = {
  supplierId: number;
  name: string;
  email: string;
};

/**
 * Create a supplier portal account by invitation.
 *
 * The account this produces can actually sign in, which the previous
 * implementation's could not: it inserted a users row with no auth_id, so the
 * row was rejected outright on Postgres (auth_id is NOT NULL) and, where it did
 * insert, auth() had nothing to match it against — sessions resolve by
 * users.auth_id. It also collected a password and discarded it. The auth_id
 * here comes from Supabase, and the supplier sets their own password from the
 * invite email.
 *
 * Never throws for an expected condition; returns a status + message the route
 * can hand straight back so the admin sees why it failed.
 */
export async function inviteSupplierUser({
  supplierId,
  name,
  email,
}: InviteInput): Promise<InviteResult> {
  const cleanName = name?.trim();
  const cleanEmail = email?.trim().toLowerCase();

  if (!cleanName || !cleanEmail) {
    return { ok: false, status: 400, error: "Login name and email are both required" };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, cleanEmail))
    .limit(1);

  if (existing.length > 0) {
    return { ok: false, status: 409, error: "A user with this email already exists" };
  }

  // Local stub mode has no Supabase to invite through. auth() resolves the stub
  // by users.id, so a row with a null auth_id is a usable dev account — and is
  // the only account this mode can make. Unreachable on any deploy: see
  // lib/auth-mode.ts.
  if (localAuthEnabled) {
    const [created] = await db
      .insert(users)
      .values({ name: cleanName, email: cleanEmail, role: "supplier", supplierId })
      .returning({ id: users.id });
    return { ok: true, status: 200, userId: created.id, invited: false };
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return {
      ok: false,
      status: 503,
      // Stays neutral about what else happened: this helper is called both
      // while creating a supplier and from "Invite login" on one that already
      // exists. The create path adds its own "supplier was still saved" note.
      error:
        "Supplier logins need SUPABASE_SERVICE_ROLE_KEY, which is not set in this environment.",
    };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return {
      ok: false,
      status: 500,
      error: "NEXT_PUBLIC_APP_URL is not set, so the invite has nowhere to send the supplier.",
    };
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail, {
    redirectTo: `${appUrl.replace(/\/$/, "")}/set-password`,
    data: { name: cleanName },
  });

  if (error || !data?.user) {
    // The common case: a Supabase auth user exists for this address but has no
    // row here (a deleted ERP user, or an address used by another environment
    // sharing the auth project). Linking the two is a deliberate act, not
    // something to do silently behind an "Add supplier" button.
    const alreadyRegistered = /already.*registered|already exists/i.test(error?.message ?? "");
    return {
      ok: false,
      status: alreadyRegistered ? 409 : 502,
      error: alreadyRegistered
        ? "This email already has a Supabase login but no account here. Link or remove it in Supabase first."
        : `Supabase rejected the invite: ${error?.message ?? "unknown error"}`,
    };
  }

  try {
    const [created] = await db
      .insert(users)
      .values({
        authId: data.user.id,
        name: cleanName,
        email: cleanEmail,
        role: "supplier",
        supplierId,
      })
      .returning({ id: users.id });

    return { ok: true, status: 200, userId: created.id, invited: true };
  } catch (dbError) {
    // The invite is already out. Without this the auth user is stranded:
    // invisible in the ERP, and blocking every retry for that address with
    // "already registered".
    await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => {});
    console.error("inviteSupplierUser: rolled back auth user after insert failed", dbError);
    return {
      ok: false,
      status: 500,
      error: "Could not save the login. The invite was cancelled — try again.",
    };
  }
}
