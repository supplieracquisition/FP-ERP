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

/** Every role an account can be created with. */
export type InvitableRole = "admin" | "internal" | "supplier";

export type InviteInput = {
  name: string;
  email: string;
  role: InvitableRole;
  /** Required when role is "supplier"; must be null for internal and admin. */
  supplierId: number | null;
};

/**
 * Create an account by invitation, for any role.
 *
 * The account this produces can actually sign in, which a plain insert into
 * `users` cannot: sessions resolve by users.auth_id, so a row without one is
 * unreachable by auth() — and on Postgres, where auth_id is NOT NULL, the
 * insert is rejected outright. Both the supplier flow and the team flow have
 * had that bug; this is the one path that does it correctly, which is why they
 * now share it rather than each growing their own copy.
 *
 * No password is collected anywhere. The invitee sets their own from the email,
 * so a password never transits this app and nothing here stores one.
 *
 * Never throws for an expected condition; returns a status + message the route
 * can hand straight back so the admin sees why it failed.
 */
export async function inviteUser({
  name,
  email,
  role,
  supplierId,
}: InviteInput): Promise<InviteResult> {
  const cleanName = name?.trim();
  const cleanEmail = email?.trim().toLowerCase();

  if (!cleanName || !cleanEmail) {
    return { ok: false, status: 400, error: "Login name and email are both required" };
  }

  // A supplier login is meaningless without a supplier, and an internal login
  // must not carry one. The scoping code branches on role before it reads
  // supplier_id, so a stray value here would not grant access today — it would
  // just be wrong data waiting to mislead whoever reads the column next.
  const isSupplier = role === "supplier";
  if (isSupplier && !supplierId) {
    return {
      ok: false,
      status: 400,
      error: "A supplier login must be attached to a supplier",
    };
  }
  if (!isSupplier && supplierId != null) {
    return {
      ok: false,
      status: 400,
      error: "An internal login cannot be attached to a supplier",
    };
  }

  const linkedSupplierId = isSupplier ? supplierId : null;

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
      .values({ name: cleanName, email: cleanEmail, role, supplierId: linkedSupplierId })
      .returning({ id: users.id });
    return { ok: true, status: 200, userId: created.id, invited: false };
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return {
      ok: false,
      status: 503,
      // Stays neutral about what else happened: this helper runs while creating
      // a supplier, from "Invite login" on one that already exists, and from
      // the team page. Each caller adds its own context — the supplier create
      // path, for instance, notes that the supplier was still saved.
      error:
        "Logins need SUPABASE_SERVICE_ROLE_KEY, which is not set in this environment.",
    };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return {
      ok: false,
      status: 500,
      error: "NEXT_PUBLIC_APP_URL is not set, so the invite has nowhere to send them.",
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
    // something to do silently behind an "Add user" button.
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
        role,
        supplierId: linkedSupplierId,
      })
      .returning({ id: users.id });

    return { ok: true, status: 200, userId: created.id, invited: true };
  } catch (dbError) {
    // The invite is already out. Without this the auth user is stranded:
    // invisible in the ERP, and blocking every retry for that address with
    // "already registered".
    await supabaseAdmin.auth.admin.deleteUser(data.user.id).catch(() => {});
    console.error("inviteUser: rolled back auth user after insert failed", dbError);
    return {
      ok: false,
      status: 500,
      error: "Could not save the login. The invite was cancelled — try again.",
    };
  }
}

/**
 * Invite a supplier portal login.
 *
 * A thin wrapper rather than a second implementation, so the supplier call
 * sites keep their narrower signature — a supplier login always has a supplier
 * — while the mechanism stays in one place.
 */
export async function inviteSupplierUser({
  supplierId,
  name,
  email,
}: {
  supplierId: number;
  name: string;
  email: string;
}): Promise<InviteResult> {
  return inviteUser({ name, email, role: "supplier", supplierId });
}
