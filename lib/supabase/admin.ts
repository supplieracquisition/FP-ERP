import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * The service-role Supabase client, or null when it isn't configured.
 *
 * Built lazily and returned as null rather than constructed at module load.
 * `createClient(url, undefined!)` throws "supabaseKey is required" during
 * import, which would take down every route that transitively imports this
 * file — including ones that never touch admin auth. SUPABASE_SERVICE_ROLE_KEY
 * is still missing from Vercel, so that is the live case, not a hypothetical.
 *
 * Callers must handle null and say plainly what is unset. This key bypasses
 * row-level security: server-side only, never NEXT_PUBLIC_.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  cached = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
