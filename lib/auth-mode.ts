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
 * Three independent gates, all of which must hold. The stub is a real
 * authentication bypass, so it is opt-in and fails closed: the danger is not
 * someone enabling it deliberately but a *missing* env var quietly enabling it,
 * which is how "no Supabase config" used to mean "everyone is an admin".
 *
 *   1. NEXT_PUBLIC_ALLOW_DEV_AUTH_STUB=1 — explicit opt-in. Absence disables.
 *   2. !supabaseAuthEnabled — never shadow a real auth system.
 *   3. NODE_ENV !== "production" — Next sets this for every production build,
 *      so the stub is unreachable on any deploy whatever the env vars say.
 *
 * The NEXT_PUBLIC_ prefix is required, not cosmetic: this constant is evaluated
 * in a client component (the login page reads it to choose which sign-in flow
 * to render). A server-only var would be undefined in the browser bundle, so
 * the client would render the production flow while the server ran the stub.
 * Exposing it is harmless — it is a boolean about dev mode, not a credential,
 * and gates 2 and 3 do not depend on it.
 */
export const localAuthEnabled =
  process.env.NEXT_PUBLIC_ALLOW_DEV_AUTH_STUB === "1" &&
  !supabaseAuthEnabled &&
  process.env.NODE_ENV !== "production";
