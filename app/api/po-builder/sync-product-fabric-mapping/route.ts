import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pobProductFabricMapping, apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

async function verifyApiKey(keyString: string): Promise<boolean> {
  try {
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
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, message: "Missing API key" }, { status: 401 });
  }

  const keyString = authHeader.slice(7);
  const isValid = await verifyApiKey(keyString);
  if (!isValid) {
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
