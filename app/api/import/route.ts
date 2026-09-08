import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { csvImports, csvImportErrors, suppliers, apiKeys, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import { ensureApiKeysTable } from "@/lib/db/ensure-tables";
import Papa from "papaparse";
import crypto from "crypto";
import { importOrderRows } from "@/lib/import-rows";

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

  // Insert the import record, then read it back to get the ID
  await db.insert(csvImports).values({
    filename: (file as File).name,
    importedBy: userId,
    rowCount: rawRows.length,
    status: "processing",
  });

  const [importRecord] = await db
    .select({ id: csvImports.id })
    .from(csvImports)
    .orderBy(desc(csvImports.id))
    .limit(1);

  const importId = importRecord.id;

  const allSuppliers = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers);

  // The one row processor, shared with /api/n8n/import. See lib/import-rows.ts
  // for why this is not inlined here.
  const { successCount, errors, ignoredHeaders } = await importOrderRows(
    rawRows,
    allSuppliers as { id: number; name: string }[]
  );

  for (const e of errors) {
    await db.insert(csvImportErrors).values({ importId, ...e });
  }

  await db
    .update(csvImports)
    .set({ successCount, errorCount: errors.length, status: "done" })
    .where(eq(csvImports.id, importId));

  // ignoredHeaders is reported rather than swallowed. A column whose title has
  // drifted out of HEADER_MAP is dropped silently and the import still says it
  // succeeded, which is exactly how the sheet's units and value columns went
  // missing for a long time without anyone noticing.
  return NextResponse.json({
    importId,
    successCount,
    errorCount: errors.length,
    total: rawRows.length,
    ignoredHeaders,
  });
}
