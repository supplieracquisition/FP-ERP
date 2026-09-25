import { db } from "@/lib/db";
import { notifications, suppliers, users, orderItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { sendMail } from "@/lib/email";

export type NotificationType =
  | "comment"
  | "issue_report"
  | "test_print"
  | "status_change"
  /**
   * A PO was built and the order now belongs to a manufacturer. Directed at
   * "team", which reaches that supplier's POC — see the recipient note on
   * `audience` below.
   */
  | "assignment";
/**
 * Who a notification is for.
 *
 * There is no recipient column on `notifications` — delivery is decided on
 * read. GET /api/notifications shows a supplier the "supplier" rows for their
 * own supplier, and shows an internal user the "team" rows for the suppliers
 * they are POC of (an admin sees everything). So "team" does not mean everyone
 * internal: one team row is how you reach exactly that supplier's POC.
 */
export type Audience = "team" | "supplier";

interface CreateNotificationOptions {
  type: NotificationType;
  orderItemId: string;
  triggeredBy: number;
  message: string;
  audience: Audience;
  /** Send email to logistics@freshprints.com CC POC (only for team-directed supplier actions) */
  sendEmail?: boolean;
}

export async function createNotification(opts: CreateNotificationOptions) {
  // Look up supplierId from the order
  const [order] = await db
    .select({ supplierId: orderItems.supplierId })
    .from(orderItems)
    .where(eq(orderItems.orderItemId, opts.orderItemId))
    .limit(1);

  if (!order?.supplierId) return;
  const supplierId = order.supplierId;

  await db.insert(notifications).values({
    type: opts.type,
    orderItemId: opts.orderItemId,
    supplierId,
    triggeredBy: opts.triggeredBy,
    message: opts.message,
    audience: opts.audience,
    createdAt: new Date().toISOString(),
  });

  if (opts.sendEmail && opts.audience === "team") {
    // Look up POC email for the supplier
    const [supplier] = await db
      .select({ pocUserId: suppliers.pocUserId, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.id, supplierId))
      .limit(1);

    let pocEmail: string | undefined;
    if (supplier?.pocUserId) {
      const [poc] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, supplier.pocUserId))
        .limit(1);
      pocEmail = poc?.email;
    }

    const supplierName = supplier?.name ?? "a supplier";

    await sendMail({
      to: "logistics@freshprints.com",
      cc: pocEmail,
      subject: `[FP ERP] ${opts.message}`,
      html: `
        <p>${opts.message}</p>
        <p><strong>Supplier:</strong> ${supplierName}</p>
        <p><strong>Order:</strong> ${opts.orderItemId}</p>
        <p style="margin-top:16px;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/orders/${opts.orderItemId}">
            View order →
          </a>
        </p>
      `,
    });
  }
}
