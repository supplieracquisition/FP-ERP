import fs from "fs";
import { parse } from "csv-parse/sync";


export interface MTORecord {
  style: string;
  product: string;
  fabricCode: string;
  fabricColorCode: string;
  printMethod: string;
  decorations: string;
  primarySupplier: string;
  secondarySupplier: string;
  tertiarySupplier: string;
  fourthSupplier: string;
  fifthSupplier: string;
  sixthSupplier: string;
}

export interface FabricDetail {
  style: string;
  product: string;
  fabricCode: string;
  printMethod: string;
  decorations: string;
}

export interface FabricColor {
  style: string;
  fabricCode: string;
  colorCode: string;
  supplier: string;
}

export async function parseMTOTemplateFromContent(csvContent: string): Promise<{
  fabricDetails: FabricDetail[];
  fabricColors: FabricColor[];
}> {
  const lines = csvContent.split("\n");

  // Skip first line (title), parse from second line
  const cleanedCsv = lines.slice(1).join("\n");

  const records = parse(cleanedCsv, {
    columns: [
      "style",
      "product",
      "fabricCode",
      "fabricColorCode",
      "printMethod",
      "decorations",
      "primarySupplier",
      "secondarySupplier",
      "tertiarySupplier",
      "fourthSupplier",
      "fifthSupplier",
      "sixthSupplier",
    ],
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as MTORecord[];

  // Filter out the header row if it got included
  const dataRecords = records.filter(
    (r) => r.style && r.style !== "Style" && r.fabricCode
  );

  console.log(`MTO parser: parsed ${records.length} records, ${dataRecords.length} valid`);

  // Extract unique fabric details
  const fabricDetailsMap = new Map<string, FabricDetail>();
  const fabricColorsList: FabricColor[] = [];
  const colorsSeen = new Set<string>();

  for (const record of dataRecords) {
    // Extract style code (e.g., "FP16" from "FP16 Madison Shorts")
    const styleCode = record.style.match(/^(FP\d+)/)?.[1] || record.style.split(" ")[0];

    // Create fabric detail key from style + fabric code
    const fabricKey = `${styleCode}|${record.fabricCode}`;

    if (!fabricDetailsMap.has(fabricKey)) {
      fabricDetailsMap.set(fabricKey, {
        style: styleCode,
        product: record.product,
        fabricCode: record.fabricCode,
        printMethod: record.printMethod || "",
        decorations: record.decorations || "",
      });
    }

    // Extract fabric color (deduplicate by style + fabric + color)
    const colorKey = `${styleCode}|${record.fabricCode}|${record.fabricColorCode}`;
    if (!colorsSeen.has(colorKey)) {
      colorsSeen.add(colorKey);
      const supplier =
        record.primarySupplier ||
        record.secondarySupplier ||
        record.tertiarySupplier ||
        "";

      fabricColorsList.push({
        style: styleCode,
        fabricCode: record.fabricCode,
        colorCode: record.fabricColorCode,
        supplier: supplier,
      });
    }
  }

  return {
    fabricDetails: Array.from(fabricDetailsMap.values()),
    fabricColors: fabricColorsList,
  };
}

export async function parseMTOTemplate(filePath: string): Promise<{
  fabricDetails: FabricDetail[];
  fabricColors: FabricColor[];
}> {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  return parseMTOTemplateFromContent(fileContent);
}

export async function deduplicateFabricColors(
  colors: FabricColor[]
): Promise<FabricColor[]> {
  const seen = new Set<string>();
  const deduplicated: FabricColor[] = [];

  for (const color of colors) {
    const key = `${color.fabricCode}|${color.colorCode}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(color);
    }
  }

  return deduplicated;
}
