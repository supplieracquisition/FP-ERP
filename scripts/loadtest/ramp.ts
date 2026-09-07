/**
 * Concurrency ramp: find the level at which production starts to hurt.
 *
 *   npx tsx scripts/loadtest/ramp.ts
 *
 * Phase 2 told us 50 concurrent WRITES trips the breaker but not what the
 * failure actually says. This walks the concurrency up in steps and captures
 * the error bodies, so the answer is a number and a cause rather than "it broke
 * somewhere above 12 rounds".
 *
 * Reads only, deliberately. Loading the board is what users actually do all
 * day, it is the thing "will users face lag" is really asking about, and it
 * writes nothing to production.
 */

import {
  banner,
  finish,
  saveResult,
  request,
  barrier,
  percentiles,
  readManifest,
  Governor,
  AbortRun,
  check,
  type Agent,
} from "./lib";

const LEVELS = [5, 10, 20, 30, 40, 50];
const ROUNDS_PER_LEVEL = 3;
const READ_PATH = "/api/orders?column=unassigned&kanban=1";

type LevelResult = {
  concurrency: number;
  n: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  statuses: Record<string, number>;
  errorSamples: string[];
};

async function main() {
  banner("CONCURRENCY RAMP");
  const m = readManifest();
  const gov = new Governor();
  const table: LevelResult[] = [];

  for (const level of LEVELS) {
    const agents: Agent[] = m.agents.slice(0, level);
    const ms: number[] = [];
    const statuses = new Map<number, number>();
    const errorSamples: string[] = [];

    try {
      for (let r = 0; r < ROUNDS_PER_LEVEL; r++) {
        const results = await barrier(agents, gov, "/api/notifications", (a) =>
          request(gov, a, "GET", READ_PATH)
        );
        for (const res of results) {
          ms.push(res.ms);
          statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
          if (res.status !== 200 && errorSamples.length < 5) {
            const body = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
            errorSamples.push(`${res.status}${res.error ? ` transport=${res.error}` : ""} body=${String(body).slice(0, 400)}`);
          }
        }
      }
    } catch (err) {
      if (!(err instanceof AbortRun)) throw err;
      console.log(`  aborted at concurrency ${level}: ${err.message}`);
      const p = percentiles(ms);
      table.push({ concurrency: level, ...p, statuses: Object.fromEntries([...statuses].map(([k, v]) => [String(k), v])), errorSamples });
      break;
    }

    const p = percentiles(ms);
    const row: LevelResult = {
      concurrency: level,
      ...p,
      statuses: Object.fromEntries([...statuses].map(([k, v]) => [String(k), v])),
      errorSamples,
    };
    table.push(row);

    const nonOk = [...statuses.entries()].filter(([s]) => s !== 200).reduce((a, [, n]) => a + n, 0);
    console.log(
      `  concurrency ${String(level).padStart(2)}: p50=${String(p.p50).padStart(5)}ms  p95=${String(p.p95).padStart(5)}ms  max=${String(p.max).padStart(5)}ms  non-200=${nonOk}/${p.n}`
    );
    if (errorSamples.length) errorSamples.forEach((e) => console.log(`      ${e}`));

    // Let production settle between levels so each reading is of that level,
    // not of the queue the previous one left behind.
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log("");
  console.table(
    table.map((t) => ({
      concurrency: t.concurrency,
      p50: t.p50,
      p95: t.p95,
      max: t.max,
      ok: t.statuses["200"] ?? 0,
      non200: Object.entries(t.statuses).filter(([s]) => s !== "200").reduce((a, [, n]) => a + n, 0),
    }))
  );

  const firstBad = table.find((t) => Object.keys(t.statuses).some((s) => s !== "200"));
  if (firstBad) {
    console.log(`\n  First non-200 appears at concurrency ${firstBad.concurrency}.`);
    firstBad.errorSamples.forEach((e) => console.log(`    ${e}`));
  } else {
    console.log("\n  No non-200 responses at any level tested.");
  }
  check("no errors at any concurrency level", !firstBad, firstBad ? `first at ${firstBad.concurrency}` : "");

  saveResult("ramp", { levels: table, requestsSent: gov.requestsSent });
  console.log(`\n  requests sent: ${gov.requestsSent}`);
  await finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
