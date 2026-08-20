import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, csvImports, csvImportErrors, suppliers, users } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import Papa from "papaparse";
import { verifyApiKeyFromRequest } from "@/lib/apiKey";

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s\-]+/g, "_").replace(/[^a-z0-9_]/g, "");
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
  // Machine endpoint: authenticated by API key, not by session. Checked before
  // the body is read so an unauthenticated caller cannot reach the parser.
  const apiKey = await verifyApiKeyFromRequest(request);
  if (!apiKey) {
    return NextResponse.json(
      { error: "Invalid or missing API key" },
      { status: 401 }
    );
  }

  let text: string;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("text/csv")) {
    // Raw CSV text
    text = await request.text();
  } else {
    // Form data
    const formData = await request.formData();
    const file = formData.get("file") || formData.get("data");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    text = await (file as Blob).text();
  }

  // Get or create default admin user for n8n imports
  let adminUserId: number;
  try {
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    if (admin) {
      adminUserId = admin.id;
    } else {
      return NextResponse.json({ error: "No admin user found" }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
  if (!text || text.trim().length === 0) {
    return NextResponse.json({ error: "Empty CSV" }, { status: 400 });
  }

  const { data: rawRows } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (rawRows.length === 0) {
    return NextResponse.json({ error: "No rows in CSV" }, { status: 400 });
  }

  const rows = rawRows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      normalized[normalizeHeader(key)] = val;
    }
    return normalized;
  });

  const filename = contentType.includes("text/csv")
    ? `n8n-import-${Date.now()}.csv`
    : (file as File)?.name || `import-${Date.now()}.csv`;

  await db.insert(csvImports).values({
    filename,
    importedBy: adminUserId,
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

  const allSuppliers = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers);
  const supplierByName = new Map<string, number>(allSuppliers.map((s: any) => [s.name.toLowerCase(), s.id]));

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
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
      let supplierId: number | null = null;
      const supplierName = mapped.supplierName?.trim();
      if (supplierName) {
        supplierId = supplierByName.get(supplierName.toLowerCase()) || null;
      }

      const insertData: Record<string, any> = {
        orderItemId,
        orderId,
        orderName: mapped.orderName || null,
        orderCreatedAt: mapped.orderCreatedAt || null,
        styleCode: mapped.styleCode || null,
        color: mapped.color || null,
        quantity: mapped.quantity ? parseInt(mapped.quantity, 10) || null : null,
        printType: mapped.printType || null,
        dueDate: mapped.dueDate || null,
        printerShipDate: mapped.printerShipDate || null,
        originalPrinterShipDate: mapped.originalPrinterShipDate || null,
        totalValue: mapped.totalValue ? parseFloat(mapped.totalValue) || null : null,
        supplierId: supplierId,
        decoratingMethods: mapped.decoratingMethods || null,
        shippingMethod: mapped.shippingMethod || null,
        requiresTestPrint: mapped.requiresTestPrint ? mapped.requiresTestPrint.toLowerCase() === "true" : false,
        trackingNumber: mapped.trackingNumber || null,
        templatePdf: mapped.templatePdf || null,
        clientName: mapped.clientName || null,
        deliveryAddress: mapped.deliveryAddress || null,
        status: "in_production",
        productionStage: "sample_production",
      };

      await db.insert(orderItems).values(insertData);
      successCount++;
    } catch (err: any) {
      await db.insert(csvImportErrors).values({
        importId,
        rowNumber: rowIdx + 2,
        rawData: JSON.stringify(row),
        errorMessage: err.message || "Unknown error",
      });
      errorCount++;
    }
  }

  await db
    .update(csvImports)
    .set({ status: "completed" })
    .where(eq(csvImports.id, importId));

  return NextResponse.json({
    ok: true,
    importId,
    successCount,
    errorCount,
    message: `Imported ${successCount} orders (${errorCount} errors)`,
  });
}
