import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAuthEnabled } from "@/lib/auth-mode";

/**
 * Routes that establish a session, so by definition run before one exists.
 *
 * The login page and the invite landing page both POST here with no session
 * cookie yet. Gating these would make signing in impossible.
 */
const SESSION_BOOTSTRAP_PATHS = ["/api/auth/set-session", "/api/local-session"];

/**
 * Machine routes that carry their own credential in an Authorization: Bearer
 * header — an API key, or CRON_SECRET — and verify it themselves.
 *
 * Being on this list is not on its own enough to skip the gate: the request
 * must also present a bearer header (see isCredentialedMachineRequest). Path
 * alone would let an anonymous request walk into /api/n8n/import untouched.
 *
 * /api/import and /api/po-builder/sync-fabric-data accept either a bearer key
 * or an internal session. Both arms still work: browser callers have a
 * session, machine callers have the header.
 */
const MACHINE_API_PATHS = [
  "/api/n8n",
  "/api/cron",
  "/api/import",
  "/api/po-builder/sync-fabric-colors",
  "/api/po-builder/sync-fabric-data",
  "/api/po-builder/sync-product-fabric-mapping",
];

/** Exact segment match, so /api/importer would not match /api/import. */
function matchesPath(pathname: string, entry: string): boolean {
  return pathname === entry || pathname.startsWith(`${entry}/`);
}

function hasBearerHeader(request: NextRequest): boolean {
  return Boolean(request.headers.get("authorization")?.startsWith("Bearer "));
}

function isCredentialedMachineRequest(
  pathname: string,
  request: NextRequest
): boolean {
  return (
    MACHINE_API_PATHS.some((entry) => matchesPath(pathname, entry)) &&
    hasBearerHeader(request)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths don't need auth.
  //
  // /set-password is where invited suppliers land, and it must be reachable
  // without a session — that is the point of the page. Its Supabase tokens
  // arrive in the URL fragment, which the browser never sends to the server, so
  // gating it here would bounce the invitee to /login and discard the tokens.
  const isPublicPath =
    pathname === "/login" ||
    pathname === "/set-password" ||
    pathname.startsWith("/uploads/");

  const isApiPath = pathname.startsWith("/api/");

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

  // Stage 3: back the per-route require*() checks with a proxy-level gate, so a
  // route that forgets its own check still has a net beneath it.
  //
  // Rolls out log-only. Until AUTH_GATE_API=enforce is set, this branch only
  // reports what it would have refused and hands the request straight through —
  // behaviour is identical to the blanket /api/ exemption it replaces.
  //
  // Note this costs no extra latency: the getUser() round-trip above already
  // ran for /api/ requests under the old exemption, since only the final
  // branch was skipped. hasSession was computed and thrown away.
  if (isApiPath) {
    const exempt =
      SESSION_BOOTSTRAP_PATHS.includes(pathname) ||
      isCredentialedMachineRequest(pathname, request);

    if (!hasSession && !exempt) {
      const enforcing = process.env.AUTH_GATE_API === "enforce";

      // Booleans only — never the bearer token or a cookie value. The
      // user-agent is truncated and stripped of quotes and newlines so a
      // hostile header cannot forge extra log lines.
      const ua = (request.headers.get("user-agent") ?? "")
        .replace(/["\r\n]/g, "")
        .slice(0, 80);
      const detail =
        `${request.method} ${pathname} ` +
        `bearer=${hasBearerHeader(request) ? "yes" : "no"} ` +
        `sb-cookie=${hasSupabaseCookie ? "yes" : "no"} ` +
        `legacy=${legacySessionCookie ? "yes" : "no"} ` +
        `ua="${ua}"`;

      if (enforcing) {
        console.log(`[api-gate] block ${detail}`);
        // 401, never the /login redirect the pages get: fetch() follows a 307,
        // lands on the login page and reports res.ok, so a refused request
        // reads as a successful one. Same trap denyNonAdmin() documents.
        return withRefreshedCookies(
          NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
          response
        );
      }

      console.log(`[api-gate] would-block ${detail}`);
    }

    return response;
  }

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
