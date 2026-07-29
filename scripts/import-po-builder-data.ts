import { db } from "@/lib/db";
import {
  fabricDetails,
  fabricColors,
  fpeSuppliers,
} from "@/lib/db/schema";
import { parseMTOTemplate, deduplicateFabricColors } from "@/lib/csv/mtoParser";
import { parseFPEDatabase } from "@/lib/csv/fpeParser";
import path from "path";

async function importPoBuilderData() {
  try {
    const mtoPath = path.join(
      process.cwd(),
      "po builder data",
      "_New FP Exclusives MTO Order Template - Master Sheet - Backend Database For Exclusive Blanks.csv"
    );

    const fpePath = path.join(
      process.cwd(),
      "po builder data",
      "FPE Database - HJA Content.csv"
    );

    console.log("Starting import...");
    console.log(`MTO file: ${mtoPath}`);
    console.log(`FPE file: ${fpePath}`);

    // Parse MTO Template
    console.log("\nParsing MTO Template...");
    const { fabricDetails: fabricDetailsRecords, fabricColors: fabricColorsRecords } =
      await parseMTOTemplate(mtoPath);
    const dedupFabricColors = await deduplicateFabricColors(fabricColorsRecords);
    console.log(`  Parsed ${fabricDetailsRecords.length} fabric details`);
    console.log(`  Parsed ${dedupFabricColors.length} fabric colors`);

    // Parse FPE Database
    console.log("\nParsing FPE Database...");
    const fpeRecords = await parseFPEDatabase(fpePath);
    console.log(`  Parsed ${fpeRecords.length} supplier records`);

    // Clear existing data
    console.log("\nClearing existing data...");
    const deletedColors = await db.delete(fabricColors);
    const deletedDetails = await db.delete(fabricDetails);
    const deletedSuppliers = await db.delete(fpeSuppliers);
    console.log("  Data cleared");

    // Insert fabric details
    console.log("\nInserting fabric details...");
    const insertedDetails = await db
      .insert(fabricDetails)
      .values(fabricDetailsRecords)
      .returning();
    console.log(`  Inserted ${insertedDetails.length} fabric details`);

    // Create map of fabric details for color insertion
    const detailsMap = new Map<string, number>();
    for (const detail of insertedDetails) {
      const key = `${detail.style}|${detail.fabricCode}`;
      detailsMap.set(key, detail.id);
    }

    // Insert fabric colors
    console.log("\nInserting fabric colors...");
    const colorsToInsert = dedupFabricColors.map((color) => {
      const firstDetail = fabricDetailsRecords.find(
        (fd) => fd.fabricCode === color.fabricCode
      );
      if (!firstDetail) return null;

      const key = `${firstDetail.style}|${color.fabricCode}`;
      const detailsId = detailsMap.get(key);

      if (!detailsId) return null;

      return {
        fabricDetailsId: detailsId,
        fabricCode: color.fabricCode,
        colorCode: color.colorCode,
        supplier: color.supplier,
      };
    });

    const validColors = colorsToInsert.filter(Boolean);
    if (validColors.length > 0) {
      await db.insert(fabricColors).values(validColors);
      console.log(`  Inserted ${validColors.length} fabric colors`);
    }

    // Insert FPE suppliers
    console.log("\nInserting FPE suppliers...");
    await db.insert(fpeSuppliers).values(fpeRecords);
    console.log(`  Inserted ${fpeRecords.length} supplier records`);

    console.log("\n✅ Import completed successfully!");
    console.log(
      `\nSummary:\n  Fabric Details: ${insertedDetails.length}\n  Fabric Colors: ${validColors.length}\n  FPE Suppliers: ${fpeRecords.length}`
    );

    process.exit(0);
  } catch (error) {
    console.error("❌ Import failed:", error);
    process.exit(1);
  }
}

importPoBuilderData();
