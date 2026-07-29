import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fabricDetails,
  fabricColors,
  fpeSuppliers,
} from "@/lib/db/schema";
import { parseMTOTemplate } from "@/lib/csv/mtoParser";
import { parseFPEDatabase } from "@/lib/csv/fpeParser";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  await requireInternal();

  try {
    const body = await request.json();
    const { mtoFilePath, fpeFilePath } = body;

    if (!mtoFilePath || !fpeFilePath) {
      return NextResponse.json(
        { error: "Both mtoFilePath and fpeFilePath are required" },
        { status: 400 }
      );
    }

    // Parse MTO Template
    const { fabricDetails: fabricDetailsRecords, fabricColors: dedupFabricColors } =
      await parseMTOTemplate(mtoFilePath);

    // Colors are already deduplicated by the parser

    // Parse FPE Database
    const fpeRecords = await parseFPEDatabase(fpeFilePath);

    // Clear existing data
    await db.delete(fabricColors);
    await db.delete(fabricDetails);
    await db.delete(fpeSuppliers);

    console.log(`Inserting ${fabricDetailsRecords.length} fabric details...`);
    // Insert fabric details
    const insertedDetails = await db
      .insert(fabricDetails)
      .values(fabricDetailsRecords)
      .returning();

    console.log(`Inserted ${insertedDetails.length} fabric details`);

    // Create map of fabric details by (style, fabricCode) for color insertion
    const detailsMap = new Map<string, number>();
    for (const detail of insertedDetails) {
      const key = `${detail.style}|${detail.fabricCode}`;
      detailsMap.set(key, detail.id);
      console.log(`Mapped ${key} -> ID ${detail.id}`);
    }

    // Insert fabric colors
    console.log(`Processing ${dedupFabricColors.length} fabric colors...`);
    const colorsToInsert: any[] = [];

    for (const color of dedupFabricColors) {
      // Find the fabric detail that matches BOTH style and fabric code
      const matchingDetail = insertedDetails.find(
        (d) => d.style === color.style && d.fabricCode === color.fabricCode
      );

      if (!matchingDetail) {
        console.warn(`No fabric detail found for ${color.style}|${color.fabricCode}`);
        continue;
      }

      colorsToInsert.push({
        fabricDetailsId: matchingDetail.id,
        fabricCode: color.fabricCode,
        colorCode: color.colorCode,
        supplier: color.supplier,
      });
    }

    console.log(`Inserting ${colorsToInsert.length} fabric colors...`);
    if (colorsToInsert.length > 0) {
      await db.insert(fabricColors).values(colorsToInsert);
    }
    console.log(`Inserted ${colorsToInsert.length} fabric colors`);

    console.log(`Inserting ${fpeRecords.length} FPE suppliers...`);
    // Insert FPE suppliers
    await db.insert(fpeSuppliers).values(fpeRecords);

    return NextResponse.json({
      success: true,
      counts: {
        fabricDetails: insertedDetails.length,
        fabricColors: colorsToInsert.length,
        fpeSuppliers: fpeRecords.length,
      },
      message: "Fabric and supplier data synced successfully",
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync fabric data",
      },
      { status: 500 }
    );
  }
}
