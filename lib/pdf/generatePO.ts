import PDFDocument from "pdfkit";
import { format } from "date-fns";

type Supplier = { id: number; name: string; nickname: string | null; contactEmail: string | null };

type Sizes = { xs: string; s: string; m: string; l: string; xl: string; xxl: string; xxxl: string };

type LineItem = {
  orderItemId: string;
  orderName: string | null;
  fabricSwatchCode: string;
  fabricColorCode: string;
  printType: string | null;
  decoratingMethods: string | null;
  sizes: Sizes;
  extras: Sizes;
  total: number;
};

function fmtDate(d: string): string {
  if (!d) return "";
  try {
    return format(new Date(d), "M/d/yyyy");
  } catch {
    return d;
  }
}

function sizeTotal(xs: number, s: number, m: number, l: number, xl: number, xxl: number, xxxl: number): number {
  return xs + s + m + l + xl + xxl + xxxl;
}

export function generatePOPdf(
  poNumber: string,
  poDate: string,
  deliveryDate: string,
  shippingMethod: string,
  clientName: string,
  deliveryAddress: string,
  supplier: Supplier | null,
  lineItems: LineItem[]
): PDFDocument {
  const doc = new PDFDocument({ size: "LETTER", margin: 50 });

  const fpAddress = "Fresh Prints LLC\n150 W 25th Street, Suite 501\nNew York, NY 10001";
  const supplierName = supplier?.name ?? "";
  const contactEmail = supplier?.contactEmail ?? "";

  // Title
  doc.fontSize(16).font("Helvetica-Bold").text(`PURCHASE ORDER #: ${poNumber}`, { underline: false });
  doc.fontSize(10).font("Helvetica").moveDown(0.5);

  // Header Info
  doc.fontSize(9).text(`Purchase Order Date: ${fmtDate(poDate)}`);
  doc.text(`In-Hands Date: ${fmtDate(deliveryDate)}`);
  doc.moveDown();

  // Two-column layout: Shipping Details (left) and Client Details (right)
  const leftX = 50;
  const rightX = 330;

  // Left column: Fresh Prints details
  doc.fontSize(10).font("Helvetica-Bold").text("SHIPPING DETAILS", leftX, doc.y);
  doc.fontSize(9).font("Helvetica");
  doc.text("Fresh Prints LLC", leftX, doc.y + 15);
  doc.text("150 W 25th Street, Suite 501", leftX);
  doc.text("New York, NY 10001", leftX);

  // Right column: Client details
  doc.fontSize(10).font("Helvetica-Bold").text("CLIENT DETAILS", rightX, doc.y - 45);
  doc.fontSize(9).font("Helvetica");
  doc.text(`Client Name: ${clientName}`, rightX, doc.y + 15);
  doc.text(`Delivery Address:`, rightX);
  doc.text(deliveryAddress.split("\n").join(" "), rightX, doc.y);
  doc.moveDown();

  // Vendor Details
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica-Bold").text("VENDOR DETAILS", leftX);
  doc.fontSize(9).font("Helvetica");
  doc.text(`Name: ${supplierName}`, leftX, doc.y + 10);
  doc.text(`Email: ${contactEmail}`, leftX);
  doc.text(`Shipping Method: ${shippingMethod}`, leftX);
  doc.moveDown();

  // Order Details Table
  doc.moveDown(0.5);
  doc.fontSize(10).font("Helvetica-Bold").text("ORDER DETAILS", leftX);
  doc.moveDown(0.3);

  // Table headers
  const colX = [50, 110, 160, 220, 280, 320, 360, 400, 440, 480];
  const headerY = doc.y;
  doc.fontSize(8).font("Helvetica-Bold");
  doc.text("S.no", colX[0], headerY);
  doc.text("Item ID", colX[1], headerY);
  doc.text("NAME", colX[2], headerY);
  doc.text("FABRIC CODE", colX[3], headerY);
  doc.text("COLOR", colX[4], headerY);
  doc.text("Print", colX[5], headerY);
  doc.text("XS", colX[6], headerY);
  doc.text("S", colX[7], headerY);
  doc.text("M", colX[8], headerY);
  doc.text("TOTAL", colX[9], headerY);

  // Underline header
  doc.moveTo(leftX, doc.y + 12).lineTo(550, doc.y + 12).stroke();
  doc.moveDown(0.8);

  // Table rows
  doc.fontSize(7).font("Helvetica");
  lineItems.forEach((item, i) => {
    // base + extras, as on the HTML PO — the extras row is part of the quantity
    // the manufacturer is being asked for, not a separate note.
    const qty = (k: keyof Sizes) =>
      (parseInt(item.sizes?.[k]) || 0) + (parseInt(item.extras?.[k]) || 0);
    const xs = qty("xs");
    const s = qty("s");
    const m = qty("m");
    const total = xs + s + m + qty("l") + qty("xl") + qty("xxl") + qty("xxxl");

    const rowY = doc.y;
    doc.text(String(i + 1), colX[0], rowY);
    doc.text(item.orderItemId, colX[1], rowY);
    doc.text(item.orderName?.substring(0, 15) ?? "", colX[2], rowY);
    doc.text(item.fabricSwatchCode.substring(0, 12), colX[3], rowY);
    doc.text(item.fabricColorCode.substring(0, 10), colX[4], rowY);
    doc.text(item.printType?.substring(0, 8) ?? "", colX[5], rowY);
    doc.text(String(xs), colX[6], rowY);
    doc.text(String(s), colX[7], rowY);
    doc.text(String(m), colX[8], rowY);
    doc.text(String(total), colX[9], rowY);
    doc.moveDown();
  });

  // Underline footer
  doc.moveTo(leftX, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown();

  // Notes section
  doc.fontSize(10).font("Helvetica-Bold").text("NOTES FROM FRESH PRINTS", leftX);
  doc.fontSize(8).font("Helvetica");
  doc.text("- The PO is for making the garment and printing the design on them.", leftX);
  doc.text("- We'll need pre production images for this before proceeding with mass production.", leftX);
  doc.text("- Print type is listed above.", leftX);
  doc.text("- Please send the tracking when the order ships out.", leftX);
  doc.text("- Please Blind ship this order.", leftX);
  doc.text("- Please confirm when can we get the pre production images of this order.", leftX);

  return doc;
}
