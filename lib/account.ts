import { createClient } from "@/lib/supabase/server";
import { supabaseAuthEnabled } from "@/lib/auth-mode";

/**
 * The address Supabase Auth will actually accept at the sign-in form, or null.
 *
 * Deliberately not `users.email`. That column is our copy, and the two can
 * drift: an admin editing the address in the Supabase dashboard changes the
 * login without touching this database, and nothing here would notice. Anywhere
 * the answer must be "what do I type to log in", it has to come from Supabase.
 *
 * Two callers depend on that distinction:
 *  - the account page, which shows both and warns when they disagree, so a
 *    drift is visible rather than silent;
 *  - the password route, which re-authenticates with this address. Verifying
 *    against `users.email` would fail for exactly the user who has drifted —
 *    reporting "wrong password" to someone typing the right one.
 *
 * Declines rather than rejects, like supabaseAuthId(): no Supabase configured
 * (the local dev stub), or Supabase unreachable, both return null. Callers
 * decide what that means — the page degrades to showing the ERP address alone,
 * the password route refuses outright.
 */
export async function verifiedSignInEmail(): Promise<string | null> {
  if (!supabaseAuthEnabled) return null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) return null;
    return data.user.email;
  } catch {
    return null;
  }
}
