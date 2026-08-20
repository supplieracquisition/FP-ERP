import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAuthEnabled } from "@/lib/auth-mode";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths don't need auth
  const isPublicPath =
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/uploads/");

  // The response that carries any refreshed auth cookies. setAll() below
  // replaces it, so every return path must use this variable rather than a
  // freshly built response, or the refreshed cookies are silently dropped.
  let response = NextResponse.next({ request });

  // Only worth a round-trip when there is actually a session to verify.
  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));

  let hasSupabaseSession = false;

  if (supabaseAuthEnabled && hasSupabaseCookie) {
    try {
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) =>
                request.cookies.set(name, value)
              );
              response = NextResponse.next({ request });
              cookiesToSet.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options)
              );
            },
          },
        }
      );

      // getUser() is what refreshes an expired access token — the refreshed
      // cookies arrive via setAll() above. Without this call the session
      // would quietly expire and log everyone out an hour after signing in.
      const { data, error } = await supabase.auth.getUser();
      hasSupabaseSession = !error && !!data.user;
    } catch {
      // Never block a request because Supabase is unreachable. Falling through
      // leaves the fp-user-id cookie below as the way in.
      hasSupabaseSession = false;
    }
  }

  // Fallback recognised until Stage 6 removes it (local SQLite: fp_local_user_id).
  const legacySessionCookie =
    request.cookies.get("fp-user-id") || request.cookies.get("fp_local_user_id");

  const hasSession = hasSupabaseSession || Boolean(legacySessionCookie);

  if (!hasSession && !isPublicPath) {
    // No session, redirect to login
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return withRefreshedCookies(NextResponse.redirect(url), response);
  }

  if (hasSession && pathname === "/login") {
    // Already logged in, redirect to orders
    const url = request.nextUrl.clone();
    url.pathname = "/orders";
    return withRefreshedCookies(NextResponse.redirect(url), response);
  }

  return response;
}

/**
 * Carry refreshed auth cookies onto a redirect.
 *
 * A redirect built from scratch does not inherit the Set-Cookie headers the
 * refresh produced, so without this a refresh that coincides with a redirect
 * is lost and the stale token gets retried on the next request.
 */
function withRefreshedCookies(
  redirect: NextResponse,
  carrying: NextResponse
): NextResponse {
  carrying.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
