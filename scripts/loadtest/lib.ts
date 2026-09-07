/**
 * Shared machinery for the 50-agent claim-lock stress test.
 *
 * Everything dangerous about this harness is concentrated here: which database
 * it talks to, which rows it is allowed to write, and what makes it stop. The
 * phase scripts are deliberately thin on top of these guards.
 *
 * Run with `npx tsx scripts/loadtest/<script>.ts`.
 */

import postgres from "postgres";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Env vars are LOADTEST_-prefixed on purpose.
 *
 * The app's own DATABASE_URL is one shell export away from being in scope, and
 * a harness that silently inherits it would point at whatever the last thing
 * you ran was pointing at. Requiring a distinct name means the target is always
 * something you typed for this run.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. See scripts/loadtest/README.md — every run names its target explicitly.`
    );
  }
  return value;
}

export type Target = "rung2" | "prod";

export const TARGET = (() => {
  const t = process.env.LOADTEST_TARGET;
  if (t !== "rung2" && t !== "prod") {
    throw new Error(`LOADTEST_TARGET must be "rung2" or "prod" (got ${t ?? "unset"})`);
  }
  // Production needs a second, differently-worded confirmation. The first one
  // is a value you might have left in your shell history from the rehearsal;
  // this one you have to mean.
  if (t === "prod" && process.env.LOADTEST_CONFIRM !== "yes-production") {
    throw new Error(
      "LOADTEST_TARGET=prod requires LOADTEST_CONFIRM=yes-production. " +
        "Rehearse the whole plan on rung2 — teardown included — before setting this."
    );
  }
  return t as Target;
})();

export const BASE_URL = required("LOADTEST_BASE_URL").replace(/\/$/, "");
const DATABASE_URL = required("LOADTEST_DATABASE_URL");

/** Requests allowed across the whole run before it hard-stops. */
export const REQUEST_BUDGET = Number(process.env.LOADTEST_BUDGET ?? 25000);

/**
 * Where the manifest lives.
 *
 * NOT in the repo, and not negotiable. The manifest holds 50 `auth_id` values,
 * and an auth_id IS a working session for that user — `fp-user-id: <auth_id>`
 * is all it takes. Against prod these are 50 live credentials in a plain file.
 * Home directory, 0600, outside any git worktree.
 */
export const STATE_DIR =
  process.env.LOADTEST_STATE_DIR ?? path.join(os.homedir(), ".fp-erp-loadtest");
export const MANIFEST_PATH = path.join(STATE_DIR, `manifest.${TARGET}.json`);
export const STOP_FILE = path.join(STATE_DIR, "STOP");
export const RESULTS_DIR = path.join(STATE_DIR, "results");

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const isLocal = /@(localhost|127\.0\.0\.1)/.test(DATABASE_URL);

export const sql = postgres(DATABASE_URL, {
  ssl: isLocal ? false : "require",
  prepare: false, // transaction-mode pooling, same as the app
  max: 4, // the harness is not the thing under test; keep its own footprint small
});

/**
 * A stable, non-secret identifier for the database being addressed.
 *
 * Used to bind a manifest to the database it was seeded against. Hashed rather
 * than stored raw because the URL carries the password, and this file gets read
 * back and printed.
 */
export function dbFingerprint(): { host: string; hash: string } {
  const u = new URL(DATABASE_URL);
  const host = `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  return { host, hash: crypto.createHash("sha256").update(host).digest("hex").slice(0, 16) };
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export type Agent = {
  userId: number;
  authId: string;
  email: string;
};

export type SeededOrder = {
  /** order_items.id — the INTEGER key. What assign-items takes. */
  id: number;
  /** order_items.order_item_id — the TEXT key. What the claim endpoint takes. */
  orderItemId: string;
};

export type Manifest = {
  version: 1;
  target: Target;
  baseUrl: string;
  db: { host: string; hash: string };
  seededAt: string;
  agents: Agent[];
  orders: SeededOrder[];
  supplierId: number;
};

export function writeManifest(m: Manifest): void {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(m, null, 2), { mode: 0o600 });
}

/**
 * Load the manifest and refuse to proceed unless it was seeded against the
 * database this process is now connected to.
 *
 * This is the most important guard in the file. `orders[].id` is an integer
 * primary key, and integer keys are not self-describing: id 4173 seeded on
 * rung-2 is some completely unrelated real order on production. A manifest
 * used against the wrong database turns the assign-items allowlist — the thing
 * meant to bound the blast radius — into a list of real orders to permanently
 * assign. Binding the manifest to a database fingerprint is what stops a
 * mismatched pair from ever reaching a write.
 */
export function readManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`No manifest at ${MANIFEST_PATH}. Run seed.ts first.`);
  }
  const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
  const fp = dbFingerprint();

  if (m.db.hash !== fp.hash) {
    throw new Error(
      `Manifest/database mismatch — refusing to run.\n` +
        `  manifest was seeded against: ${m.db.host}\n` +
        `  LOADTEST_DATABASE_URL points at: ${fp.host}\n` +
        `The integer order ids in this manifest mean different rows in a different database.`
    );
  }
  if (m.baseUrl !== BASE_URL) {
    throw new Error(
      `Manifest/base URL mismatch — refusing to run.\n` +
        `  manifest: ${m.baseUrl}\n  now: ${BASE_URL}\n` +
        `The app you are hitting must be the one wired to the database you seeded.`
    );
  }
  return m;
}

