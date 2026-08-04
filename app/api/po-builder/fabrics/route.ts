import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fabricDetails } from "@/lib/db/schema";
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
    const details = await db
      .select({
        fabricCode: fabricDetails.fabricCode,
      })
      .from(fabricDetails)
      .where(eq(fabricDetails.style, styleCode));

    const fabricCodes = details.map((d) => d.fabricCode).sort();

    return NextResponse.json({
      styleCode,
      fabricCodes,
      count: fabricCodes.length,
    });
  } catch (error) {
    console.error("Fabrics lookup error:", error);
    return NextResponse.json(
      { error: "Failed to fetch fabrics" },
      { status: 500 }
    );
  }
}
