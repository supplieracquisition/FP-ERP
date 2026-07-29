import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fabricDetails, fabricColors } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  await requireInternal();

  const { searchParams } = new URL(request.url);
  const styleCode = searchParams.get("styleCode");

  if (!styleCode) {
    return NextResponse.json(
      { error: "styleCode query parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Find fabric details by style code
    const details = await db
      .select()
      .from(fabricDetails)
      .where(eq(fabricDetails.style, styleCode));

    console.log(`Found ${details.length} fabric details for style ${styleCode}`);

    if (details.length === 0) {
      return NextResponse.json(
        { error: "Fabric details not found for this style" },
        { status: 404 }
      );
    }

    // Get colors for the first fabric detail (typically there's one per style)
    const detail = details[0];
    console.log(`Getting colors for fabricDetailsId ${detail.id}, fabricCode: ${detail.fabricCode}`);

    const colors = await db
      .select()
      .from(fabricColors)
      .where(eq(fabricColors.fabricDetailsId, detail.id));

    console.log(`Found ${colors.length} colors for fabricDetailsId ${detail.id}`);

    return NextResponse.json({
      fabricCode: detail.fabricCode,
      product: detail.product,
      printMethod: detail.printMethod,
      decorations: detail.decorations,
      colors: colors.map((c) => ({
        colorCode: c.colorCode,
        supplier: c.supplier,
      })),
    });
  } catch (error) {
    console.error("Fabric details error:", error);
    return NextResponse.json(
      { error: "Failed to fetch fabric details" },
      { status: 500 }
    );
  }
}
