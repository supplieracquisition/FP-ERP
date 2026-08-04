import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    // Check the constraint on fabric_colors.fabric_details_id
    const result = await client`
      SELECT
        column_name,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'fabric_colors' AND column_name = 'fabric_details_id'
    `;
    
    if (result.length > 0) {
      console.log("fabric_colors.fabric_details_id constraint status:");
      console.log(`  is_nullable: ${result[0].is_nullable}`);
      if (result[0].is_nullable === 'YES') {
        console.log("  ✓ Successfully made nullable!");
      } else {
        console.log("  ✗ Still NOT NULL");
      }
    } else {
      console.log("✗ Column not found");
    }

    // Check if api_keys table exists
    const apiKeys = await client`
      SELECT COUNT(*) as count FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'api_keys'
    `;
    
    console.log(`\napi_keys table: ${apiKeys[0].count > 0 ? '✓ exists' : '✗ does not exist'}`);

    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
