import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { parseMTOSuppliers } from "@/lib/csv/supplierParser";
import { eq } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";

export async function POST(request: NextRequest) {
  await requireInternal();

  try {
    const body = await request.json();
    const { mtoFilePath } = body;

    if (!mtoFilePath) {
      return NextResponse.json(
        { error: "mtoFilePath is required" },
        { status: 400 }
      );
    }

    console.log(`Parsing suppliers from MTO template: ${mtoFilePath}`);

    // Parse suppliers from MTO template
    const mtoSuppliers = await parseMTOSuppliers(mtoFilePath);
    console.log(`Parsed ${mtoSuppliers.length} unique suppliers`);

    let created = 0;
    let updated = 0;

    for (const supplier of mtoSuppliers) {
      // Check if supplier exists
      const existing = await db
        .select()
        .from(suppliers)
        .where(eq(suppliers.name, supplier.name));

      if (existing.length === 0) {
        // Create new supplier
        console.log(`Creating new supplier: ${supplier.name}`);
        await db.insert(suppliers).values({
          name: supplier.name,
          salesRepName: supplier.salesRepName,
          contactEmail: supplier.email,
          pocName: supplier.pocName,
          pocEmail: supplier.pocEmail,
          address: supplier.address,
          active: true,
        });
        created++;
      } else {
        // Update existing supplier with new details, only if not already set
        console.log(`Updating supplier: ${supplier.name}`);
        const updates: any = {};
        if (!existing[0].salesRepName && supplier.salesRepName) updates.salesRepName = supplier.salesRepName;
        if (!existing[0].contactEmail && supplier.email) updates.contactEmail = supplier.email;
        if (!existing[0].pocName && supplier.pocName) updates.pocName = supplier.pocName;
        if (!existing[0].pocEmail && supplier.pocEmail) updates.pocEmail = supplier.pocEmail;
        if (!existing[0].address && supplier.address) updates.address = supplier.address;

        if (Object.keys(updates).length > 0) {
          await db
            .update(suppliers)
            .set(updates)
            .where(eq(suppliers.name, supplier.name));
        }
        updated++;
      }
    }

    console.log(`Sync complete: ${created} created, ${updated} updated`);

    return NextResponse.json({
      success: true,
      counts: {
        total: mtoSuppliers.length,
        created,
        updated,
      },
      message: `Supplier sync complete: ${created} new suppliers created, ${updated} suppliers updated`,
    });
  } catch (error) {
    console.error("Supplier sync error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to sync suppliers",
      },
      { status: 500 }
    );
  }
}
