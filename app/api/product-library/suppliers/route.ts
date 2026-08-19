import { db } from "@/lib/db";
import { fpeSuppliers, suppliers, orderItems } from "@/lib/db/schema";
import { inArray, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { addDays, parseISO } from "date-fns";
import { requireInternal } from "@/lib/permissions";

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

    // Fetch current orders to calculate load for next 7 days
    const today = new Date().toISOString().slice(0, 10);
    const weekFromNow = addDays(new Date(), 7).toISOString().slice(0, 10);

    const orders = await db
      .select({
        supplierId: orderItems.supplierId,
        printerShipDate: orderItems.printerShipDate,
        status: orderItems.status,
      })
      .from(orderItems)
      .where(
        sql`${orderItems.status} != 'completed' AND ${orderItems.status} != 'delivered' AND ${orderItems.printerShipDate} IS NOT NULL AND ${orderItems.printerShipDate} >= ${today} AND ${orderItems.printerShipDate} <= ${weekFromNow}`
      );

    // Calculate average daily load per supplier for next 7 days
    const loadMap = new Map<number, number>();
    orders.forEach((order) => {
      if (order.supplierId) {
        loadMap.set(order.supplierId, (loadMap.get(order.supplierId) || 0) + 1);
      }
    });

    // Create a map of supplier name to available capacity with fuzzy matching
    const supplierMap = new Map<string, { totalCapacity: number; availableCapacity: number }>();
    suppliersData.forEach((supplier) => {
      if (supplier.name) {
        const totalCapacity = supplier.capacityUnits || 0;
        const currentLoad = Math.ceil((loadMap.get(supplier.id) || 0) / 7); // Average daily load
        const availableCapacity = Math.max(0, totalCapacity - currentLoad);

        // Add exact match
        supplierMap.set(supplier.name.toLowerCase(), { totalCapacity, availableCapacity });

        // Also add partial matches for common variations
        const parts = supplier.name.toLowerCase().split(/[\s,]/);
        parts.forEach((part) => {
          if (part.length > 3) {
            supplierMap.set(part, { totalCapacity, availableCapacity });
          }
        });
      }
    });

    // Merge FPE data with available capacity using fuzzy matching
    const mergedData = fpeData.map((fpe) => {
      let capacityInfo = supplierMap.get(fpe.supplierName.toLowerCase());

      // Try partial matching if exact match failed
      if (!capacityInfo) {
        const fpeParts = fpe.supplierName.toLowerCase().split(/[\s,]/);
        for (const part of fpeParts) {
          if (part.length > 3 && supplierMap.has(part)) {
            capacityInfo = supplierMap.get(part);
            break;
          }
        }
      }

      return {
        ...fpe,
        capacityUnits: capacityInfo?.availableCapacity || 0,
      };
    });

    return NextResponse.json(mergedData);
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json({ error: "Failed to fetch suppliers" }, { status: 500 });
  }
}
