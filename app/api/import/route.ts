import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { csvImports, csvImportErrors, suppliers, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import { verifyApiKeyFromRequest } from "@/lib/apiKey";
import Papa from "papaparse";
import { importOrderRows } from "@/lib/import-rows";
import { logActivity, SYSTEM_ACTOR } from "@/lib/activity";

export async function POST(request: NextRequest) {
  // Allow either cookie-based auth or API key auth.
  //
  // The key check is lib/apiKey.ts, not a copy of it. The copy that used to
  // live here hashed the header untrimmed, so a key carrying one trailing
  // newline from an integration's header config read as invalid — while the
  // same key worked against /api/n8n/import, which already used the shared
  // verifier.
  let userId: number | null = null;
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    // ensureApiKeysTable() used to run inside the local verifier. Dropped with
    // it: the table exists in production (the n8n import authenticates against
    // it hourly), and a credential check is the wrong place to be issuing DDL.
    if (await verifyApiKeyFromRequest(request)) {
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

  /**
   * ONE entry per import, never one per row.
   *
   * A single upload of the standing MTO sheet touches hundreds of orders. Per
   * order that would be several hundred audit rows for one human action, and a
   * day of real activity would be unreadable underneath it. The csv_imports
   * record already holds the per-row detail — including every error — so this
   * entry names the file and the counts and leaves the breakdown where it
   * already lives.
   *
   * The cost of that choice, stated plainly: searching an order id will NOT
   * show that an import touched it. Human changes to that order still appear.
   */
  // This route accepts either a signed-in internal user or an API key that
  // borrows an admin's id for imported_by, so there is no session to hand over.
  // The actor is rebuilt from the resolved userId, and falls back to the system
  // actor when the import was machine-triggered.
  const [actor] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await logActivity(
    actor
      ? { user: { id: String(actor.id), name: actor.name, role: actor.role } }
      : SYSTEM_ACTOR,
    {
    action: "import.run",
    entityType: "import",
    entityId: importId,
    summary: `Imported ${(file as File).name}: ${successCount} row${successCount !== 1 ? "s" : ""} applied, ${errors.length} error${errors.length !== 1 ? "s" : ""}`,
    details: {
      filename: (file as File).name,
      rows: rawRows.length,
      successCount,
      errorCount: errors.length,
      ignoredHeaders,
    },
  }
  );

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
