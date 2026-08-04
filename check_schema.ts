import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    const columns = await client`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
    `;
    
    console.log("__drizzle_migrations columns:");
    columns.forEach((c: any) => {
      console.log(`  - ${c.column_name}`);
    });

    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
