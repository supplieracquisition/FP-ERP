import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { csvImports, csvImportErrors, suppliers, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import Papa from "papaparse";
import { verifyApiKeyFromRequest } from "@/lib/apiKey";
// Shared with /api/import — the SAME row processor, not a second copy of it.
// These two routes read the same sheet, and every time one of them has carried
// its own version of this logic the two have drifted apart silently. See
// lib/import-rows.ts.
import { importOrderRows } from "@/lib/import-rows";

export async function POST(request: NextRequest) {
  // Machine endpoint: authenticated by API key, not by session. Checked before
  // the body is read so an unauthenticated caller cannot reach the parser.
  const apiKey = await verifyApiKeyFromRequest(request);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  let text: string;
  // Derived here rather than after the block below, because `file` is scoped to
  // that block. Reading it outside threw a ReferenceError on the form-data path
  // and 500'd the request; the endpoint only worked at all because n8n posts
  // raw text/csv, where the old ternary short-circuited before evaluating it.
  let filename = `n8n-import-${Date.now()}.csv`;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("text/csv")) {
    // Raw CSV text
    text = await request.text();
  } else {
    // Form data
    const formData = await request.formData();
    const file = formData.get("file") || formData.get("data");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    text = await (file as Blob).text();
    filename = (file as File).name || filename;
  }

  // Get or create default admin user for n8n imports
  let adminUserId: number;
  try {
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    if (admin) {
      adminUserId = admin.id;
    } else {
      return NextResponse.json({ error: "No admin user found" }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
  }

  const { data: rawRows } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (rawRows.length === 0) {
    return NextResponse.json({ error: "No rows in CSV" }, { status: 400 });
  }

  await db.insert(csvImports).values({
    filename,
    importedBy: adminUserId,
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

  // Identical processing to the manual upload, by construction. This route used
  // to carry its own weaker version: exact lowercase name matching (which the
  // production sheet defeats with its " MTO" suffix), a bare INSERT that could
  // never revise a stored row, and unconditional writes that could blank live
  // data with an absent column.
  const { successCount, errors, ignoredHeaders } = await importOrderRows(
    rawRows,
    allSuppliers as { id: number; name: string }[]
  );

  for (const e of errors) {
    await db.insert(csvImportErrors).values({ importId, ...e });
  }

  await db
    .update(csvImports)
    .set({ successCount, errorCount: errors.length, status: "completed" })
    .where(eq(csvImports.id, importId));

  return NextResponse.json({
    ok: true,
    importId,
    successCount,
    errorCount: errors.length,
    ignoredHeaders,
    message: `Imported ${successCount} orders (${errors.length} errors)`,
  });
}