// ---------------------------------------------------------------------------
// The governor: budget, circuit breaker, kill switch
// ---------------------------------------------------------------------------

export class AbortRun extends Error {}

/**
 * The brakes.
 *
 * None of these endpoints are rate limited — nothing anywhere throttles 50
 * agents, and Vercel's response to sustained load is to scale and bill rather
 * than to push back. So the only thing that stops a runaway harness is the
 * harness, and it needs three independent ways to stop: a total budget, a
 * failure-rate breaker, and a file you can touch from another terminal.
 */
export class Governor {
  private sent = 0;
  private recent: boolean[] = []; // true = 5xx, over the last 100 requests
  private stopped = false;

  constructor(private readonly budget = REQUEST_BUDGET) {}

  get requestsSent(): number {
    return this.sent;
  }

  /** Called before each request. Throws AbortRun to unwind every agent. */
  check(): void {
    if (this.stopped) throw new AbortRun("run already aborted");
    if (this.sent >= this.budget) {
      this.stopped = true;
      throw new AbortRun(`request budget of ${this.budget} exhausted`);
    }
    // Checked per request rather than on a timer so `touch STOP` takes effect
    // within one request rather than within one polling interval.
    if (fs.existsSync(STOP_FILE)) {
      this.stopped = true;
      throw new AbortRun(`STOP file present at ${STOP_FILE}`);
    }
    this.sent++;
  }

  /** Called after each request, to feed the breaker. */
  record(status: number): void {
    this.recent.push(status >= 500);
    if (this.recent.length > 100) this.recent.shift();
    if (this.recent.length === 100) {
      const failures = this.recent.filter(Boolean).length;
      if (failures > 10) {
        this.stopped = true;
        throw new AbortRun(
          `circuit breaker: ${failures}/100 recent requests returned 5xx. ` +
            `Something is wrong with the target, not with your test.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type Result = {
  status: number;
  ms: number;
  body: any;
  /** Set when the request never got a response at all (socket/DNS/TLS). */
  error?: string;
};

export function headersFor(agent: Agent): Record<string, string> {
  return {
    // The Stage-2 fallback path in lib/auth.ts: this value is matched directly
    // against users.auth_id, so no corresponding Supabase auth user is needed.
    // It also satisfies the proxy gate as `legacySessionCookie`.
    Cookie: `fp-user-id=${agent.authId}`,
    "Content-Type": "application/json",
    "User-Agent": "fp-erp-loadtest",
  };
}

export async function request(
  gov: Governor,
  agent: Agent | { headers: Record<string, string> },
  method: string,
  pathname: string,
  body?: unknown
): Promise<Result> {
  gov.check();
  const headers =
    "headers" in agent ? agent.headers : headersFor(agent as Agent);
  const t0 = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual", // a 307 to /login must read as a failure, never as ok
    });
    const ms = performance.now() - t0;
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* HTML error pages and redirects land here; keep the raw text */
    }
    gov.record(res.status);
    return { status: res.status, ms, body: parsed };
  } catch (err) {
    const ms = performance.now() - t0;
    // Transport failures are the signal in Phase 5 — connection-pool exhaustion
    // often shows up as a dropped socket rather than a clean 5xx.
    gov.record(599);
    return { status: 0, ms, body: null, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/**
 * Release N agents at the same instant.
 *
 * Promise.all over 50 fetches does NOT start them together: each one pays TLS
 * and DNS on its first call, staggering the actual writes across tens of
 * milliseconds — comfortably enough for the row lock to serialise them one at a
 * time and for a genuine race to never occur. The test would pass without ever
 * having tested anything.
 *
 * So: warm a connection per agent first, then hold everyone at a wall-clock
 * deadline and release together.
 */
export async function barrier<T>(
  agents: Agent[],
  gov: Governor,
  warmupPath: string,
  work: (agent: Agent, index: number) => Promise<T>
): Promise<T[]> {
  const startAt = Date.now() + 1500;
  return Promise.all(
    agents.map(async (agent, i) => {
      await request(gov, agent, "GET", warmupPath);
      const wait = startAt - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      return work(agent, i);
    })
  );
}

export function percentiles(samples: number[]): {
  n: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
} {
  if (samples.length === 0) return { n: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const s = [...samples].sort((a, b) => a - b);
  const at = (q: number) => Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]);
  return { n: s.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: Math.round(s[s.length - 1]) };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const failures: string[] = [];

export function check(label: string, condition: boolean, detail = ""): boolean {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  }
  return condition;
}

export function saveResult(name: string, data: unknown): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(RESULTS_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 });
  console.log(`  → ${file}`);
}

/**
 * Exit non-zero if anything failed, so a phase can be chained in a shell
 * without the next one running on top of a broken result.
 */
export async function finish(): Promise<never> {
  await sql.end({ timeout: 5 });
  if (failures.length > 0) {
    console.log(`\n${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log("\nAll checks passed.");
  process.exit(0);
}

export function banner(phase: string): void {
  const fp = dbFingerprint();
  console.log(`\n=== ${phase} ===`);
  console.log(`  target : ${TARGET}`);
  console.log(`  app    : ${BASE_URL}`);
  console.log(`  db     : ${fp.host}`);
  console.log(`  stop   : touch ${STOP_FILE}`);
  console.log(`  started: ${new Date().toISOString()}\n`);
}
