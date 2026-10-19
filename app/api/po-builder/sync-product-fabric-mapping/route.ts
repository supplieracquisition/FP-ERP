import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pobProductFabricMapping } from "@/lib/db/schema";
import { verifyApiKeyFromRequest } from "@/lib/apiKey";

export async function POST(request: NextRequest) {
  // Shared verifier, not a local copy: it trims the key, which a hand-copied
  // one did not. See lib/apiKey.ts.
  if (!(await verifyApiKeyFromRequest(request))) {
    return NextResponse.json({ ok: false, message: "Invalid API key" }, { status: 401 });
  }

  try {
    const { data } = await request.json();
    if (!Array.isArray(data)) {
      return NextResponse.json({ ok: false, message: "Data must be an array" }, { status: 400 });
    }

    // Delete all existing product-fabric mappings
    await db.delete(pobProductFabricMapping);

    // Insert new data
    if (data.length > 0) {
      await db.insert(pobProductFabricMapping).values(
        data.map((item: any) => ({
          styleCode: item.style_code,
          fabricCode: item.fabric_code,
        }))
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Product-fabric mapping synced",
      imported: data.length,
      updated: 0,
      errors: 0,
    });
  } catch (error: any) {
    console.error("Error syncing product-fabric mapping:", error);
    return NextResponse.json(
      { ok: false, message: "Sync failed", errors: [error.message] },
      { status: 500 }
    );
  }
}
