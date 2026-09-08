import { db } from "@/lib/db";
import { fpeSuppliers, suppliers, orderItems } from "@/lib/db/schema";
import { inArray, eq, and, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireInternal } from "@/lib/permissions";
import {
  occupiesCapacity,
  spreadDays,
  pipelineCeiling,
  utcDay,
  addUtcDays,
} from "@/lib/capacity";
import { buildSupplierIndex, resolveSupplier } from "@/lib/import-mapping";

export async function POST(request: Request) {
  // Outside the try: requireInternal signals by throwing, and the catch below
  // would turn that into a 500 instead of enforcing access.
  await requireInternal();

  try {
    const { styleCodes } = await request.json();

    if (!styleCodes || !Array.isArray(styleCodes) || styleCodes.length === 0) {
      return NextResponse.json({ error: "No style codes provided" }, { status: 400 });
    }

    const fpeData = await db
      .select()
      .from(fpeSuppliers)
      .where(inArray(fpeSuppliers.styleCode, styleCodes))
      .orderBy(fpeSuppliers.styleCode);

    // Fetch capacity data from suppliers table
    const suppliersData = await db
      .select()
      .from(suppliers);

    // How full each factory's floor is RIGHT NOW, on exactly the definition the
    // capacity heatmap uses. This figure used to be computed here from its own
    // private rules and disagreed with the heatmap in three separate ways:
    //
    //   - it read capacity_units, the retired orders-per-DAY field
    //   - it compared ceil(7-day count / 7) against that daily number, mixing a
    //     windowed count with a rate
    //   - it looked suppliers up by FUZZY NAME, splitting each name on
    //     whitespace and registering every fragment over three characters,
    //     last-write-wins. Against the real supplier list "dongguan" was
    //     claimed by 3 suppliers, "clothing" by 3 and "ltd." by 6 -- so a row
    //     that missed an exact match was shown a completely different
    //     factory's capacity.
    const orders = await db
      .select({
        supplierId: orderItems.supplierId,
        supplierShipDate: orderItems.supplierShipDate,
      })
      .from(orderItems)
      .where(occupiesCapacity());

    const supplierById = new Map<number, any>(
      (suppliersData as any[]).map((s) => [s.id, s])
    );

    // Pipeline depth: orders on the floor today, same window as the heatmap.
    const today = utcDay(new Date().toISOString());
    const pipeline = new Map<number, number>();
    for (const o of orders) {
      if (!o.supplierId || !o.supplierShipDate) continue;
      const supplier = supplierById.get(o.supplierId);
      if (!supplier) continue;
      const ship = utcDay(o.supplierShipDate);
      const start = addUtcDays(ship, -spreadDays(supplier));
      if (today >= start && today <= ship) {
        pipeline.set(o.supplierId, (pipeline.get(o.supplierId) ?? 0) + 1);
      }
    }

    // Name -> supplier, using the SAME resolver the importers use. It already
    // understands the sheet's " MTO" suffix and punctuation drift, and it
    // refuses to guess between two suppliers that collapse onto one key rather
    // than silently picking the last one seen.
    const supplierIndex = buildSupplierIndex(
      (suppliersData as { id: number; name: string }[]).filter((s) => s.name)
    );

    const mergedData = fpeData.map((fpe) => {
      const resolved = fpe.supplierName
        ? resolveSupplier(fpe.supplierName, supplierIndex)
        : ({ kind: "unmatched", reason: "No printer name" } as const);

      if (resolved.kind === "unmatched") {
        // Unknown or ambiguous name. Reported as unknown rather than defaulted
        // to 0, which would read as "this factory is full".
        return {
          ...fpe,
          pipelineCount: null,
          pipelineCeiling: null,
          availableCapacity: null,
          capacityUnknownReason: resolved.reason,
        };
      }

      const supplier = supplierById.get(resolved.supplierId);
      const ceiling = supplier ? pipelineCeiling(supplier) : null;
      const count = pipeline.get(resolved.supplierId) ?? 0;

      return {
        ...fpe,
        pipelineCount: count,
        pipelineCeiling: ceiling,
        // Null, not 0, when there is no ceiling -- weekly_capacity or
        // production_time is unset, so remaining headroom is unknowable. Zero
        // would mean "no room left", which is a different and wrong claim.
        availableCapacity: ceiling == null ? null : Math.max(0, ceiling - count),
        capacityUnknownReason: ceiling == null ? "Capacity not set" : null,
      };
    });

    return NextResponse.json(mergedData);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json({ error: "Failed to fetch suppliers" }, { status: 500 });
  }
}
