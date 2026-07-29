import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fabricColors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  await requireInternal();

  const { searchParams } = new URL(request.url);
  const fabricCode = searchParams.get("fabricCode");

  if (!fabricCode) {
    return NextResponse.json(
      { error: "fabricCode query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const colors = await db
      .select({
        colorCode: fabricColors.colorCode,
        supplier: fabricColors.supplier,
      })
      .from(fabricColors)
      .where(eq(fabricColors.fabricCode, fabricCode));

    if (colors.length === 0) {
      return NextResponse.json(
        { error: "No colors found for this fabric code" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      fabricCode,
      colors: colors.sort((a, b) =>
        (a.colorCode || "").localeCompare(b.colorCode || "")
      ),
      count: colors.length,
    });
  } catch (error) {
    console.error("Fabric colors error:", error);
    return NextResponse.json(
      { error: "Failed to fetch fabric colors" },
      { status: 500 }
    );
  }
}
