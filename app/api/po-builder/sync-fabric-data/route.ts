import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  fabricDetails,
  fabricColors,
  fpeSuppliers,
  apiKeys,
} from "@/lib/db/schema";
import { parseMTOTemplateFromContent } from "@/lib/csv/mtoParser";
import { parseFPEDatabaseFromContent } from "@/lib/csv/fpeParser";
import { count, eq } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import crypto from "crypto";

/**
 * The floor that applies when the table being replaced is EMPTY.
 *
 * The 50%-shrinkage check below compares a payload against what is already
 * stored, so it cannot say anything at all about the first sync into an empty
 * table — and that is precisely when this endpoint is most dangerous, because
 * the sync is destructive (delete-then-insert) and reports success: true no
 * matter how little it wrote. A truncated payload lands silently, and it is
 * sticky afterwards: once the table holds a handful of rows the 50% threshold
 * is a handful too, so nothing ever complains again.
 *
 * That is not hypothetical. Production's fpe_suppliers ended up holding only a
 * fraction of the sheet this way, and the Product Library — which just lists
 * whatever distinct style codes are in that table — quietly showed a fraction
 * of the catalogue for months.
 *
 * 50 is a truncation detector, not an assertion about sheet size. The real
 * sheets parse to ~160 fabric details and ~221 FPE suppliers, so a legitimate
 * export has to lose two thirds of itself before this trips, while the partial
 * payloads worth catching are an order of magnitude smaller. force: true still
 * overrides it, for a genuinely small sheet.
 */
const MIN_ROWS_WITHOUT_BASELINE = 50;

/**
 * Returns an error message if this payload must not be allowed to replace what
 * is stored, or null if the sync may proceed.
 *
 * Both datasets go through here so the two cannot drift apart — the
 * empty-table hole originally existed in both copies of this check.
 */
function rejectionReason(
  label: string,
  parsed: number,
  current: number,
  force: boolean
): string | null {
  if (parsed === 0) {
    // Not overridable by force: replacing a table with nothing is never the
    // intent, and `force` exists to accept a SMALL sync, not an empty one.
    return `${label} validation failed: parsed 0 rows.`;
  }

  if (force) return null;

  if (current === 0) {
    return parsed < MIN_ROWS_WITHOUT_BASELINE
      ? `${label} validation failed: parsed ${parsed} rows into an empty table, ` +
          `below the ${MIN_ROWS_WITHOUT_BASELINE}-row floor for a sync with nothing ` +
          `to compare against (likely a truncated payload). Use force: true to override.`
      : null;
  }

  const threshold = Math.ceil(current * 0.5);
  return parsed < threshold
    ? `${label} validation failed: parsed ${parsed} rows, current DB has ${current} ` +
        `(would delete >50%). Use force: true to override.`
    : null;
}

interface SyncSummary {
  mto?: {
    rowsParsed: number;
    previousRowCount: number;
    newRowCount: number;
  };
  fpe?: {
    rowsParsed: number;
    previousRowCount: number;
    newRowCount: number;
  };
}

