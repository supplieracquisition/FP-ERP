import fs from "fs";
import { parse } from "csv-parse/sync";

export interface FPERecord {
  styleCode: string;
  product: string;
  supplierName: string;
  salesRep: string;
  email: string;
  currentSupplier: string;
  standardShippingMoq: string;
  economyShippingMoq: string;
  v4BlankSeaPrice: string;
  v4BlanksAirPrice: string;
  airShipPrice: string;
  seaShipPrice: string;
  bulkProductionTimeline: string;
  airShippingTimeline: string;
  seaShippingTimeline: string;
  weights: string;
}

export interface FPESupplier {
  styleCode: string;
  product: string;
  supplierName: string;
  salesRep: string;
  email: string;
  currentSupplier: boolean;
  standardShippingMoq: string;
  economyShippingMoq: string;
  v4BlankSeaPrice: string;
  v4BlanksAirPrice: string;
  airShipPrice: string;
  seaShipPrice: string;
  bulkProductionTimeline: string;
  airShippingTimeline: string;
  seaShippingTimeline: string;
  weights: string;
}

export async function parseFPEDatabase(filePath: string): Promise<FPESupplier[]> {
  const fileContent = fs.readFileSync(filePath, "utf-8");

  // Map actual CSV headers to camelCase field names
  const headerMapping: Record<string, string> = {
    "Style Code": "styleCode",
    "Product": "product",
    "Supplier Name": "supplierName",
    "Sales Rep": "salesRep",
    "Email": "email",
    "Current Supplier": "currentSupplier",
    "Standard shipping MOQ": "standardShippingMoq",
    "Economy Shipping MOQ": "economyShippingMoq",
    "V4 Blanks Sea Price": "v4BlankSeaPrice",
    "V4 Blanks Air Price": "v4BlanksAirPrice",
    "Air Ship Price": "airShipPrice",
    "Sea Ship Price": "seaShipPrice",
    "Bulk Production Timeline": "bulkProductionTimeline",
    "Air Shipping Timeline": "airShippingTimeline",
    "Sea Shipping Timeline": "seaShippingTimeline",
    "Weights": "weights",
  };

  const records = parse(fileContent, {
    columns: (headers: string[]) =>
      headers.map((h) => headerMapping[h] || h),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    quote: '"',
    escape: '"',
  }) as FPERecord[];

  console.log(`Parsed ${records.length} total records from FPE database`);

  // Filter out header row if included, and ensure we have required fields
  const dataRecords = records.filter(
    (r) =>
      r.styleCode &&
      r.styleCode !== "Style Code" &&
      r.supplierName &&
      r.product
  );

  console.log(`Filtered to ${dataRecords.length} valid data records`);

  return dataRecords.map((record) => ({
    styleCode: record.styleCode,
    product: record.product,
    supplierName: record.supplierName,
    salesRep: record.salesRep || "",
    email: record.email || "",
    currentSupplier:
      record.currentSupplier?.toLowerCase() === "current supplier" ||
      record.currentSupplier?.toLowerCase() === "yes" ||
      record.currentSupplier?.toLowerCase() === "true",
    standardShippingMoq: record.standardShippingMoq || "",
    economyShippingMoq: record.economyShippingMoq || "",
    v4BlankSeaPrice: record.v4BlankSeaPrice || "",
    v4BlanksAirPrice: record.v4BlanksAirPrice || "",
    airShipPrice: record.airShipPrice || "",
    seaShipPrice: record.seaShipPrice || "",
    bulkProductionTimeline: record.bulkProductionTimeline || "",
    airShippingTimeline: record.airShippingTimeline || "",
    seaShippingTimeline: record.seaShippingTimeline || "",
    weights: record.weights || "",
  }));
}
