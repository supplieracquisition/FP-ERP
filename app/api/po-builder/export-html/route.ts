import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { requireInternal } from "@/lib/permissions";

type Sizes = { xs: string; s: string; m: string; l: string; xl: string; xxl: string; xxxl: string };

type LineItem = {
  orderItemId: string;
  orderName: string | null;
  styleCode?: string | null;
  fabricSwatchCode: string;
  fabricColorCode: string;
  printType: string | null;
  decoratingMethods: string | null;
  sizes: Sizes;
  extras: Sizes;
};

type Supplier = {
  id: number;
  name: string;
  nickname: string | null;
  contactEmail: string | null;
  address?: string | null;
  pocName?: string | null;
  pocPhone?: string | null;
};

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function generateLineItemRows(lineItems: LineItem[]): string {
  return lineItems
    .map((item, i) => {
      const xs = parseInt(item.sizes.xs) || 0;
      const s = parseInt(item.sizes.s) || 0;
      const m = parseInt(item.sizes.m) || 0;
      const l = parseInt(item.sizes.l) || 0;
      const xl = parseInt(item.sizes.xl) || 0;
      const xxl = parseInt(item.sizes.xxl) || 0;
      const xxxl = parseInt(item.sizes.xxxl) || 0;
      const total = xs + s + m + l + xl + xxl + xxxl;

      const itemName = item.orderName || (item.styleCode || item.fabricSwatchCode || "");

      return `
      <tr>
        <td class="sno">${i + 1}</td>
        <td class="itemid">${item.orderItemId}</td>
        <td class="desc">${itemName}${item.fabricColorCode ? ` — ${item.fabricColorCode}` : ""}</td>
        <td class="detail">${item.fabricSwatchCode || ""}</td>
        <td class="detail">${item.printType || ""}</td>
        <td class="detail">${item.decoratingMethods || ""}</td>
        <td class="num">${xs || ""}</td>
        <td class="num">${s || ""}</td>
        <td class="num">${m || ""}</td>
        <td class="num">${l || ""}</td>
        <td class="num">${xl || ""}</td>
        <td class="num">${xxl || ""}</td>
        <td class="num">${xxxl || ""}</td>
        <td class="num"><strong>${total}</strong></td>
      </tr>`;
    })
    .join("\n");
}

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
      orderInstructions,
    } = body;

    if (!poNumber || !lineItems || lineItems.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: poNumber, lineItems" },
        { status: 400 }
      );
    }

    // Read template
    const templatePath = join(process.cwd(), "po-template.html");
    let html = readFileSync(templatePath, "utf-8");

    // Replace PO Number
    html = html.replace(/#182531/g, `#${poNumber}`);
    html = html.replace(/Purchase Order 182531/g, `Purchase Order ${poNumber}`);

    // Replace dates
    html = html.replace(/6 June 2026/g, formatDate(poDate));
    html = html.replace(/23 July 2026/g, formatDate(deliveryDate));

    // Replace supplier details
    const supplierName = supplier?.name || "Supplier Name";
    const supplierAddress = supplier?.address || "Supplier Address";
    const pocName = supplier?.pocName || "Contact Name";
    const pocPhone = supplier?.pocPhone || "";
    const pocEmail = supplier?.contactEmail || "";

    // Replace in Bill To and Ship To sections
    html = html.replace(/Dongguan Qianlong Clothing Co\., Ltd\./g, supplierName);
    html = html.replace(/8th Floor, No\. 478, Sports Road, Humen Town, Dongguan City, Guangdong Province/g, supplierAddress);
    html = html.replace(/Mr Abel Deng/g, pocName);
    html = html.replace(/goodfacex214@gmail\.com/g, pocEmail);
    html = html.replace(/\+86 18676073832/g, pocPhone);

    // Replace client name
    html = html.replace(/Laney Young/g, clientName);

    // Replace delivery address
    if (deliveryAddress) {
      html = html.replace(/642 Rebel Dr<br>Oxford, MS 38677, USA/g, deliveryAddress);
    }

    // Replace shipping method - match the template format exactly
    html = html.replace(/DDP — Sea Freight/g, shippingMethod || "DDP — Sea Freight");

    // Calculate total units from line items
    const totalUnits = lineItems.reduce((sum, item) => {
      const xs = parseInt(item.sizes.xs) || 0;
      const s = parseInt(item.sizes.s) || 0;
      const m = parseInt(item.sizes.m) || 0;
      const l = parseInt(item.sizes.l) || 0;
      const xl = parseInt(item.sizes.xl) || 0;
      const xxl = parseInt(item.sizes.xxl) || 0;
      const xxxl = parseInt(item.sizes.xxxl) || 0;
      const itemTotal = xs + s + m + l + xl + xxl + xxxl;
      const extras = Object.values(item.extras).reduce((e, v) => e + (parseInt(v) || 0), 0);
      return sum + itemTotal + extras;
    }, 0);

    // Replace total units in both locations
    html = html.replace(/390 pcs/g, `${totalUnits} pcs`);
    html = html.replace(/<td colspan="2" class="foot-total">390<\/td>/g, `<td colspan="2" class="foot-total">${totalUnits}</td>`);

    // Replace line items
    const lineItemsRows = generateLineItemRows(lineItems);
    const tbodyStart = html.indexOf("<tbody>");
    const tbodyEnd = html.indexOf("</tbody>");
    if (tbodyStart !== -1 && tbodyEnd !== -1) {
      html = html.substring(0, tbodyStart + 7) + "\n" + lineItemsRows + "\n      " + html.substring(tbodyEnd);
    }

    // Replace notes - avoid complex regex by using simpler string search
    const ulStart = html.indexOf("<ul>");
    const ulEnd = html.indexOf("</ul>");
    if (ulStart !== -1 && ulEnd !== -1) {
      const notes = orderInstructions || "- The PO is for making the garment and printing the design on them.\n- We'll need pre production images for this before proceeding with mass production.\n- Print type is listed above.\n- Please send the tracking when the order ships out.\n- Please Blind ship this order.";
      const notesHtml = notes
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => `      <li>${line.replace(/^- /, "")}</li>`)
        .join("\n");
      html = html.substring(0, ulStart + 4) + "\n" + notesHtml + "\n    " + html.substring(ulEnd);
    }

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("HTML export error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate HTML",
      },
      { status: 500 }
    );
  }
}
