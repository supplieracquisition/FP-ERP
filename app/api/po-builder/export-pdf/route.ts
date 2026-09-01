import { NextRequest, NextResponse } from "next/server";
import { generatePOPdf } from "@/lib/pdf/generatePO";
import { requireInternal } from "@/lib/permissions";

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
};

export async function POST(request: NextRequest) {
  await requireInternal();

  try {
    const body = await request.json();
    const {
      poNumber,
      poDate,
      deliveryDate,
      shippingMethod,
      clientName,
      deliveryAddress,
      supplier,
      lineItems,
    } = body;

    if (!poNumber || !lineItems || lineItems.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: poNumber, lineItems" },
        { status: 400 }
      );
    }

    // Transform line items to include totals
    const processedItems = lineItems.map((item: LineItem) => {
      // base + extras — the extras row counts toward the quantity ordered.
      const total = (["xs", "s", "m", "l", "xl", "xxl", "xxxl"] as (keyof Sizes)[]).reduce(
        (sum, k) => sum + (parseInt(item.sizes?.[k]) || 0) + (parseInt(item.extras?.[k]) || 0),
        0
      );

      return {
        ...item,
        total,
      };
    });

    // Generate PDF
    const doc = generatePOPdf(
      poNumber,
      poDate,
      deliveryDate,
      shippingMethod,
      clientName,
      deliveryAddress,
      supplier,
      processedItems
    );

    // Get PDF bytes
    const pdfBytes: Uint8Array = await new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];

      doc.on("data", (chunk) => {
        chunks.push(chunk);
      });

      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on("error", (err) => {
        reject(err);
      });

      doc.end();
    });

    // Return as PDF file
    return new NextResponse(pdfBytes as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="PO-${poNumber}.pdf"`,
        "Content-Length": pdfBytes.length.toString(),
      },
    });
  } catch (error) {
    console.error("PDF export error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate PDF",
      },
      { status: 500 }
    );
  }
}
