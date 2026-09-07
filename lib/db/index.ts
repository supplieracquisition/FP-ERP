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
 * max: 1 makes the ceiling 200 instances instead of 20 — a 10x margin over the
 * point that actually failed. The cost is that concurrent queries WITHIN one
 * instance serialise on the single connection; app/api/suppliers/route.ts runs
 * three queries under Promise.all and will pay for that. It is an admin route,
 * infrequent, and correctness is unaffected — but if it feels slow, raise this
 * to 2 or 3 rather than removing it, and keep instances × max well under 200.
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
        max: 1,
        idle_timeout: 20,
      }),
      { schema }
    )
  : drizzleSqlite(
      new Database(path.join(process.cwd(), "fp-erp.db")),
      { schema }
    );
