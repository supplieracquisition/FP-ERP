/**
 * The phases.
 *
 *   npx tsx scripts/loadtest/run.ts <phase>
 *
 * Phases are independent and each exits non-zero on a failed check, so they can
 * be chained in a shell without a later one running on top of a broken result.
 * Run them in order the first time; 0 is the gate for everything else.
 */

import fs from "node:fs";
import {
  sql,
  banner,
  check,
  finish,
  saveResult,
  request,
  barrier,
  percentiles,
  headersFor,
  readManifest,
  Governor,
  AbortRun,
  type Agent,
  type Manifest,
} from "./lib";

type Ctx = { m: Manifest; gov: Governor };

const WARMUP = "/api/notifications";

// ---------------------------------------------------------------------------
// Phase 0 — the checks that were never run against production
// ---------------------------------------------------------------------------

async function phase0({ m, gov }: Ctx) {
  const agent = m.agents[0];

  // The format audit. Worth running on its own, whether or not the rest of this
  // test ever happens: a single row here means something wrote now() into
  // claimed_at, the column now holds two formats, and because expiry is a
  // lexicographic string comparison ("2026-08-30 12:00" sorts before
  // "2026-08-30T12:00"), every stale claim reads as fresh. The lock stops
  // expiring and nothing looks broken.
  const [{ count: malformed }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM order_items
    WHERE claimed_at IS NOT NULL AND claimed_at NOT LIKE '%T%'
  `;
  check("claimed_at holds exactly one format", malformed === "0", `${malformed} space-separated rows`);

  // The snapshot teardown diffs against.
  const poolBefore = await sql`
    SELECT order_item_id, processor_user_id, claimed_at, supplier_id
    FROM order_items WHERE supplier_id IS NULL AND order_item_id NOT LIKE 'LOADTEST-%'
    ORDER BY order_item_id
  `;
  saveResult("phase0-real-pool-snapshot", {
    takenAt: new Date().toISOString(),
    count: poolBefore.length,
    rows: poolBefore,
  });
  console.log(`  Snapshotted ${poolBefore.length} real pool orders.`);

  // PATCH must refuse supplierId. Deliberately sends null: under the pre-Deploy-2
  // code a REAL supplier id here would assign the order for real, and the new
  // code then refuses to undo it. null is refused by both, so this check is safe
  // to run whichever version is actually deployed.
  const target = poolBefore[0]?.order_item_id ?? m.orders[0].orderItemId;
  const patch = await request(gov, agent, "PATCH", `/api/orders/${target}`, { supplierId: null });
  check("PATCH /api/orders/[id] refuses supplierId", patch.status === 400, `got ${patch.status}`);

  // A POC-of-nothing internal user sees the pool, not nothing and not everything.
  const list = await request(gov, agent, "GET", "/api/orders?column=unassigned&kanban=1");
  const items: any[] = list.body?.items ?? [];
  check("zero-POC internal user gets 200 on the pool", list.status === 200, `got ${list.status}`);
  check("...and sees the seeded pool orders", items.some((i) => String(i.orderItemId).startsWith("LOADTEST-")));
  check(
    "...and sees no assigned orders (fail-closed scope)",
    items.every((i) => i.supplierId === null),
    `${items.filter((i) => i.supplierId !== null).length} assigned rows leaked into scope`
  );

  // Supplier isolation needs a real supplier session, which this harness cannot
  // mint — supplier accounts go through Supabase auth. Capture the cookie from a
  // logged-in browser and pass it in, or run this one by hand.
  const supplierCookie = process.env.LOADTEST_SUPPLIER_COOKIE;
  if (supplierCookie) {
    const asSupplier = await request(
      gov,
      { headers: { Cookie: supplierCookie, "Content-Type": "application/json" } },
      "GET",
      "/api/orders?kanban=1"
    );
    const supplierItems: any[] = asSupplier.body?.items ?? [];
    check(
      "supplier session sees zero pool rows",
      supplierItems.every((i) => i.supplierId !== null),
      `${supplierItems.filter((i) => i.supplierId === null).length} pool rows visible to a supplier`
    );
  } else {
    console.log("  SKIP  supplier isolation — set LOADTEST_SUPPLIER_COOKIE to include it");
  }
}

// ---------------------------------------------------------------------------
// Phase 1 — single-agent baseline
// ---------------------------------------------------------------------------

async function phase1({ m, gov }: Ctx) {
  const agent = m.agents[0];
  const order = m.orders[0];
  const timings: Record<string, number[]> = { list: [], claim: [], release: [] };

  for (let i = 0; i < 50; i++) {
    const list = await request(gov, agent, "GET", "/api/orders?column=unassigned&kanban=1");
    timings.list.push(list.ms);

    const claim = await request(gov, agent, "POST", `/api/orders/${order.orderItemId}/claim`);
    timings.claim.push(claim.ms);
    if (claim.status !== 200) check(`baseline claim iteration ${i}`, false, `got ${claim.status}`);

    const release = await request(gov, agent, "DELETE", `/api/orders/${order.orderItemId}/claim`);
    timings.release.push(release.ms);
  }

  const stats = Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, percentiles(v)]));
  console.table(stats);
  saveResult("phase1-baseline", stats);
  console.log("  Every later phase is read against these numbers. Same deploy, same window.");
}

// ---------------------------------------------------------------------------
// Phase 2 — thundering herd. The core correctness test.
// ---------------------------------------------------------------------------

async function phase2({ m, gov }: Ctx) {
  const ROUNDS = 20;
  const latencies: number[] = [];
  let perfectRounds = 0;

  for (let round = 0; round < ROUNDS; round++) {
    const order = m.orders[round];

    // Rotating the agent set per round matters. Re-claiming an order you
    // already hold correctly returns 200 — it is an idempotent refresh, not a
    // conflict — so an agent that won round N and is still holding something
    // can produce what looks like a second winner. Distinct agents, and a
    // release before the next round.
    const agents = rotate(m.agents, round);

    const results = await barrier(agents, gov, WARMUP, (a) =>
      request(gov, a, "POST", `/api/orders/${order.orderItemId}/claim`)
    );
    results.forEach((r) => latencies.push(r.ms));

    const winners = results.filter((r) => r.status === 200);
    const losers = results.filter((r) => r.status === 409);
    const other = results.filter((r) => r.status !== 200 && r.status !== 409);

    // Assert on exact statuses, never on !res.ok. A claim POST that 404s —
    // which is what happens if an integer id reaches this text-keyed endpoint —
    // is "not 200" and would otherwise score as a correctly-lost race.
    //
    // Evaluated into locals FIRST, then combined. These used to be &&-chained
    // directly, which short-circuits: the moment the 409 count was wrong, the
    // "no unexpected statuses" check never ran and its detail string — the only
    // place the actual failing status and error body were reported — was never
    // printed. That threw away the diagnosis at exactly the moment something
    // was going wrong. Every check must run; only the summary is combined.
    const okWinner = check(`round ${round}: exactly one winner`, winners.length === 1, `${winners.length} winners`);
    const okLosers = check(`round ${round}: other 49 got 409`, losers.length === agents.length - 1, `${losers.length} of ${agents.length - 1}`);
    const okOther = check(
      `round ${round}: no unexpected statuses`,
      other.length === 0,
      other.map((o) => `${o.status}${o.error ? `(${o.error})` : ""}: ${JSON.stringify(o.body).slice(0, 300)}`).join(" | ")
    );
    const clean = okWinner && okLosers && okOther;

    // The winner's claim must actually be in the database. A 200 that did not
    // persist is the failure mode a status-code assertion cannot see.
    const [row] = await sql<{ processor_user_id: number | null; claimed_at: string | null }[]>`
      SELECT processor_user_id, claimed_at FROM order_items
      WHERE order_item_id = ${order.orderItemId}
    `;
    const winnerIndex = results.findIndex((r) => r.status === 200);
    const expected = winnerIndex >= 0 ? agents[winnerIndex].userId : null;
    // Same non-short-circuiting form as above: both must actually run.
    const okPersist = check(`round ${round}: winner persisted`, row?.processor_user_id === expected, `db=${row?.processor_user_id} api=${expected}`);
    const okFormat = check(`round ${round}: claimed_at in ISO format`, !!row?.claimed_at?.includes("T"), String(row?.claimed_at));
    const persisted = okPersist && okFormat;

    if (clean && persisted) perfectRounds++;

    if (winnerIndex >= 0) {
      await request(gov, agents[winnerIndex], "DELETE", `/api/orders/${order.orderItemId}/claim`);
    }
  }

  check(`all ${ROUNDS} rounds clean`, perfectRounds === ROUNDS, `${perfectRounds}/${ROUNDS}`);
  const stats = percentiles(latencies);
  console.table({ contendedClaim: stats });
  saveResult("phase2-herd", { rounds: ROUNDS, perfectRounds, latency: stats });
}

// ---------------------------------------------------------------------------
// Phase 3 — sustained churn
// ---------------------------------------------------------------------------

async function phase3({ m, gov }: Ctx) {
  const durationMs = Number(process.env.LOADTEST_CHURN_SECONDS ?? 600) * 1000;
  const deadline = Date.now() + durationMs;
  const claimMs: number[] = [];
  const releaseMs: number[] = [];
  const statuses = new Map<number, number>();

  console.log(`  Churning for ${durationMs / 1000}s across ${m.agents.length} agents...`);

  const loop = async (agent: Agent) => {
    while (Date.now() < deadline) {
      const order = m.orders[Math.floor(Math.random() * m.orders.length)];
      const claim = await request(gov, agent, "POST", `/api/orders/${order.orderItemId}/claim`);
      claimMs.push(claim.ms);
      statuses.set(claim.status, (statuses.get(claim.status) ?? 0) + 1);
      if (claim.status === 200) {
        await new Promise((r) => setTimeout(r, 200));
        const rel = await request(gov, agent, "DELETE", `/api/orders/${order.orderItemId}/claim`);
        releaseMs.push(rel.ms);
        statuses.set(rel.status, (statuses.get(rel.status) ?? 0) + 1);
      }
    }
  };

  try {
    await Promise.all(m.agents.map(loop));
  } catch (err) {
    if (!(err instanceof AbortRun)) throw err;
    console.log(`  ABORTED: ${err.message}`);
  }

  const byStatus = Object.fromEntries([...statuses.entries()].sort());
  const stats = { claim: percentiles(claimMs), release: percentiles(releaseMs) };
  console.table(stats);
  console.log("  statuses:", byStatus);

  const total = [...statuses.values()].reduce((a, b) => a + b, 0);
  const serverErrors = [...statuses.entries()]
    .filter(([s]) => s >= 500 || s === 0)
    .reduce((a, [, n]) => a + n, 0);
  check("5xx/transport failure rate under 1%", serverErrors / total < 0.01, `${serverErrors}/${total}`);

  // Every LOSER costs an extra query: the claim route calls describe() — a
  // joined SELECT against users — to explain the refusal. At 50-way contention
  // that is one write plus up to 49 explanatory joins per contested order, so
  // load under contention grows faster than the happy path suggests. If p95
  // degrades badly here while Phase 5's pure reads stay flat, this is why, and
  // the fix is to skip describe() when the row is simply claimed and fresh.
  console.log("\n  Compare claim p95 against Phase 1. Contention cost is the delta.");
  saveResult("phase3-churn", { durationMs, byStatus, stats });
}

// ---------------------------------------------------------------------------
// Phase 4 — bulk all-or-nothing, the guard that stands in for a transaction
// ---------------------------------------------------------------------------

async function phase4({ m, gov }: Ctx) {
  const SETS = 10;

  // Overlapping windows: agent N takes orders [N, N+1, N+2], so neighbours
  // collide on two of three. Some agents will hold all three, some won't —
  // which is exactly the situation allClaimable() exists for.
  const sets = Array.from({ length: SETS }, (_, i) => ({
    agent: m.agents[i],
    orders: [m.orders[40 + i], m.orders[40 + i + 1], m.orders[40 + i + 2]],
  }));

  // THE fence for this phase. The LOADTEST- prefix protects the claim endpoint,
  // which is keyed by text — but assign-items takes bare integers, and an
  // integer id carries nothing that says which database or which row it came
  // from. Only the manifest can vouch for these, and readManifest() has already
  // refused to load one seeded against a different database.
  const allowed = new Set(m.orders.map((o) => o.id));
  for (const s of sets) {
    for (const o of s.orders) {
      if (!allowed.has(o.id)) throw new Error(`BLAST RADIUS: order id ${o.id} is not in the manifest`);
      if (!o.orderItemId.startsWith("LOADTEST-")) throw new Error(`BLAST RADIUS: ${o.orderItemId}`);
    }
  }

  // Claim first. heldBy() is strict now — an assignment with no live claim of
  // your own behind it is refused, because the PO Builder claims at add time.
  for (const s of sets) {
    for (const o of s.orders) {
      await request(gov, s.agent, "POST", `/api/orders/${o.orderItemId}/claim`);
    }
  }

  const results = await barrier(
    sets.map((s) => s.agent),
    gov,
    WARMUP,
    (agent, i) =>
      request(gov, agent, "POST", "/api/po-builder/assign-items", {
        orderItemIds: sets[i].orders.map((o) => o.id),
        supplierId: m.supplierId,
        productionStage: "sample_production",
        // Required by assign-items: an assignment with no ship date would be
        // invisible to the capacity heatmap, so the route refuses it. Any valid
        // date works here — this harness asserts on who won the race, not on
        // scheduling.
        supplierShipDate: "2026-12-31T00:00:00.000Z",
      })
  );

  const ok = results.filter((r) => r.status === 200);
  const conflict = results.filter((r) => r.status === 409);
  // 403 is a legitimate outcome here, not a failure.
  //
  // Once the winner's assignment lands, those rows leave the pool. A rival
  // whose id set overlaps them is POC of nothing, so orderScope() gives it the
  // pool alone — and the now-assigned rows are outside it. denyOrderRowIds()
  // therefore refuses the whole request with 403 before the claim guard is ever
  // reached. Whether a loser sees 409 (claim guard) or 403 (scope guard) is
  // purely a matter of which write got there first.
  //
  // Asserting 200-or-409 was too narrow: it read correct fail-closed scoping as
  // a defect. What actually matters is that no loser wrote anything, which the
  // row-count check below enforces.
  const scoped = results.filter((r) => r.status === 403);
  check(
    "every assign-items call is 200, 409 or 403",
    ok.length + conflict.length + scoped.length === results.length,
    results.filter((r) => ![200, 409, 403].includes(r.status)).map((r) => r.status).join(",")
  );
  check("exactly one request won", ok.length === 1, `${ok.length} winners`);
  check("no request reported a partial assignment", results.every((r) => r.status !== 200 || r.body?.assigned === 3),
    results.map((r) => r.body?.assigned).join(","));

  // All-or-nothing, checked against the database rather than the response.
  const assignedRows = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM order_items
    WHERE order_item_id LIKE 'LOADTEST-%' AND supplier_id IS NOT NULL
  `;
  check(
    "assigned row count is exactly 3 per successful request",
    Number(assignedRows[0].n) === ok.length * 3,
    `${assignedRows[0].n} rows for ${ok.length} winners`
  );

  // The audit trail is written as a SECOND, non-transactional statement — the
  // route documents this, because data-modifying CTEs would work on Postgres
  // but have no SQLite equivalent and an async transaction callback is
  // unsupported on better-sqlite3. This measures how often the gap actually
  // bites under load, rather than assuming it never does.
  const [{ n: missing }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM order_items oi
    LEFT JOIN status_history sh ON sh.order_item_id = oi.order_item_id
    WHERE oi.order_item_id LIKE 'LOADTEST-%' AND oi.supplier_id IS NOT NULL AND sh.id IS NULL
  `;
  check("every assignment left a status_history row", missing === "0", `${missing} assignments with no audit row`);

  saveResult("phase4-bulk", {
    winners: ok.length,
    conflicts: conflict.length,
    assignedRows: Number(assignedRows[0].n),
    missingHistory: Number(missing),
  });
}

// ---------------------------------------------------------------------------
// Phase 5 — read storm. Expect the first real failure here.
// ---------------------------------------------------------------------------

async function phase5({ m, gov }: Ctx) {
  const ROUNDS = 30;
  const latencies: number[] = [];
  const statuses = new Map<number, number>();
  const transportErrors: string[] = [];

  console.log("  Watching for pool exhaustion. lib/db/index.ts sets neither max nor");
  console.log("  idle_timeout, so postgres-js defaults to 10 connections per client —");
  console.log("  and on Vercel every warm lambda holds its own pool.\n");

  for (let round = 0; round < ROUNDS; round++) {
    const results = await barrier(m.agents, gov, WARMUP, (a) =>
      request(gov, a, "GET", "/api/orders?kanban=1")
    );
    results.forEach((r) => {
      latencies.push(r.ms);
      statuses.set(r.status, (statuses.get(r.status) ?? 0) + 1);
      if (r.error) transportErrors.push(r.error);
      // Pool exhaustion often surfaces as an application 500 carrying the
      // driver's text rather than as a dropped socket.
      const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? "");
      if (/MaxClients|remaining connection slots|too many clients|ECONNRESET|CONNECT_TIMEOUT/i.test(text)) {
        transportErrors.push(text.slice(0, 200));
      }
    });
  }

  const byStatus = Object.fromEntries([...statuses.entries()].sort());
  console.table({ kanbanRead: percentiles(latencies) });
  console.log("  statuses:", byStatus);
  if (transportErrors.length) {
    console.log(`\n  ${transportErrors.length} connection-level failures. First few:`);
    transportErrors.slice(0, 5).forEach((e) => console.log(`    ${e}`));
    console.log("\n  This is the predicted finding. Fix is a one-liner in lib/db/index.ts:");
    console.log("    postgres(url, { prepare: false, ssl: 'require', max: 1, idle_timeout: 20 })");
  }
  check("no connection-level failures", transportErrors.length === 0, `${transportErrors.length} seen`);
  check("all reads returned 200", (statuses.get(200) ?? 0) === ROUNDS * m.agents.length, JSON.stringify(byStatus));
  saveResult("phase5-readstorm", { rounds: ROUNDS, byStatus, latency: percentiles(latencies), transportErrors: transportErrors.slice(0, 50) });
}

// ---------------------------------------------------------------------------
// Phase 6 — what a real Supabase session actually costs
// ---------------------------------------------------------------------------

async function phase6({ m, gov }: Ctx) {
  // Everything above rides the fp-user-id fallback, which means no `sb-` cookie,
  // which means the proxy never calls getUser() (proxy.ts, hasSupabaseCookie).
  // Real users pay that network round-trip on EVERY request. Without this phase
  // the whole test systematically under-measures the thing real users feel.
  const file = process.env.LOADTEST_REAL_COOKIES;
  if (!file || !fs.existsSync(file)) {
    throw new Error(
      "Set LOADTEST_REAL_COOKIES to a file with one full Cookie header per line.\n" +
        "Capture them from logged-in browser sessions (DevTools → Network → any request → Cookie).\n" +
        "Five is enough — this measures per-request cost, not concurrency."
    );
  }
  const cookies = fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  console.log(`  ${cookies.length} real sessions loaded.`);

  const measure = async (label: string, agents: { headers: Record<string, string> }[]) => {
    const ms: number[] = [];
    for (let i = 0; i < 20; i++) {
      const rs = await Promise.all(
        agents.map((a) => request(gov, a, "GET", "/api/orders?column=unassigned&kanban=1"))
      );
      rs.forEach((r) => ms.push(r.ms));
      const bad = rs.filter((r) => r.status !== 200);
      if (bad.length) check(`${label} all 200`, false, bad.map((b) => b.status).join(","));
    }
    return percentiles(ms);
  };

  const real = await measure("real session", cookies.map((c) => ({ headers: { Cookie: c, "Content-Type": "application/json" } })));
  const fallback = await measure("fallback cookie", m.agents.slice(0, cookies.length).map((a) => ({ headers: headersFor(a) })));

  console.table({ realSupabaseSession: real, fpUserIdFallback: fallback });
  const overhead = real.p95 - fallback.p95;
  console.log(`\n  getUser() overhead at p95: ${overhead}ms per request.`);
  console.log(`  Every number in phases 1–5 is missing this. Add it back before concluding anything about 50 real users.`);
  saveResult("phase6-real-sessions", { real, fallback, p95OverheadMs: overhead });
}

// ---------------------------------------------------------------------------
// Phase 7 — expiry
// ---------------------------------------------------------------------------

async function phase7({ m, gov }: Ctx) {
  const holder = m.agents[0];
  const rival = m.agents[1];
  const targets = m.orders.slice(30, 36);

  // 25 hours old, written the way the application writes it.
  //
  // NOT `now() - interval '25 hours'`. Postgres renders that as
  // "2026-08-30 12:00:00+00" — space-separated — and expiry is a lexicographic
  // comparison against a toISOString() cutoff. Injecting one such value would
  // make this test pass while corrupting the invariant it is meant to verify.
  const stale = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  check("stale timestamp is ISO format", stale.includes("T"), stale);

  await sql`
    UPDATE order_items
    SET processor_user_id = ${holder.userId}, claimed_at = ${stale}
    WHERE order_item_id IN ${sql(targets.map((t) => t.orderItemId))}
  `;

  for (const t of targets) {
    const r = await request(gov, rival, "POST", `/api/orders/${t.orderItemId}/claim`);
    check(`expired claim on ${t.orderItemId} is takeable by another agent`, r.status === 200, `got ${r.status}`);
  }

  // And the control: a FRESH claim by someone else must still be refused.
  const fresh = m.orders[36];
  await request(gov, holder, "POST", `/api/orders/${fresh.orderItemId}/claim`);
  const denied = await request(gov, rival, "POST", `/api/orders/${fresh.orderItemId}/claim`);
  check("a fresh claim is still refused", denied.status === 409, `got ${denied.status}`);

  for (const t of [...targets, fresh]) {
    await sql`UPDATE order_items SET processor_user_id = NULL, claimed_at = NULL WHERE order_item_id = ${t.orderItemId}`;
  }
}

// ---------------------------------------------------------------------------

function rotate<T>(arr: T[], by: number): T[] {
  const n = by % arr.length;
  return [...arr.slice(n), ...arr.slice(0, n)];
}

const PHASES: Record<string, (ctx: Ctx) => Promise<void>> = {
  "0": phase0, "1": phase1, "2": phase2, "3": phase3,
  "4": phase4, "5": phase5, "6": phase6, "7": phase7,
};

async function main() {
  const name = process.argv[2];
  const phase = PHASES[name];
  if (!phase) {
    console.error(`Usage: npx tsx scripts/loadtest/run.ts <${Object.keys(PHASES).join("|")}>`);
    process.exit(2);
  }
  banner(`PHASE ${name}`);
  const m = readManifest();
  const gov = new Governor();
  try {
    await phase({ m, gov });
  } catch (err) {
    if (err instanceof AbortRun) {
      console.log(`\n  RUN ABORTED: ${err.message}`);
      check("run completed without hitting the brakes", false, err.message);
    } else {
      throw err;
    }
  }
  console.log(`\n  requests sent: ${gov.requestsSent}`);
  await finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
