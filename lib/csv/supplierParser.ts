import fs from "fs";
import { parse } from "csv-parse/sync";

export interface SupplierRecord {
  name: string;
  pocName?: string;
  pocEmail?: string;
  pocPhone?: string;
  address?: string;
  email?: string;
  salesRepName?: string;
}

function parseSupplierContact(contactStr: string): {
  pocName?: string;
  pocEmail?: string;
  pocPhone?: string;
} {
  if (!contactStr) return {};

  const result: any = {};

  // Try to extract name, email, and phone from the contact field
  // Format can vary, e.g., "Mr Abel Deng" or "POC: Mr Abel Deng"
  const nameMatch = contactStr.match(
    /(?:POC:\s*)?([^@\n]+?)(?:\s+(?:Email|gmail|@)|$)/i
  );
  if (nameMatch) {
    result.pocName = nameMatch[1].trim();
  }

  // Extract email
  const emailMatch = contactStr.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    result.pocEmail = emailMatch[1].trim();
  }

  // Extract phone numbers
  const phoneMatch = contactStr.match(
    /(?:\+?86)?[\s-]?(\d{10,})|(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/
  );
  if (phoneMatch) {
    result.pocPhone = (phoneMatch[1] || phoneMatch[2]).trim();
  }

  return result;
}

export async function parseMTOSuppliers(
  filePath: string
): Promise<SupplierRecord[]> {
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const lines = fileContent.split("\n").map((line) => line.replace(/\r$/g, ""));

  // Skip first line (title), use second line for headers
  const dataLines = lines.slice(2);

  const suppliers: SupplierRecord[] = [];
  const supplierMap = new Map<string, SupplierRecord>();

  for (const line of dataLines) {
    if (!line.trim()) continue;

    const fields = parseCSVLine(line);
    if (fields.length < 7) continue;

    // Primary supplier from column 6
    const primarySupplier = fields[6]?.trim();
    if (!primarySupplier) continue;

    // Try to find supplier details from the end columns (Supplier Name, Address, POC, Contact)
    // These columns come after the standard columns
    let pocName: string | undefined;
    let address: string | undefined;
    let email: string | undefined;
    let salesRepName: string | undefined;

    // Look for supplier details in the row
    // Format: [...standard cols...], , , , Supplier Name, Address, POC, Contact
    if (fields.length >= 17) {
      // Check for supplier info columns
      if (
        fields[13]?.trim() &&
        fields[13].toLowerCase() !== "supplier name"
      ) {
        // This might be the supplier name
        const potentialSupplier = fields[13].trim();
        if (potentialSupplier === primarySupplier) {
          address = fields[14]?.trim();
          pocName = fields[15]?.trim();
          const contactInfo = parseSupplierContact(fields[16] || "");
          email = contactInfo.pocEmail || email;
        }
      }
    }

    // Extract email from "Email" field in column 4
    const emailField = fields[4]?.trim();
    if (emailField && emailField.includes("@")) {
      email = emailField;
    }

    // Extract sales rep from column 3
    const salesRepField = fields[3]?.trim();
    if (salesRepField && salesRepField !== "Sales Rep") {
      salesRepName = salesRepField;
    }

    // Create or update supplier record
    if (!supplierMap.has(primarySupplier)) {
      supplierMap.set(primarySupplier, {
        name: primarySupplier,
        pocName,
        address,
        email: email || undefined,
        salesRepName,
      });
    } else {
      // Merge with existing data, preferring non-empty values
      const existing = supplierMap.get(primarySupplier)!;
      if (pocName && !existing.pocName) existing.pocName = pocName;
      if (address && !existing.address) existing.address = address;
      if (email && !existing.email) existing.email = email;
      if (salesRepName && !existing.salesRepName)
        existing.salesRepName = salesRepName;
    }
  }

  return Array.from(supplierMap.values());
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}
