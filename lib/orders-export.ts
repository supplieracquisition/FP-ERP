/**
 * The orders CSV export: which columns go out, and under what headings.
 *
 * The headings are not decorative. Every column the importer can read is
 * spelled here with its AUTHORITATIVE header from lib/import-mapping.ts — the
 * first alias listed for that field, the one mapRow() prefers — so a file that
 * leaves here can be edited in a spreadsheet and fed straight back into the
 * Import tab. Re-exporting and re-importing is the shortest path to a bulk
 * edit, and it only works if the two sides agree on the words.
 *
 * So: if you add a column here, give it the spelling HEADER_MAP already knows.
 * A heading invented freshly here is dropped on re-import and reported as an
 * ignored column, which looks like data loss to whoever runs it.
 *
 * The four read-only columns at the end deliberately break that rule, because
 * they describe work done IN the tool rather than anything the sheet owns. The
 * importer has no business writing them, so they have no header mapping, and
 * re-importing an untouched export will name them in its ignored-columns
 * warning. That warning is correct: those columns genuinely were not imported.
 */

import Papa from "papaparse";

/** One column of the export. */
type ExportColumn = {
  /** Heading as written to the file. Must match HEADER_MAP where importable. */
  header: string;
  /** Key on the row object the route selects. */
  field: string;
  /**
   * Hidden from suppliers, matching the orders table — it omits Manufacturer
   * and Value for a supplier session. An export that included them would hand
   * a supplier, in a file, exactly what the screen is careful not to show.
   */
  internalOnly?: true;
};

export const EXPORT_COLUMNS: ExportColumn[] = [
  // --- importable: these round-trip through /api/import ---
  { header: "Order ID", field: "orderId" },
  { header: "Order Item ID", field: "orderItemId" },
  { header: "Order Name", field: "orderName" },
  { header: "Order Created At", field: "orderCreatedAt" },
  { header: "Style Code", field: "styleCode" },
  { header: "Color", field: "color" },
  { header: "Printer Name", field: "supplierName", internalOnly: true },
  { header: "Printer Assigned Date", field: "assignedDate" },
  { header: "Printer Ship Date", field: "supplierShipDate" },
  { header: "Original Printer Ship Date", field: "originalSupplierShipDate" },
  { header: "Due Date", field: "dueDate" },
  { header: "Print Type", field: "printType" },
  { header: "Print Locations", field: "printLocations" },
  { header: "Decorating Methods", field: "decoratingMethods" },
  { header: "Quantity", field: "quantity" },
  { header: "Total Value", field: "totalValue", internalOnly: true },
  { header: "Requires Test Print", field: "requiresTestPrint" },
  { header: "Tracking Number", field: "trackingNumber" },
  { header: "Shipping Method", field: "shippingMethod" },
  { header: "Template PDF", field: "templatePdf" },
  { header: "Client Name", field: "clientName" },
  { header: "Delivery Address", field: "deliveryAddress" },

  // --- read-only: work done in the tool, which no import may write ---
  { header: "Status", field: "status" },
  { header: "Production Stage", field: "productionStage" },
  { header: "Test Print Status", field: "testPrintStatus" },
  { header: "Delay Reason", field: "delayReason" },
];

/**
 * One cell.
 *
 * Dates go out EXACTLY as stored, deliberately un-prettified. They are ISO
 * strings, and the temptation is to trim them to a calendar date so the
 * spreadsheet looks tidy — but assigned_date carries a real time of day that
 * the intake window compares against, and a trimmed value re-imported would
 * silently move the order to midnight. Verbatim is the only shape that
 * survives the round trip this file exists to support.
 *
 * Booleans become Yes/No rather than true/false: both re-import correctly
 * (the parser lowercases and accepts "yes"), and Yes/No is what a person
 * reading a spreadsheet expects.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * Rows -> CSV text.
 *
 * Papa.unparse rather than joining strings by hand: delivery addresses contain
 * commas and order names contain quotes, and hand-rolled escaping of those is
 * how an export becomes a file that reimports as garbage.
 */
export function ordersToCsv(
  rows: Record<string, unknown>[],
  { includeInternalOnly }: { includeInternalOnly: boolean }
): string {
  const columns = includeInternalOnly
    ? EXPORT_COLUMNS
    : EXPORT_COLUMNS.filter((c) => !c.internalOnly);

  return Papa.unparse({
    fields: columns.map((c) => c.header),
    data: rows.map((row) => columns.map((c) => cell(row[c.field]))),
  });
}

/** `orders-2026-10-18.csv` — dated so successive exports don't overwrite. */
export function exportFilename(now = new Date()): string {
  return `orders-${now.toISOString().slice(0, 10)}.csv`;
}
