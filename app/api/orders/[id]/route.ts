import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, statusHistory, comments, orderImages, suppliers, users } from "@/lib/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { requireAuth, requireInternal, denyOrderAccess } from "@/lib/permissions";
import { createNotification } from "@/lib/createNotification";
import { sendTestPrintToChat } from "@/lib/googleChat";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id: orderItemId } = await params;

  const [order] = await db
    .select({
      orderItemId: orderItems.orderItemId,
      orderId: orderItems.orderId,
      orderName: orderItems.orderName,
      orderCreatedAt: orderItems.orderCreatedAt,
      styleCode: orderItems.styleCode,
      color: orderItems.color,
      templatePdf: orderItems.templatePdf,
      printerShipDate: orderItems.printerShipDate,
      originalPrinterShipDate: orderItems.originalPrinterShipDate,
      delayReason: orderItems.delayReason,
      testPrintStatus: orderItems.testPrintStatus,
      testPrintRejections: orderItems.testPrintRejections,
      shippingMethod: orderItems.shippingMethod,
      requiresTestPrint: orderItems.requiresTestPrint,
      printType: orderItems.printType,
      printLocations: orderItems.printLocations,
      decoratingMethods: orderItems.decoratingMethods,
      dueDate: orderItems.dueDate,
      supplierShipDate: orderItems.supplierShipDate,
      testPrintDate: orderItems.testPrintDate,
      inHandsDate: orderItems.inHandsDate,
      totalValue: orderItems.totalValue,
      quantity: orderItems.quantity,
      status: orderItems.status,
      productionStage: orderItems.productionStage,
      trackingNumber: orderItems.trackingNumber,
      updatedAt: orderItems.updatedAt,
      supplierId: orderItems.supplierId,
      nominatedSupplierId: orderItems.nominatedSupplierId,
      supplierName: suppliers.name,
      supplierNickname: suppliers.nickname,
    })
    .from(orderItems)
    .leftJoin(suppliers, eq(orderItems.supplierId, suppliers.id))
    .where(eq(orderItems.orderItemId, orderItemId))
    .limit(1);

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (session.user.role === "supplier" && order.supplierId !== Number(session.user.supplierId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const history = await db
    .select({
      id: statusHistory.id,
      fromStatus: statusHistory.fromStatus,
      toStatus: statusHistory.toStatus,
      changedAt: statusHistory.changedAt,
      note: statusHistory.note,
      changedByName: users.name,
    })
    .from(statusHistory)
    .leftJoin(users, eq(statusHistory.changedBy, users.id))
    .where(eq(statusHistory.orderItemId, orderItemId))
    .orderBy(desc(statusHistory.changedAt));

  const allComments = await db
    .select({
      id: comments.id,
      body: comments.body,
      isInternal: comments.isInternal,
      createdAt: comments.createdAt,
      userName: users.name,
      userRole: users.role,
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.orderItemId, orderItemId))
    .orderBy(asc(comments.createdAt));

  const isSupplier = session.user.role === "supplier";
  const filteredComments = isSupplier ? allComments.filter((c) => !c.isInternal) : allComments;

  return NextResponse.json({ ...order, statusHistory: history, comments: filteredComments });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id: orderItemId } = await params;
  const body = await request.json();

  const denied = await denyOrderAccess(session, orderItemId);
  if (denied) return denied;

  // Owning an order is not the same as being allowed to change anything on it.
  // These three are what the supplier UI actually sends; the rest — supplier
  // assignment, nomination, test-print approval, and the internal date fields —
  // stay internal-only. Without this, a supplier can assign an order to
  // themselves and every ownership check above then correctly lets them in.
  if (session.user.role === "supplier") {
    const SUPPLIER_EDITABLE = ["column", "trackingNumber", "shippingMethod"];
    const forbidden = Object.keys(body).filter((k) => !SUPPLIER_EDITABLE.includes(k));
    if (forbidden.length > 0) {
      return NextResponse.json(
        { error: `Not permitted to change: ${forbidden.join(", ")}` },
        { status: 403 }
      );
    }
  }

  const [current] = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderItemId, orderItemId))
    .limit(1);

  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  // Stage/column move (drag-and-drop or dropdown)
  if (body.column !== undefined) {
    const col = body.column as string;
    if (col === "shipped") {
      updates.status = "shipped";
      updates.productionStage = null;
    } else if (col === "completed") {
      updates.status = "completed";
      updates.productionStage = null;
    } else {
      updates.status = "in_production";
      updates.productionStage = col;
    }

    const fromStage =
      current.status === "shipped" ? "shipped"
      : current.status === "completed" ? "completed"
      : current.productionStage ?? "sample_production";

    if (fromStage !== col) {
      await db.insert(statusHistory).values({
        orderItemId,
        fromStatus: fromStage,
        toStatus: col,
        changedBy: Number(session.user.id),
        changedAt: new Date().toISOString(),
      });
    }
  }

  if (body.trackingNumber !== undefined) updates.trackingNumber = body.trackingNumber;
  if (body.shippingMethod !== undefined) updates.shippingMethod = body.shippingMethod;
  if (body.printerShipDate !== undefined) updates.printerShipDate = body.printerShipDate;
  if (body.delayReason !== undefined) updates.delayReason = body.delayReason;
  if (body.supplierId !== undefined) updates.supplierId = body.supplierId;
  if (body.nominatedSupplierId !== undefined) updates.nominatedSupplierId = body.nominatedSupplierId;
  if (body.requiresTestPrint !== undefined) updates.requiresTestPrint = body.requiresTestPrint;
  if (body.testPrintStatus !== undefined) updates.testPrintStatus = body.testPrintStatus;
  if (body.inHandsDate !== undefined) updates.inHandsDate = body.inHandsDate;
  if (body.supplierShipDate !== undefined) updates.supplierShipDate = body.supplierShipDate;
  if (body.testPrintDate !== undefined) updates.testPrintDate = body.testPrintDate;

  await db.update(orderItems).set(updates).where(eq(orderItems.orderItemId, orderItemId));

  // Notify supplier when status changes by team
  if (body.column !== undefined && session.user.role !== "supplier") {
    await createNotification({
      type: "status_change",
      orderItemId,
      triggeredBy: Number(session.user.id),
      message: `Order ${orderItemId} was moved to ${body.column}`,
      audience: "supplier",
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireInternal();
  const { id: orderItemId } = await params;
  await db.delete(statusHistory).where(eq(statusHistory.orderItemId, orderItemId));
  await db.delete(comments).where(eq(comments.orderItemId, orderItemId));
  await db.delete(orderImages).where(eq(orderImages.orderItemId, orderItemId));
  await db.delete(orderItems).where(eq(orderItems.orderItemId, orderItemId));
  return NextResponse.json({ ok: true });
}
