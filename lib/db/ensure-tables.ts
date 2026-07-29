import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function ensureApiKeysTable() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        key TEXT NOT NULL UNIQUE,
        created_by INTEGER NOT NULL REFERENCES users(id),
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT now()
      )
    `);
  } catch (error) {
    console.error("Error creating api_keys table:", error);
  }
}
