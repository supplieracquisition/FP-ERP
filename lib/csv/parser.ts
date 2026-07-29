import Papa from "papaparse";

export interface ParsedCsvRow {
  "Order Created Date"?: string;
  "Order ID"?: string;
  "Order Name"?: string;
  "Style Code"?: string;
  "Monthly Order Created Date"?: string;
  "Order Item ID"?: string;
  "Apparel Color"?: string;
  "Template PDF"?: string;
  "Printer Ship Date"?: string;
  "Printer Name"?: string;
  "Print Type"?: string;
  "# Print Locations"?: string;
  "Decorating Methods"?: string;
  "Order Due Date"?: string;
  "Total Order Item Total"?: string;
  "Total Number of Units Ordered"?: string;
  [key: string]: string | undefined;
}

export function parseMtoCSV(csvText: string): ParsedCsvRow[] {
  // Skip the metadata header rows — find the real header row
  const lines = csvText.split(/\r?\n/);
  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    if (lines[i].includes("Order Created Date") && lines[i].includes("Order ID")) {
      headerIndex = i;
      break;
    }
  }

  const dataText =
    headerIndex >= 0 ? lines.slice(headerIndex).join("\n") : csvText;

  const result = Papa.parse<ParsedCsvRow>(dataText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^"|"$/g, ""),
    transform: (v) => v.trim().replace(/^"|"$/g, ""),
  });

  return result.data;
}

export function parseDate(val: string | undefined): Date | null {
  if (!val) return null;
  const cleaned = val.trim();
  if (!cleaned || cleaned === "0000-00-00") return null;

  // Try formats: "03/31/2026 22:18:10", "03/31/2026"
  const match = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, m, d, y] = match;
    const timePart = cleaned.slice(10).trim();
    const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}${timePart ? "T" + timePart : ""}`;
    const dt = new Date(iso);
    return isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(cleaned);
  return isNaN(dt.getTime()) ? null : dt;
}

export function normalizeStyleCode(raw: string | undefined): string | null {
  if (!raw) return null;
  // Strip common prefixes like "FRESH PRINTS ", suffixes like " MTO", " - MTO ASH GREY NAVY"
  return raw
    .replace(/^FRESH\s+PRINTS\s+/i, "")
    .replace(/\s*[-–]\s*MTO\b.*/i, "")
    .replace(/\s+MTO$/i, "")
    .trim() || null;
}

export function normalizeColor(raw: string | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/\s+Mto$/i, "").trim() || null;
}
