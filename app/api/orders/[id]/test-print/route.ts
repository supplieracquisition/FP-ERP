import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, orderImages, suppliers, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireInternal } from "@/lib/permissions";
import { unlink } from "fs/promises";
import { absoluteFromStored } from "@/lib/uploads";
import { createNotification } from "@/lib/createNotification";
import { sendMail } from "@/lib/email";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireInternal();
  const { id: orderItemId } = await params;

  const [order] = await db
    .select({
      supplierId: orderItems.supplierId,
      testPrintRejections: orderItems.testPrintRejections,
    })
    .from(orderItems)
    .where(eq(orderItems.orderItemId, orderItemId))
    .limit(1);

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const newCount = (order.testPrintRejections ?? 0) + 1;
  const label = `${ordinal(newCount)} test print rejected`;

  // Delete all test print image files from disk + DB
  const testPrintImgs = await db
    .select({ id: orderImages.id, filePath: orderImages.filePath })
    .from(orderImages)
    .where(
      and(
        eq(orderImages.orderItemId, orderItemId),
        eq(orderImages.type, "test_print")
      )
    );

  await Promise.allSettled(
    testPrintImgs.map((img) =>
      unlink(absoluteFromStored(img.filePath)).catch(() => {})
    )
  );

  for (const img of testPrintImgs) {
    await db.delete(orderImages).where(eq(orderImages.id, img.id));
  }

  // Update order: mark rejected + increment counter
  await db
    .update(orderItems)
    .set({
      testPrintStatus: "rejected",
      testPrintRejections: newCount,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(orderItems.orderItemId, orderItemId));

  // Notify the team (POC)
  await createNotification({
    type: "test_print",
    orderItemId,
    triggeredBy: Number(session.user.id),
    message: `${label} — order ${orderItemId}`,
    audience: "team",
    sendEmail: false,
  });

  // Notify the supplier in-app
  await createNotification({
    type: "test_print",
    orderItemId,
    triggeredBy: Number(session.user.id),
    message: `Your ${label} for order ${orderItemId}. Please re-upload.`,
    audience: "supplier",
  });

  // Email the supplier's portal users
  if (order.supplierId) {
    const [supplier] = await db
      .select({ name: suppliers.name, contactEmail: suppliers.contactEmail })
      .from(suppliers)
      .where(eq(suppliers.id, order.supplierId))
      .limit(1);

    const supplierUsers = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.supplierId, order.supplierId));

    const toAddresses = [
      ...supplierUsers.map((u) => u.email),
      ...(supplier?.contactEmail ? [supplier.contactEmail] : []),
    ].filter(Boolean).join(", ");

    if (toAddresses) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      await sendMail({
        to: toAddresses,
        subject: `[Fresh Prints] ${label} — order ${orderItemId}`,
        html: `
          <p>Hi,</p>
          <p>Your <strong>${label}</strong> for order <strong>${orderItemId}</strong> has been rejected.</p>
          <p>Please log in and re-upload your test prints.</p>
          <p style="margin-top:16px;">
            <a href="${appUrl}/supplier/orders/${orderItemId}">View order →</a>
          </p>
          <p style="margin-top:24px;color:#888;font-size:12px;">Fresh Prints ERP</p>
        `,
      });
    }
  }

  return NextResponse.json({ ok: true, label });
}
