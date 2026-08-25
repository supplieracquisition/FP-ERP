import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, csvImports, csvImportErrors, suppliers, apiKeys, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import { ensureApiKeysTable } from "@/lib/db/ensure-tables";
import Papa from "papaparse";
import crypto from "crypto";
import {
  HEADER_MAP,
  normalizeHeader,
  suppliedFields,
  PARSE,
  unmappedHeaders,
  buildSupplierIndex,
  resolveSupplier,
} from "@/lib/import-mapping";

async function verifyApiKey(keyString: string): Promise<boolean> {
  try {
    await ensureApiKeysTable();
    const hashedKey = crypto.createHash("sha256").update(keyString).digest("hex");
    const [key] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.key, hashedKey))
      .limit(1);
    return !!key;
  } catch (error) {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Allow either cookie-based auth or API key auth
  let userId: number | null = null;
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const keyString = authHeader.slice(7);
    const isValid = await verifyApiKey(keyString);
    if (isValid) {
      // For API key auth, use a system user (admin)
      const [adminUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .limit(1);
      userId = adminUser?.id || null;
    }
  }

  // If no API key or cookie auth, try session auth
  if (!userId) {
    try {
      const session = await requireInternal();
      userId = Number(session.user.id);
    } catch {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") || formData.get("data");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const text = await (file as Blob).text();
  const { data: rawRows, errors: parseErrors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parseErrors.length > 0 && rawRows.length === 0) {
    return NextResponse.json({ error: "Failed to parse CSV" }, { status: 400 });
  }

  // Normalize headers and build mapping for this CSV's columns
  const rows = rawRows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      normalized[normalizeHeader(key)] = val;
    }
    return normalized;
  });

  // Insert the import record, then read it back to get the ID
  await db.insert(csvImports).values({
    filename: (file as File).name,
    importedBy: userId,
    rowCount: rows.length,
    status: "processing",
  });

  const [importRecord] = await db
    .select({ id: csvImports.id })
    .from(csvImports)
    .orderBy(desc(csvImports.id))
    .limit(1);

  const importId = importRecord.id;
  let successCount = 0;
  let errorCount = 0;

  // Which fields this file can speak to. Anything outside this set is left
  // alone on update rather than written as null — see suppliedFields().
  const headers = Object.keys(rawRows[0] ?? {});
  const present = suppliedFields(headers);
  const ignoredHeaders = unmappedHeaders(headers);

  // Pre-fetch all suppliers for quick lookup
  const allSuppliers = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers);
  const supplierIndex = buildSupplierIndex(allSuppliers as { id: number; name: string }[]);

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    // Map normalized column names to schema field names
    const mapped: Record<string, string> = {};
    for (const [csvKey, val] of Object.entries(row)) {
      const schemaKey = HEADER_MAP[csvKey];
      if (schemaKey) mapped[schemaKey] = val;
    }

    const orderItemId = mapped.orderItemId?.trim();
    const orderId = mapped.orderId?.trim();

    if (!orderItemId || !orderId) {
      await db.insert(csvImportErrors).values({
        importId,
        rowNumber: rowIdx + 2,
        rawData: JSON.stringify(row),
        errorMessage: !orderItemId ? "Missing order_item_id" : "Missing order_id",
      });
      errorCount++;
      continue;
    }

    try {
      // Only fields this CSV actually carries. A field the file omits is not
      // written at all, so an absent column cannot blank out live data.
      const values: Record<string, unknown> = { orderId, orderItemId };
      for (const field of present) {
        if (field === "orderId" || field === "orderItemId" || field === "supplierName") continue;
        const raw = mapped[field]?.trim() ?? "";
        values[field] = PARSE[field] ? PARSE[field](raw) : raw || null;
      }

      // Assignment. Three distinct cases, and collapsing any two of them is
      // what made the previous version destructive:
      //
      //   blank printer   -> genuinely unassigned; return it to the pool
      //   named + matched -> assign, and move it into sample production
      //   named + unknown -> a name we failed to resolve is NOT evidence the
      //                      order is unassigned. Report it and touch nothing.
      //
      // Skipped entirely when the file has no printer column, so a CSV that
      // does not discuss assignment cannot silently un-assign every row.
      if (present.has("supplierName")) {
        const supplierName = mapped.supplierName?.trim();

        if (!supplierName) {
          values.supplierId = null;
          // A claim outlives the assignment it was taken under. Left set, the
          // row returns to the pool already greyed out for everyone but its
          // former holder; claimable() reads a null claimed_at as takeable.
          values.claimedAt = null;
        } else {
          const resolved = resolveSupplier(supplierName, supplierIndex);
          if (resolved.kind === "unmatched") {
            await db.insert(csvImportErrors).values({
              importId,
              rowNumber: rowIdx + 2,
              rawData: JSON.stringify(row),
              errorMessage: resolved.reason,
            });
            errorCount++;
            continue;
          }
          values.supplierId = resolved.supplierId;
          values.productionStage = "sample_production";
        }
      }

      const [existing] = await db
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.orderItemId, orderItemId))
        .limit(1);

      if (existing) {
        // Status is preserved; productionStage only moves when this row
        // assigned a supplier above.
        await db
          .update(orderItems)
          .set({ ...values, updatedAt: new Date().toISOString() })
          .where(eq(orderItems.orderItemId, orderItemId));
      } else {
        await db.insert(orderItems).values({
          status: "in_production",
          productionStage: "sample_production",
          ...values,
          importedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as typeof orderItems.$inferInsert);
      }

      successCount++;
    } catch (err) {
      await db.insert(csvImportErrors).values({
        importId,
        rowNumber: rowIdx + 2,
        rawData: JSON.stringify(row),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      errorCount++;
    }
  }

  await db
    .update(csvImports)
    .set({ successCount, errorCount, status: "done" })
    .where(eq(csvImports.id, importId));

  // ignoredHeaders is reported rather than swallowed. A column whose title has
  // drifted out of HEADER_MAP is dropped silently and the import still says it
  // succeeded, which is exactly how the sheet's units and value columns went
  // missing for a long time without anyone noticing.
  return NextResponse.json({
    importId,
    successCount,
    errorCount,
    total: rows.length,
    ignoredHeaders,
  });
}
