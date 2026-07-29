import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, suppliers, statusHistory, comments, orderImages, csvImports, csvImportErrors } from "@/lib/db/schema";
import { eq, and, sql, asc, desc, isNull } from "drizzle-orm";
import { requireAuth, requireInternal } from "@/lib/permissions";
import { addDays, format } from "date-fns";

const BASE_SELECT = {
  id: orderItems.id,
  orderId: orderItems.orderId,
  orderItemId: orderItems.orderItemId,
  orderName: orderItems.orderName,
  orderCreatedAt: orderItems.orderCreatedAt,
  styleCode: orderItems.styleCode,
  color: orderItems.color,
  quantity: orderItems.quantity,
  printType: orderItems.printType,
  decoratingMethods: orderItems.decoratingMethods,
  dueDate: orderItems.dueDate,
  printerShipDate: orderItems.printerShipDate,
  supplierShipDate: orderItems.supplierShipDate,
  originalPrinterShipDate: orderItems.originalPrinterShipDate,
  delayReason: orderItems.delayReason,
  totalValue: orderItems.totalValue,
  status: orderItems.status,
  productionStage: orderItems.productionStage,
  testPrintStatus: orderItems.testPrintStatus,
  shippingMethod: orderItems.shippingMethod,
  requiresTestPrint: orderItems.requiresTestPrint,
  trackingNumber: orderItems.trackingNumber,
  templatePdf: orderItems.templatePdf,
  supplierId: orderItems.supplierId,
  supplierName: suppliers.name,
  supplierNickname: suppliers.nickname,
  clientName: orderItems.clientName,
  deliveryAddress: orderItems.deliveryAddress,
};

function buildConditions(params: URLSearchParams, session: { user: { role: string; supplierId: string | null } }, includeDelivered: boolean) {
  const conditions = [];
  const isSupplier = session.user.role === "supplier";

  if (!includeDelivered) {
    conditions.push(sql`${orderItems.status} != 'completed' AND ${orderItems.status} != 'delivered'`);
  }

  if (isSupplier && session.user.supplierId) {
    conditions.push(eq(orderItems.supplierId, Number(session.user.supplierId)));
  } else {
    const supplierIdParam = params.get("supplierId") ?? "";
    if (supplierIdParam === "0") {
      conditions.push(isNull(orderItems.supplierId));
    } else if (supplierIdParam) {
      conditions.push(eq(orderItems.supplierId, Number(supplierIdParam)));
    }

  }

  const column = params.get("column") ?? "";
  if (column) {
    if (column === "unassigned") {
      conditions.push(isNull(orderItems.supplierId));
    } else if (column === "shipped") {
      conditions.push(eq(orderItems.status, "shipped"));
    } else if (column === "completed") {
      conditions.push(eq(orderItems.status, "completed"));
    } else {
      // For all other stages (sample_production, printing, etc.), must have a supplier AND match the stage
      conditions.push(sql`${orderItems.supplierId} IS NOT NULL`);
      conditions.push(eq(orderItems.productionStage, column));
    }
  }

  const styleCode = params.get("styleCode") ?? "";
  if (styleCode) conditions.push(sql`lower(${orderItems.styleCode}) like lower(${"%" + styleCode + "%"})`);

  const color = params.get("color") ?? "";
  if (color) conditions.push(sql`lower(${orderItems.color}) like lower(${"%" + color + "%"})`);

  const printType = params.get("printType") ?? "";
  if (printType) conditions.push(sql`lower(${orderItems.printType}) like lower(${"%" + printType + "%"})`);

  const decoration = params.get("decoration") ?? "";
  if (decoration) conditions.push(sql`lower(${orderItems.decoratingMethods}) like lower(${"%" + decoration + "%"})`);

  const search = params.get("search") ?? "";
  if (search) {
    conditions.push(sql`(
      lower(${orderItems.orderItemId}) like lower(${"%" + search + "%"})
      OR lower(${orderItems.orderName}) like lower(${"%" + search + "%"})
      OR lower(${orderItems.orderId}) like lower(${"%" + search + "%"})
      OR lower(${orderItems.styleCode}) like lower(${"%" + search + "%"})
    )`);
  }

  const shipDate = params.get("shipDate") ?? "";
  if (shipDate) {
    const today = format(new Date(), "yyyy-MM-dd");
    if (shipDate === "today") {
      conditions.push(eq(orderItems.printerShipDate, today));
    } else {
      const cutoff = format(addDays(new Date(), Number(shipDate)), "yyyy-MM-dd");
      conditions.push(and(
        sql`${orderItems.printerShipDate} >= ${today}`,
        sql`${orderItems.printerShipDate} <= ${cutoff}`
      )!);
    }
  }

  return conditions.length ? and(...conditions) : undefined;
}

function buildOrderBy(sortBy: string) {
  switch (sortBy) {
    case "ship_date":     return [asc(orderItems.printerShipDate), asc(orderItems.dueDate)];
    case "quantity_asc":  return [asc(orderItems.quantity)];
    case "quantity_desc": return [desc(orderItems.quantity)];
    case "value_asc":     return [asc(orderItems.totalValue)];
    case "value_desc":    return [desc(orderItems.totalValue)];
    default:              return [asc(orderItems.dueDate), asc(orderItems.printerShipDate)];
  }
}

export async function GET(request: NextRequest) {
  const session = await requireAuth();
  const { searchParams } = new URL(request.url);

  const isKanban     = searchParams.get("kanban") === "1";
  const showDelivered = searchParams.get("showDelivered") === "1";
  const where = buildConditions(searchParams, session, isKanban || showDelivered);
  const orderByClause = buildOrderBy(searchParams.get("sortBy") ?? "");

  if (isKanban) {
    // Return all items (no pagination) for the kanban board
    const rows = await db
      .select(BASE_SELECT)
      .from(orderItems)
      .leftJoin(suppliers, eq(orderItems.supplierId, suppliers.id))
      .where(where)
      .orderBy(...orderByClause);
    return NextResponse.json({ items: rows });
  }

  // Paginated table view
  const page   = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit  = 50;
  const offset = (page - 1) * limit;

  const rows = await db
    .select(BASE_SELECT)
    .from(orderItems)
    .leftJoin(suppliers, eq(orderItems.supplierId, suppliers.id))
    .where(where)
    .orderBy(...orderByClause)
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(orderItems)
    .where(where);

  return NextResponse.json({ items: rows, total: Number(count) });
}

export async function DELETE() {
  await requireInternal();
  // Delete in dependency order
  await db.delete(csvImportErrors);
  await db.delete(csvImports);
  await db.delete(statusHistory);
  await db.delete(comments);
  await db.delete(orderImages);
  await db.delete(orderItems);
  return NextResponse.json({ ok: true });
}
