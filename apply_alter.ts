import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    console.log("Applying: ALTER TABLE fabric_colors ALTER COLUMN fabric_details_id DROP NOT NULL");
    
    await client`
      ALTER TABLE fabric_colors ALTER COLUMN fabric_details_id DROP NOT NULL
    `;
    
    console.log("✓ Column made nullable");

    // Verify
    const result = await client`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'fabric_colors' AND column_name = 'fabric_details_id'
    `;
    
    console.log(`✓ Verified: is_nullable = ${result[0].is_nullable}`);

    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
