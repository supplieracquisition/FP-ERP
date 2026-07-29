import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import * as schema from "./schema";

export const db: any = process.env.DATABASE_URL
  ? drizzlePg(
      postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" }),
      { schema }
    )
  : drizzleSqlite(
      new Database(path.join(process.cwd(), "fp-erp.db")),
      { schema }
    );
