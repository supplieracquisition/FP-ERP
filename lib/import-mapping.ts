/**
 * CSV column mapping and supplier-name resolution for the two order importers.
 *
 * There are two import routes — /api/import (a person uploads a file) and
 * /api/n8n/import (the scheduled pull) — and they read the SAME sheet. They
 * used to carry separate copies of the header map, which drifted: a header the
 * manual route understood was silently dropped by the machine one. Both now
 * import from here so a column added in one place works in both.
 *
 * The failure mode this file exists to prevent is silent. An unmapped header is
 * not an error anywhere — the column is simply absent from the mapped row, and
 * every field the importer writes unconditionally then lands as null. That is
 * how "Order Item Total" and "Number of units ordered" were being discarded on
 * every run while the import reported complete success.
 */

/** Header text as it appears in the sheet -> the key HEADER_MAP is keyed by. */
export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Normalized CSV header -> orderItems field name.
 *
 * Several entries are near-duplicates of each other ("total_units_ordered" vs
 * "number_of_units_ordered") because the sheet's column titles are edited by
 * hand and have changed wording more than once. Adding an alias is cheap;
 * missing one costs a whole column of data with no error raised. When in doubt,
 * add the alias.
 */
export const HEADER_MAP: Record<string, string> = {
  order_id: "orderId",
  orderid: "orderId",
  order_item_id: "orderItemId",
  orderitemid: "orderItemId",
  item_id: "orderItemId",
  order_name: "orderName",
  name: "orderName",
  order_created_at: "orderCreatedAt",
  created_at: "orderCreatedAt",
  order_created_date: "orderCreatedAt",
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
  number_of_print_locations: "printLocations",
  decorating_methods: "decoratingMethods",
  decoration_methods: "decoratingMethods",
  quantity: "quantity",
  qty: "quantity",
  units: "quantity",
  total_units_ordered: "quantity",
  total_number_of_units_ordered: "quantity",
  number_of_units_ordered: "quantity",
  total_units: "quantity",
  order_units: "quantity",
  total_value: "totalValue",
  value: "totalValue",
  order_value: "totalValue",
  total_order_value: "totalValue",
  total_order_item_total: "totalValue",
  order_item_total: "totalValue",
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

/**
 * Which orderItems fields a given CSV can actually supply.
 *
 * The importer must not write a field the file does not carry. Every value in
 * the update set is written unconditionally, so a column that is merely absent
 * would otherwise overwrite good data with null — the sheet has no
 * "requires test print" column, and importing it was resetting that flag to
 * false on every existing row it touched.
 */
export function suppliedFields(headers: string[]): Set<string> {
  const fields = new Set<string>();
  for (const h of headers) {
    const field = HEADER_MAP[normalizeHeader(h)];
    if (field) fields.add(field);
  }
  return fields;
}

/** Headers present in the file that map to nothing, for reporting. */
export function unmappedHeaders(headers: string[]): string[] {
  return headers.filter((h) => !HEADER_MAP[normalizeHeader(h)]);
}

/**
 * A printer name reduced to a comparable key.
 *
 * The sheet suffixes every make-to-order printer with " MTO" ("Nanchang Vision
 * Garment Co., Ltd. MTO") while the supplier record holds the plain company
 * name, and the two disagree about punctuation and spacing too
 * ("Co.,Ltd" vs "Co., Ltd."). Comparing the raw strings matched nothing: an
 * exact-match import of the production sheet resolved 0 of 77 rows and would
 * have pushed every one of them back into the unassigned pool.
 *
 * MTO is stripped as a whole word only, so a company whose name genuinely
 * contains those letters is unaffected.
 */
export function normalizeSupplierName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bmto\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Parse one cell for a field that is not plain text.
 *
 * Deliberately not `parseInt(raw) || null`. Zero is falsy, so that idiom
 * silently turns a real 0 into null — and the sheet is full of them: most rows
 * carry 0 print locations, and sample orders legitimately carry a value of 0.
 * Only a blank or genuinely unparseable cell becomes null.
 *
 * Thousands separators are stripped because the sheet's number columns are
 * sometimes formatted, and parseFloat("1,234") otherwise returns 1 without
 * complaint.
 */
export function toNumber(
  raw: string,
  parse: (s: string) => number
): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!cleaned) return null;
  const n = parse(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Field name -> cell parser. Fields absent from here are trimmed text. */
export const PARSE: Record<string, (raw: string) => unknown> = {
  printLocations: (raw) => toNumber(raw, (s) => parseInt(s, 10)),
  quantity: (raw) => toNumber(raw, (s) => parseInt(s, 10)),
  totalValue: (raw) => toNumber(raw, parseFloat),
  requiresTestPrint: (raw) => ["true", "yes", "1"].includes(raw.toLowerCase()),
};

/** Sentinel for a normalized key that more than one supplier collapses onto. */
export const AMBIGUOUS = Symbol("ambiguous supplier name");

export type SupplierIndex = {
  exact: Map<string, number>;
  normalized: Map<string, number | typeof AMBIGUOUS>;
};

/**
 * Build the two-tier lookup used to resolve a printer name to a supplier id.
 *
 * Exact (case-insensitive) is tried first so a precise name always wins over a
 * normalized guess. Normalization is the fallback for the " MTO" suffix.
 *
 * Two suppliers can collapse onto one normalized key — "Fresh Prints" and a
 * hypothetical "Fresh Prints MTO" both reduce to "freshprints". Guessing
 * between them would assign real orders to the wrong factory, so the key is
 * marked AMBIGUOUS and the row is reported as unresolved instead. Refusing to
 * choose is recoverable; a wrong assignment looks correct and is not.
 */
export function buildSupplierIndex(
  suppliers: { id: number; name: string }[]
): SupplierIndex {
  const exact = new Map<string, number>();
  const normalized = new Map<string, number | typeof AMBIGUOUS>();

  for (const s of suppliers) {
    exact.set(s.name.toLowerCase(), s.id);

    const key = normalizeSupplierName(s.name);
    if (!key) continue;
    const seen = normalized.get(key);
    if (seen === undefined) normalized.set(key, s.id);
    else if (seen !== s.id) normalized.set(key, AMBIGUOUS);
  }

  return { exact, normalized };
}

export type SupplierResolution =
  | { kind: "matched"; supplierId: number }
  | { kind: "unmatched"; reason: string };

/**
 * Resolve one printer name against the index.
 *
 * Only ever called with a non-empty name — a blank printer cell is a statement
 * that the order is unassigned, which is a different branch entirely and must
 * not be routed through here.
 */
export function resolveSupplier(
  name: string,
  index: SupplierIndex
): SupplierResolution {
  const exactHit = index.exact.get(name.toLowerCase());
  if (exactHit !== undefined) return { kind: "matched", supplierId: exactHit };

  const hit = index.normalized.get(normalizeSupplierName(name));
  if (hit === undefined) {
    return {
      kind: "unmatched",
      reason: `No supplier matches printer "${name}". Create the supplier, then re-run this import.`,
    };
  }
  if (hit === AMBIGUOUS) {
    return {
      kind: "unmatched",
      reason: `Printer "${name}" matches more than one supplier. Rename them so they differ by more than punctuation or an "MTO" suffix.`,
    };
  }
  return { kind: "matched", supplierId: hit };
}
