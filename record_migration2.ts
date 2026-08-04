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
    
    console.log(`Recording migration with hash: ${hash.substring(0, 16)}...`);
    
    // created_at is bigint (milliseconds since epoch)
    const now = Date.now();
    
    await client`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${now})
    `;
    console.log("✓ Migration recorded");

    // Verify
    const check = await client`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'fabric_colors' AND column_name = 'fabric_details_id'
    `;
    
    console.log(`\n✓✓✓ PART 1 COMPLETE ✓✓✓`);
    console.log(`fabric_colors.fabric_details_id is now: ${check[0].is_nullable === 'YES' ? 'NULLABLE ✓' : 'NOT NULL ✗'}`);

    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
