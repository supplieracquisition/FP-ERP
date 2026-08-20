/**
 * Which auth system is in play.
 *
 * This used to be inferred from DATABASE_URL, which conflated two unrelated
 * questions — "which database" and "which auth system" — and the call sites
 * had drifted apart: the login page keyed off NEXT_PUBLIC_SUPABASE_URL while
 * /api/local-session keyed off DATABASE_URL, so with a DATABASE_URL set and no
 * Supabase env the login page called an endpoint that refused to answer.
 *
 * Database selection still keys off DATABASE_URL (see lib/db/index.ts). Auth
 * mode keys off the Supabase env only. Keeping them independent is what lets
 * you run real Supabase auth against a non-production copy of the database.
 */

export const supabaseAuthEnabled = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * The local stub: email-only sign-in, any password, plus the quick-switch
 * user picker on the login page.
 *
 * The NODE_ENV check is a safety interlock, not a convenience. The stub path
 * in auth() falls back to user id 1 — an admin — when no user cookie is set.
 * Gating only on `!supabaseAuthEnabled` would mean a deploy that lost its
 * Supabase env vars silently promoted every anonymous visitor to admin. Next
 * sets NODE_ENV to "production" for every production build, so this interlock
 * makes the stub unreachable on any deploy regardless of env var config.
 */
export const localAuthEnabled =
  !supabaseAuthEnabled && process.env.NODE_ENV !== "production";
