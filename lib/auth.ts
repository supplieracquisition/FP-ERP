import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users, suppliers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { localAuthEnabled, supabaseAuthEnabled } from "@/lib/auth-mode";

export type AppSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    supplierId: string | null;
  };
  impersonating?: {
    supplierId: number;
    supplierName: string;
  };
};

async function applyImpersonation(session: AppSession): Promise<AppSession> {
  if (session.user.role !== "admin") return session;
  const cookieStore = await cookies();
  const supplierIdStr = cookieStore.get("fp_impersonate")?.value;
  if (!supplierIdStr) return session;
  const supplierId = Number(supplierIdStr);
  if (!supplierId) return session;

  const [supplier] = await db
    .select({ id: suppliers.id, name: suppliers.name, nickname: suppliers.nickname })
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!supplier) return session;

  return {
    user: { ...session.user, role: "supplier", supplierId: String(supplierId) },
    impersonating: { supplierId, supplierName: supplier.nickname ?? supplier.name },
  };
}

/**
 * Build a session from a Supabase auth UUID.
 *
 * Both auth paths converge here. The `fp-user-id` cookie stores the very same
 * UUID the Supabase session carries, and both are matched against
 * `users.auth_id` — same key, same column. That is what makes the fallback
 * safe: the two paths cannot disagree about who you are, and no user records
 * need migrating between them.
 */
async function sessionForAuthId(authId: string): Promise<AppSession | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.authId, authId))
    .limit(1);

  if (!user) return null;

  return {
    user: {
      id: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role,
      supplierId: user.supplierId ? String(user.supplierId) : null,
    },
  };
}

/**
 * The verified Supabase session's user id, or null.
 *
 * Verified via getUser(), which checks with the auth server rather than
 * trusting the cookie's contents.
 *
 * This declines, it never rejects: no session, misconfigured env, or Supabase
 * being unreachable all return null so auth() falls through to `fp-user-id`.
 * It must never throw — auth() runs on nearly every request, so an exception
 * escaping here would lock out every user at once.
 */
async function supabaseAuthId(): Promise<string | null> {
  if (!supabaseAuthEnabled) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * TEMPORARY (Stage 2): record which path resolved the session.
 *
 * This is the evidence gate for Stage 6. `fp-user-id` may only be removed once
 * the logs show nothing still resolving through it — a measurement rather than
 * a guess about who might still hold an old cookie. Grep production logs for
 * `[auth-path]`.
 *
 * Deliberately logs no email or auth UUID: the internal user id is enough to
 * tell the paths apart, and these lines go to a third-party log drain.
 *
 * Delete this together with the fp-user-id fallback.
 */
function resolved(
  path: "supabase" | "fp-user-id" | "local-stub",
  session: AppSession
): Promise<AppSession> {
  console.log(`[auth-path] ${path} user=${session.user.id} role=${session.user.role}`);
  return applyImpersonation(session);
}

/**
 * Wrapped in cache() so it resolves once per request: requireAuth() runs it on
 * nearly every render, and the Supabase check is a network round-trip.
 */
export const auth = cache(async (): Promise<AppSession | null> => {
  const cookieStore = await cookies();

  // Local dev stub (no Supabase env, non-production): cookie-selected user
  // (default: id=1). Unreachable on any deploy — see lib/auth-mode.ts.
  if (localAuthEnabled) {
    const localUserIdStr = cookieStore.get("fp_local_user_id")?.value;
    const userId = localUserIdStr ? Number(localUserIdStr) : 1;
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;
    const session: AppSession = {
      user: {
        id: String(user.id),
        email: user.email,
        name: user.name,
        role: user.role,
        supplierId: user.supplierId ? String(user.supplierId) : null,
      },
    };
    return resolved("local-stub", session);
  }

  // Preferred: the real, verified, refreshing Supabase session.
  const verifiedAuthId = await supabaseAuthId();
  if (verifiedAuthId) {
    const session = await sessionForAuthId(verifiedAuthId);
    if (session) return resolved("supabase", session);
    // A valid Supabase user with no account here. Fall through rather than
    // reject: during Stage 2 an existing fp-user-id cookie must still work.
  }

  // Fallback: the fp-user-id cookie. Kept until the Supabase path is proven in
  // production, so this stage cannot lock anyone out. Removed in Stage 6.
  const userIdCookie = cookieStore.get("fp-user-id")?.value;
  if (!userIdCookie) return null;

  const session = await sessionForAuthId(userIdCookie);
  if (!session) return null;

  return resolved("fp-user-id", session);
});