async function verifyApiKey(keyString: string): Promise<boolean> {
  try {
    const hashedKey = crypto.createHash("sha256").update(keyString).digest("hex");
    const [key] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.key, hashedKey))
      .limit(1);

    if (!key) return false;

    // Log usage by updating lastUsedAt
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(apiKeys.id, key.id));

    return true;
  } catch (error) {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Allow either API key auth or session auth
  let isApiKeyAuth = false;
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const keyString = authHeader.slice(7);
    const isValid = await verifyApiKey(keyString);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    isApiKeyAuth = true;
  }

  // If no API key provided, require session auth
  if (!isApiKeyAuth) {
    await requireInternal();
  }

  try {
    const body = await request.json();
    const { mtoContent, fpeContent, force = false } = body;

    if (!mtoContent && !fpeContent) {
      return NextResponse.json(
        { error: "At least one of mtoContent or fpeContent is required" },
        { status: 400 }
      );
    }

    const summary: SyncSummary = {};
    let mtoDetailsRecords: any[] = [];
    let mtoColorsRecords: any[] = [];
    let fpeRecords: any[] = [];

    // PARSE & VALIDATE MTO if provided
    if (mtoContent) {
      console.log("Parsing MTO Template...");
      const parsed = await parseMTOTemplateFromContent(mtoContent);
      mtoDetailsRecords = parsed.fabricDetails;
      mtoColorsRecords = parsed.fabricColors;

      const currentMtoDetailsCount = await db
        .select({ count: count() })
        .from(fabricDetails);
      const currentMtoDetailsNum = currentMtoDetailsCount[0]?.count || 0;

      console.log(
        `MTO: parsed ${mtoDetailsRecords.length} details, current DB has ${currentMtoDetailsNum}`
      );

      const mtoRejection = rejectionReason(
        "MTO",
        mtoDetailsRecords.length,
        currentMtoDetailsNum,
        force
      );
      if (mtoRejection) {
        return NextResponse.json({ error: mtoRejection }, { status: 400 });
      }

      summary.mto = {
        rowsParsed: mtoDetailsRecords.length,
        previousRowCount: currentMtoDetailsNum,
        newRowCount: 0, // filled after insert
      };
    }

    // PARSE & VALIDATE FPE if provided
    if (fpeContent) {
      console.log("Parsing FPE Database...");
      fpeRecords = await parseFPEDatabaseFromContent(fpeContent);

      const currentFpeCount = await db
        .select({ count: count() })
        .from(fpeSuppliers);
      const currentFpeNum = currentFpeCount[0]?.count || 0;

      console.log(
        `FPE: parsed ${fpeRecords.length} records, current DB has ${currentFpeNum}`
      );

      const fpeRejection = rejectionReason(
        "FPE",
        fpeRecords.length,
        currentFpeNum,
        force
      );
      if (fpeRejection) {
        return NextResponse.json({ error: fpeRejection }, { status: 400 });
      }

      summary.fpe = {
        rowsParsed: fpeRecords.length,
        previousRowCount: currentFpeNum,
        newRowCount: 0, // filled after insert
      };
    }

    // SYNC MTO in transaction
    if (mtoContent && summary.mto) {
      await db.transaction(async (tx) => {
        console.log("Deleting existing fabric details and colors...");
        await tx.delete(fabricColors);
        await tx.delete(fabricDetails);

        console.log(`Inserting ${mtoDetailsRecords.length} fabric details...`);
        const insertedDetails = await tx
          .insert(fabricDetails)
          .values(mtoDetailsRecords)
          .returning();

        // Create map of fabric details for color insertion
        const detailsMap = new Map<string, number>();
        for (const detail of insertedDetails) {
          const key = `${detail.style}|${detail.fabricCode}`;
          detailsMap.set(key, detail.id);
        }

        // Insert fabric colors
        console.log(`Processing ${mtoColorsRecords.length} fabric colors...`);
        const colorsToInsert: any[] = [];

        for (const color of mtoColorsRecords) {
          const matchingDetail = insertedDetails.find(
            (d) => d.style === color.style && d.fabricCode === color.fabricCode
          );

          if (!matchingDetail) {
            console.warn(
              `No fabric detail found for ${color.style}|${color.fabricCode}`
            );
            continue;
          }

          colorsToInsert.push({
            fabricDetailsId: matchingDetail.id,
            fabricCode: color.fabricCode,
            colorCode: color.colorCode,
            supplier: color.supplier,
          });
        }

        if (colorsToInsert.length > 0) {
          await tx.insert(fabricColors).values(colorsToInsert);
        }
        console.log(`Inserted ${insertedDetails.length} fabric details`);

        summary.mto!.newRowCount = insertedDetails.length;
      });
    }

    // SYNC FPE in transaction
    if (fpeContent && summary.fpe) {
      await db.transaction(async (tx) => {
        console.log("Deleting existing FPE suppliers...");
        await tx.delete(fpeSuppliers);

        console.log(`Inserting ${fpeRecords.length} FPE suppliers...`);
        await tx.insert(fpeSuppliers).values(fpeRecords);

        summary.fpe!.newRowCount = fpeRecords.length;
      });
    }

    return NextResponse.json({
      success: true,
      summary,
      message: "Data synced successfully",
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to sync data",
      },
      { status: 500 }
    );
  }
}
