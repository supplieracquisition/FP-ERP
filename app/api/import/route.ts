import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, csvImports, csvImportErrors, suppliers, apiKeys, users } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import { ensureApiKeysTable } from "@/lib/db/ensure-tables";
import Papa from "papaparse";
import crypto from "crypto";

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

async function verifyApiKey(keyString: string): Promise<boolean> {
  try {
    await ensureApiKeysTable();
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

const HEADER_MAP: Record<string, string> = {
  order_id: "orderId",
  orderid: "orderId",
  order_item_id: "orderItemId",
  orderitemid: "orderItemId",
  item_id: "orderItemId",
  order_name: "orderName",
  name: "orderName",
  order_created_at: "orderCreatedAt",
  created_at: "orderCreatedAt",
  style_code: "styleCode",
  style: "styleCode",
  color: "color",
  apparel_color: "color",
  garment_color: "color",
  template_pdf: "templatePdf",
  pdf: "templatePdf",
  printer_ship_date: "printerShipDate",
  ship_date: "printerShipDate",
  print_ship_date: "printerShipDate",
  original_printer_ship_date: "originalPrinterShipDate",
  original_ship_date: "originalPrinterShipDate",
  due_date: "dueDate",
  order_due_date: "dueDate",
  print_type: "printType",
  print_locations: "printLocations",
  decorating_methods: "decoratingMethods",
  decoration_methods: "decoratingMethods",
  quantity: "quantity",
  qty: "quantity",
  units: "quantity",
  total_units_ordered: "quantity",
  total_number_of_units_ordered: "quantity",
  total_units: "quantity",
  order_units: "quantity",
  total_value: "totalValue",
  value: "totalValue",
  order_value: "totalValue",
  total_order_value: "totalValue",
  total_order_item_total: "totalValue",
  order_item_value: "totalValue",
  item_value: "totalValue",
  requires_test_print: "requiresTestPrint",
  test_print: "requiresTestPrint",
  tracking_number: "trackingNumber",
  tracking: "trackingNumber",
  shipping_method: "shippingMethod",
  client_name: "clientName",
  client: "clientName",
  delivery_address: "deliveryAddress",
  address: "deliveryAddress",
  order_address: "deliveryAddress",
  "order address": "deliveryAddress",
  printer_name: "supplierName",
  printer: "supplierName",
  supplier_name: "supplierName",
  supplier: "supplierName",
};

export async function POST(request: NextRequest) {
  // Allow either cookie-based auth or API key auth
  let userId: number | null = null;
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const keyString = authHeader.slice(7);
    const isValid = await verifyApiKey(keyString);
    if (isValid) {
      // For API key auth, use a system user (admin)
      const [adminUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .limit(1);
      userId = adminUser?.id || null;
    }
  }

  // If no API key or cookie auth, try session auth
  if (!userId) {
    try {
      const session = await requireInternal();
      userId = Number(session.user.id);
    } catch {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  }

  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") || formData.get("data");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const text = await (file as Blob).text();
  const { data: rawRows, errors: parseErrors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parseErrors.length > 0 && rawRows.length === 0) {
    return NextResponse.json({ error: "Failed to parse CSV" }, { status: 400 });
  }

  // Normalize headers and build mapping for this CSV's columns
  const rows = rawRows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      normalized[normalizeHeader(key)] = val;
    }
    return normalized;
  });

  // Insert the import record, then read it back to get the ID
  await db.insert(csvImports).values({
    filename: (file as File).name,
    importedBy: userId,
    rowCount: rows.length,
    status: "processing",
  });

  const [importRecord] = await db
    .select({ id: csvImports.id })
    .from(csvImports)
    .orderBy(desc(csvImports.id))
    .limit(1);

  const importId = importRecord.id;
  let successCount = 0;
  let errorCount = 0;

  // Pre-fetch all suppliers for quick lookup
  const allSuppliers = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers);
  const supplierByName = new Map<string, number>(allSuppliers.map((s: any) => [s.name.toLowerCase(), s.id]));

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    // Map normalized column names to schema field names
    const mapped: Record<string, string> = {};
    for (const [csvKey, val] of Object.entries(row)) {
      const schemaKey = HEADER_MAP[csvKey];
      if (schemaKey) mapped[schemaKey] = val;
    }

    const orderItemId = mapped.orderItemId?.trim();
    const orderId = mapped.orderId?.trim();

    if (!orderItemId || !orderId) {
      await db.insert(csvImportErrors).values({
        importId,
        rowNumber: rowIdx + 2,
        rawData: JSON.stringify(row),
        errorMessage: !orderItemId ? "Missing order_item_id" : "Missing order_id",
      });
      errorCount++;
      continue;
    }

    try {
      // Look up supplier ID if supplier name is provided
      let supplierId: number | null = null;
      const supplierName = mapped.supplierName?.trim();
      if (supplierName) {
        supplierId = supplierByName.get(supplierName.toLowerCase()) || null;
      }

      const values = {
        orderId,
        orderItemId,
        orderName: mapped.orderName?.trim() || null,
        orderCreatedAt: mapped.orderCreatedAt?.trim() || null,
        styleCode: mapped.styleCode?.trim() || null,
        color: mapped.color?.trim() || null,
        templatePdf: mapped.templatePdf?.trim() || null,
        printerShipDate: mapped.printerShipDate?.trim() || null,
        originalPrinterShipDate: mapped.originalPrinterShipDate?.trim() || null,
        dueDate: mapped.dueDate?.trim() || null,
        printType: mapped.printType?.trim() || null,
        printLocations: mapped.printLocations ? parseInt(mapped.printLocations) || null : null,
        decoratingMethods: mapped.decoratingMethods?.trim() || null,
        quantity: mapped.quantity ? parseInt(mapped.quantity) || null : null,
        totalValue: mapped.totalValue ? parseFloat(mapped.totalValue) || null : null,
        requiresTestPrint: mapped.requiresTestPrint
          ? ["true", "yes", "1"].includes(mapped.requiresTestPrint.toLowerCase())
          : false,
        trackingNumber: mapped.trackingNumber?.trim() || null,
        shippingMethod: mapped.shippingMethod?.trim() || null,
        clientName: mapped.clientName?.trim() || null,
        deliveryAddress: mapped.deliveryAddress?.trim() || null,
        supplierId: supplierId,
      };

      const [existing] = await db
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.orderItemId, orderItemId))
        .limit(1);

      if (existing) {
        // Update order data but preserve status/productionStage
        await db
          .update(orderItems)
          .set({ ...values, updatedAt: new Date().toISOString() })
          .where(eq(orderItems.orderItemId, orderItemId));
      } else {
        await db.insert(orderItems).values({
          ...values,
          status: "in_production",
          productionStage: "sample_production",
          importedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      successCount++;
    } catch (err) {
      await db.insert(csvImportErrors).values({
        importId,
        rowNumber: rowIdx + 2,
        rawData: JSON.stringify(row),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      errorCount++;
    }
  }

  await db
    .update(csvImports)
    .set({ successCount, errorCount, status: "done" })
    .where(eq(csvImports.id, importId));

  return NextResponse.json({ importId, successCount, errorCount, total: rows.length });
}
