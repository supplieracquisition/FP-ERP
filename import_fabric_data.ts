/**
 * FABRIC DATA IMPORT SCRIPT
 * ⚠️  WARNING: This script DELETES all existing data from fabric_details and fabric_colors tables.
 * Only run this script if you intend to reimport the complete dataset.
 * Do not commit or run this in production without explicit intention to wipe and reload.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { parse } from "csv-parse/sync";
import * as fs from "fs";
import postgres from "postgres";

interface FabricDetailsRow {
  id: string;
  style: string;
  fabricCode: string;
  sourceDescription: string;
}

interface FabricColorsRow {
  id: string;
  fabricCode: string;
  colorCode: string;
}

const client = postgres(process.env.DATABASE_URL!);

async function importData() {
  try {
    console.log("Starting fabric data import to Supabase...\n");

    // Read and parse fabric_details.csv
    console.log("1️⃣  Reading fabric_details.csv...");
    const detailsContent = fs.readFileSync("./fabric_details.csv", "utf-8");
    const detailsRecords = parse(detailsContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as FabricDetailsRow[];

    console.log(`   Parsed ${detailsRecords.length} rows`);

    // Read and parse fabric_colors.csv
    console.log("\n2️⃣  Reading fabric_colors.csv...");
    const colorsContent = fs.readFileSync("./fabric_colors.csv", "utf-8");
    const colorsRecords = parse(colorsContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as FabricColorsRow[];

    console.log(`   Parsed ${colorsRecords.length} rows`);

    // Clear existing data
    console.log("\n3️⃣  Clearing existing data...");
    await client`DELETE FROM fabric_colors`;
    await client`DELETE FROM fabric_details`;
    console.log("   ✓ Tables cleared");

    // Insert fabric details (batch of 100)
    console.log("\n4️⃣  Inserting fabric_details (batch mode)...");
    if (detailsRecords.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < detailsRecords.length; i += batchSize) {
        const batch = detailsRecords.slice(i, Math.min(i + batchSize, detailsRecords.length));

        const valueParts = batch.map((row) => {
          const product = row.sourceDescription ? `'${row.sourceDescription.replace(/'/g, "''")}'` : `'${row.style} - ${row.fabricCode}'.replace(/'/g, "''")}'`;
          return `(${parseInt(row.id)}, '${row.style}', '${row.fabricCode}', ${product}, null, null, now())`;
        });

        const sql = `INSERT INTO fabric_details (id, style, fabric_code, product, print_method, decorations, synced_at) VALUES ${valueParts.join(", ")}`;
        await client.unsafe(sql);

        const batchEnd = Math.min(i + batchSize, detailsRecords.length);
        console.log(`   ✓ Inserted ${batchEnd}/${detailsRecords.length}`);
      }
    }

    // Insert fabric colors (batch of 100)
    console.log("\n5️⃣  Inserting fabric_colors (batch mode)...");
    if (colorsRecords.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < colorsRecords.length; i += batchSize) {
        const batch = colorsRecords.slice(i, Math.min(i + batchSize, colorsRecords.length));

        const valueParts = batch.map((row) => {
          return `(${parseInt(row.id)}, null, '${row.fabricCode}', '${row.colorCode}', null, now())`;
        });

        const sql = `INSERT INTO fabric_colors (id, fabric_details_id, fabric_code, color_code, supplier, synced_at) VALUES ${valueParts.join(", ")}`;
        await client.unsafe(sql);

        const batchEnd = Math.min(i + batchSize, colorsRecords.length);
        console.log(`   ✓ Inserted ${batchEnd}/${colorsRecords.length}`);
      }
    }

    // Advance sequences to prevent duplicate key errors on next insert
    console.log("\n6️⃣  Advancing PostgreSQL sequences...");
    await client`SELECT setval('fabric_details_id_seq', (SELECT MAX(id) FROM fabric_details))`;
    await client`SELECT setval('fabric_colors_id_seq', (SELECT MAX(id) FROM fabric_colors))`;
    console.log("   ✓ Sequences advanced");

    // Verification queries
    console.log("\n7️⃣  Verifying import...\n");

    const detailsCount = await client`SELECT COUNT(*) as count FROM fabric_details`;
    console.log(`   fabric_details total rows: ${detailsCount[0].count}`);

    const colorsCount = await client`SELECT COUNT(*) as count FROM fabric_colors`;
    console.log(`   fabric_colors total rows: ${colorsCount[0].count}`);

    const fp94 = await client`SELECT style, fabric_code FROM fabric_details WHERE style = 'FP94' ORDER BY fabric_code`;
    console.log(`\n   FP94 fabrics (expect 2):`);
    fp94.forEach((row: any) => {
      console.log(`     - ${row.fabric_code}`);
    });

    const jufeng = await client`SELECT COUNT(*) as count FROM fabric_colors WHERE fabric_code = 'Jufeng #B1722'`;
    console.log(`\n   Jufeng #B1722 colors: ${jufeng[0].count} (expect 6)`);

    const taisum = await client`SELECT COUNT(*) as count FROM fabric_colors WHERE fabric_code = 'Taisum #1033'`;
    console.log(`   Taisum #1033 colors: ${taisum[0].count} (expect 129)`);

    // Sequence verification: insert without id, should get 148
    console.log("\n8️⃣  Verifying sequence works (throwaway insert)...");
    const throwaway = await client`
      INSERT INTO fabric_details (style, fabric_code, product, print_method, decorations, synced_at)
      VALUES ('TEST', 'TEST-CODE', 'Test product', null, null, now())
      RETURNING id
    `;
    const newId = throwaway[0].id;
    console.log(`   Inserted without id, received id: ${newId}`);

    if (newId === 148) {
      console.log(`   ✓ Sequence is correct! (expected 148, got ${newId})`);
    } else {
      console.log(`   ⚠️  Sequence mismatch! (expected 148, got ${newId})`);
    }

    // Clean up throwaway row
    await client`DELETE FROM fabric_details WHERE id = ${newId}`;
    console.log(`   ✓ Throwaway row deleted`);

    console.log("\n✓✓✓ IMPORT AND VERIFICATION COMPLETE ✓✓✓");
    await client.end();
  } catch (err) {
    console.error("Error during import:", err);
    process.exit(1);
  }
}

importData();
