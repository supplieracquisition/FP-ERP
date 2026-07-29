import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fpeSuppliers } from "@/lib/db/schema";
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
    const suppliers = await db
      .select()
      .from(fpeSuppliers)
      .where(eq(fpeSuppliers.styleCode, styleCode))
      .orderBy((table) => table.currentSupplier); // Show current supplier first

    if (suppliers.length === 0) {
      return NextResponse.json(
        { error: "No suppliers found for this style" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      styleCode,
      product: suppliers[0].product,
      suppliers: suppliers.map((s) => ({
        id: s.id,
        supplierName: s.supplierName,
        salesRep: s.salesRep,
        email: s.email,
        currentSupplier: s.currentSupplier,
        standardShippingMoq: s.standardShippingMoq,
        economyShippingMoq: s.economyShippingMoq,
        v4BlankSeaPrice: s.v4BlankSeaPrice,
        v4BlanksAirPrice: s.v4BlanksAirPrice,
        airShipPrice: s.airShipPrice,
        seaShipPrice: s.seaShipPrice,
        bulkProductionTimeline: s.bulkProductionTimeline,
        airShippingTimeline: s.airShippingTimeline,
        seaShippingTimeline: s.seaShippingTimeline,
        weights: s.weights,
      })),
      count: suppliers.length,
    });
  } catch (error) {
    console.error("FPE suppliers error:", error);
    return NextResponse.json(
      { error: "Failed to fetch supplier details" },
      { status: 500 }
    );
  }
}
