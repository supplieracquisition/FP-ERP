import { db } from "@/lib/db";
import { fpeSuppliers, fabricDetails } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireInternal } from "@/lib/permissions";

export async function GET() {
  // Outside the try: requireInternal signals by throwing, and the catch below
  // would turn that into a 500 instead of enforcing access.
  await requireInternal();

  try {
    const products = await db
      .selectDistinct({ styleCode: fpeSuppliers.styleCode, product: fpeSuppliers.product })
      .from(fpeSuppliers)
      .orderBy(fpeSuppliers.styleCode);

    return NextResponse.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
