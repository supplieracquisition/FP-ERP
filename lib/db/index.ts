import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import * as schema from "./schema";

/**
 * Connection pool sizing for a serverless deployment.
 *
 * This is not tuning — without it production returns 500s under load. Measured
 * 2026-09-07 against prod: from ~30 simultaneous requests the pooler started
 * refusing connections outright, and the Vercel runtime log named the cause:
 *
 *   Error: Failed query: select ... from "users" where "users"."auth_id" = $1
 *     [cause]: (EMAXCONN) max client connections reached, limit: 200
 *
 * The arithmetic: postgres-js defaults to max 10 connections per client, and on
 * Vercel every warm lambda instance constructs its own client. So the ceiling is
 * 10 × (warm instances), and roughly twenty warm instances is enough to exhaust
 * Supavisor's 200-client limit. Nothing in the app is aware of this, which is
 * why it surfaced as an unexplained 500 with an empty body rather than as
 * anything diagnosable from the outside.
 *
 * max: 3 is a measured compromise between two failure modes, not a guess.
 *
 * This was first set to 1, which does eliminate EMAXCONN — and replaced it with
 * something worse. Measured at concurrency 30: six requests returned 504
 * FUNCTION_INVOCATION_TIMEOUT after 300 SECONDS. The cause is in-function
 * concurrency: Vercel routes several requests to one warm instance, and with a
 * single connection they queue behind each other inside postgres-js until the
 * function's own timeout kills them. A fast 500 is bad; a five-minute hung page
 * is worse, and it is invisible to a health check that only counts errors.
 *
 * So the ceiling is bounded from both sides:
 *   too high  -> 10 x instances exceeds Supavisor's 200 and requests fail fast
 *   too low   -> requests queue on too few connections and hang until timeout
 *
 * 3 gives each instance room for real in-function concurrency while keeping
 * roughly 66 instances' worth of headroom under the 200 limit. The region move
 * helps here too: requests now take ~400ms rather than ~1730ms, so each
 * connection is held about a quarter as long and far fewer are needed at once.
 *
 * If you change this, re-run scripts/loadtest/ramp.ts and check BOTH failure
 * modes — a run that reports no 500s can still be hiding 300s hangs.
 *
 * idle_timeout returns a connection to the pooler after 20s idle instead of
 * holding it for the life of the instance. Without it a lambda that served one
 * request at 09:00 is still occupying a client slot at 09:30.
 *
 * prepare: false is required for transaction-mode pooling (port 6543) and was
 * already correct — prepared statements do not survive a pooler that reassigns
 * server connections between transactions.
 */
export const db: any = process.env.DATABASE_URL
  ? drizzlePg(
      postgres(process.env.DATABASE_URL, {
        prepare: false,
        ssl: "require",
        max: 3,
        idle_timeout: 20,
      }),
      { schema }
    )
  : drizzleSqlite(
      new Database(path.join(process.cwd(), "fp-erp.db")),
      { schema }
    );
