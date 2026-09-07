/**
 * What the Supabase auth round-trip costs per request.
 *
 *   npx tsx scripts/loadtest/authcost.ts
 *
 * WHY THIS EXISTS INSTEAD OF PHASE 6
 *
 * Phase 6 was meant to measure this properly, by driving real logged-in
 * sessions. It cannot be run from here: production has `disable_signup: true`,
 * so the anon key cannot create an auth user, and SUPABASE_SERVICE_ROLE_KEY is
 * absent from every env file, so the admin API cannot either. Minting a real
 * session needs a password or a browser-captured cookie, neither of which this
 * process has.
 *
 * So this measures the same thing one step removed, and the difference matters
 * when reading the number.
 *
 * HOW
 *
 * proxy.ts calls getUser() whenever ANY cookie whose name starts with `sb-` is
 * present, and lib/auth.ts calls it again when resolving the session. Both are
 * network calls to the Supabase auth server. The `fp-user-id` path this
 * harness has used all along carries no `sb-` cookie at all, so it skips both —
 * which is exactly why every number in the load test is a floor rather than
 * what a real user experiences.
 *
 * Sending a valid `fp-user-id` PLUS a syntactically well-formed but expired
 * `sb-` cookie forces both round trips to happen, then fails them, and the
 * request still succeeds via the fp-user-id fallback. The delta between the two
 * cohorts is the auth round-trip cost.
 *
 * WHAT THIS IS NOT
 *
 * A failed token refresh is not byte-identical to a successful getUser(). The
 * network shape is the same — one request to the auth server, same host, same
 * region — but the server does different work. Treat the result as the right
 * order of magnitude, not a precise figure. A real-session measurement still
 * needs a browser cookie; see the README.
 */

import postgres from "postgres";
import crypto from "node:crypto";

const BASE = process.env.LOADTEST_BASE_URL;
const DB = process.env.LOADTEST_DATABASE_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ITERATIONS = Number(process.env.AUTHCOST_ITERATIONS ?? 20);
const PATH = "/api/orders?column=unassigned&kanban=1";

const EMAIL = "loadtest+authcost@fp-erp.invalid";

function b64url(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString("base64url");
}

/**
 * A structurally valid JWT that expired an hour ago.
 *
 * The signature is nonsense — it is never verified locally. What matters is
 * that supabase-js can PARSE the token, read `exp`, see it is stale, and go to
 * the network to refresh it. A malformed cookie is discarded without any
 * network call at all, which would measure nothing.
 */
function expiredJwt(sub: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    sub,
    aud: "authenticated",
    role: "authenticated",
    iat: now - 7200,
    exp: now - 3600,
  });
  return `${header}.${payload}.${crypto.randomBytes(32).toString("base64url")}`;
}

/** The cookie @supabase/ssr writes: `base64-` + base64 of the session JSON. */
function sbCookie(ref: string, sub: string): string {
  const session = {
    access_token: expiredJwt(sub),
    refresh_token: crypto.randomBytes(16).toString("hex"),
    expires_at: Math.floor(Date.now() / 1000) - 3600,
    expires_in: 0,
    token_type: "bearer",
    user: { id: sub, aud: "authenticated", role: "authenticated" },
  };
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
  return `sb-${ref}-auth-token=${value}`;
}

function pct(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]);
  return { n: s.length, p50: at(0.5), p95: at(0.95), max: Math.round(s[s.length - 1]) };
}

async function one(cookie: string) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${PATH}`, {
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    redirect: "manual",
  });
  await res.text();
  return { ms: performance.now() - t0, status: res.status };
}

/**
 * Interleave the two cohorts rather than running one after the other.
 *
 * Run sequentially — twenty of A, then twenty of B — any drift between the two
 * blocks lands entirely in the delta. Lambda warmth, pooler state and the
 * network all move on the timescale of a single block, so the first attempt at
 * this measured "A then B" and could not tell a real auth cost from B simply
 * running later. Alternating A/B/A/B spreads any drift evenly across both.
 */
async function interleaved(cookieA: string, cookieB: string) {
  const a: number[] = [];
  const b: number[] = [];
  const sa = new Map<number, number>();
  const sb = new Map<number, number>();
  for (let i = 0; i < ITERATIONS; i++) {
    // Alternate which cohort goes first, so neither systematically follows the
    // other into a warm lambda.
    const aFirst = i % 2 === 0;
    const first = aFirst ? cookieA : cookieB;
    const second = aFirst ? cookieB : cookieA;
    const r1 = await one(first);
    const r2 = await one(second);
    const [ra, rb] = aFirst ? [r1, r2] : [r2, r1];
    a.push(ra.ms); sa.set(ra.status, (sa.get(ra.status) ?? 0) + 1);
    b.push(rb.ms); sb.set(rb.status, (sb.get(rb.status) ?? 0) + 1);
  }
  return {
    a: { ...pct(a), statuses: Object.fromEntries(sa) },
    b: { ...pct(b), statuses: Object.fromEntries(sb) },
  };
}

async function main() {
  if (!BASE || !DB || !SUPABASE_URL) {
    throw new Error("Need LOADTEST_BASE_URL, LOADTEST_DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL");
  }
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const sql = postgres(DB, { ssl: "require", prepare: false, max: 1 });

  // One row, not the full 50-agent seed: this measures per-request cost, and a
  // single session is enough for that.
  const authId = crypto.randomUUID();
  await sql`
    INSERT INTO users (auth_id, email, name, role)
    VALUES (${authId}, ${EMAIL}, 'Loadtest Auth Cost', 'internal')
  `;
  console.log(`  seeded 1 agent (auth_id ${authId.slice(0, 8)}...)\n`);

  try {
    const fallbackOnly = `fp-user-id=${authId}`;
    const withSb = `${fallbackOnly}; ${sbCookie(ref, authId)}`;

    // Warm both paths so neither cohort pays a cold start the other does not.
    await fetch(`${BASE}${PATH}`, { headers: { Cookie: fallbackOnly } }).then((r) => r.text());
    await fetch(`${BASE}${PATH}`, { headers: { Cookie: withSb } }).then((r) => r.text());

    const { a, b } = await interleaved(fallbackOnly, withSb);
    console.log(`  ${"fp-user-id only".padEnd(28)} p50=${String(a.p50).padStart(5)}ms p95=${String(a.p95).padStart(5)}ms  statuses=${JSON.stringify(a.statuses)}`);
    console.log(`  ${"fp-user-id + sb- cookie".padEnd(28)} p50=${String(b.p50).padStart(5)}ms p95=${String(b.p95).padStart(5)}ms  statuses=${JSON.stringify(b.statuses)}`);

    const d50 = b.p50 - a.p50;
    const d95 = b.p95 - a.p95;
    console.log(`\n  auth round-trip cost: p50 +${d50}ms, p95 +${d95}ms per request`);
    console.log(`  (order of magnitude, not a precise figure — see the header comment)`);

    if (b.statuses["200"] !== ITERATIONS) {
      console.log(`\n  WARNING: the sb- cohort did not return 200 every time.`);
      console.log(`  If those are 401s the fallback did not engage and the comparison is invalid.`);
    }
  } finally {
    const gone = await sql`DELETE FROM users WHERE email = ${EMAIL} RETURNING id`;
    console.log(`\n  cleaned up ${gone.length} seeded user`);
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
