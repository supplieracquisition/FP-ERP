import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    const migrations = await client`
      SELECT * FROM drizzle.__drizzle_migrations ORDER BY installed_on DESC
    `;
    
    console.log(`Found ${migrations.length} migration(s):`);
    migrations.forEach((m: any) => {
      console.log(`  - ${m.name} (${m.installed_on})`);
    });

    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
