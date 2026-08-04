import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    // Check for pob_fabric_colors
    const pfc = await client`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'pob_fabric_colors'
    `;
    
    if (pfc[0].count > 0) {
      const pfcRows = await client`SELECT COUNT(*) as count FROM pob_fabric_colors`;
      console.log(`✓ pob_fabric_colors exists with ${pfcRows[0].count} row(s)`);
    } else {
      console.log(`✗ pob_fabric_colors does NOT exist`);
    }

    // Check for pob_product_fabric_mapping
    const ppfm = await client`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'pob_product_fabric_mapping'
    `;
    
    if (ppfm[0].count > 0) {
      const ppfmRows = await client`SELECT COUNT(*) as count FROM pob_product_fabric_mapping`;
      console.log(`✓ pob_product_fabric_mapping exists with ${ppfmRows[0].count} row(s)`);
    } else {
      console.log(`✗ pob_product_fabric_mapping does NOT exist`);
    }

    await client.end();
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
