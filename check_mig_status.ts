import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    const migrations = await client`
      SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5
    `;
    
    console.log(`Found ${migrations.length} migration record(s):`);
    migrations.forEach((m: any) => {
      console.log(`  - ${m.hash.substring(0, 8)}... (${m.created_at})`);
    });

    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
