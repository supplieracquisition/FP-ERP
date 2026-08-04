import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    const columns = await client`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'fabric_details'
      ORDER BY ordinal_position
    `;
    
    console.log("fabric_details columns:");
    columns.forEach((c: any) => {
      console.log(`  ${c.column_name}: ${c.data_type} (nullable: ${c.is_nullable})`);
    });

    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
