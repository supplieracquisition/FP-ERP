import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import * as crypto from "crypto";
import * as fs from "fs";

const client = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    const migrationSql = fs.readFileSync('./lib/db/migrations/0001_wild_miek.sql', 'utf-8');
    const hash = crypto.createHash('sha256').update(migrationSql).digest('hex');
    
    console.log(`Migration hash: ${hash}`);
    
    // Check if already recorded
    const existing = await client`
      SELECT id FROM drizzle.__drizzle_migrations WHERE hash = ${hash}
    `;
    
    if (existing.length > 0) {
      console.log("✓ Migration already recorded");
    } else {
      await client`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, NOW())
      `;
      console.log("✓ Migration recorded in drizzle table");
    }

    // Verify one more time
    const check = await client`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'fabric_colors' AND column_name = 'fabric_details_id'
    `;
    
    console.log(`\n✓ PART 1 COMPLETE: fabric_colors.fabric_details_id is now ${check[0].is_nullable === 'YES' ? 'nullable' : 'NOT NULL'}`);

    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
