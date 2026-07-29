import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications, notificationReads, suppliers, users } from "@/lib/db/schema";
import { eq, desc, and, notInArray, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/permissions";

export async function GET() {
  const session = await requireAuth();
  const userId = Number(session.user.id);

  // Fetch all notifications the user is allowed to see
  let rows;

  if (session.user.role === "admin") {
    // Admin sees everything
    rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        orderItemId: notifications.orderItemId,
        supplierId: notifications.supplierId,
        message: notifications.message,
        audience: notifications.audience,
        createdAt: notifications.createdAt,
        triggeredByName: users.name,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.triggeredBy, users.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  } else if (session.user.role === "supplier") {
    // Supplier sees only supplier-directed notifications for their supplier
    const supplierId = Number(session.user.supplierId);
    rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        orderItemId: notifications.orderItemId,
        supplierId: notifications.supplierId,
        message: notifications.message,
        audience: notifications.audience,
        createdAt: notifications.createdAt,
        triggeredByName: users.name,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.triggeredBy, users.id))
      .where(
        and(
          eq(notifications.audience, "supplier"),
          eq(notifications.supplierId, supplierId)
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  } else {
    // Internal user (POC) — sees team notifications for suppliers they are POC of
    const pocSuppliers = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.pocUserId, userId));

    const pocSupplierIds = pocSuppliers.map((s) => s.id);

    if (pocSupplierIds.length === 0) {
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }

    rows = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        orderItemId: notifications.orderItemId,
        supplierId: notifications.supplierId,
        message: notifications.message,
        audience: notifications.audience,
        createdAt: notifications.createdAt,
        triggeredByName: users.name,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.triggeredBy, users.id))
      .where(
        and(
          eq(notifications.audience, "team"),
          inArray(notifications.supplierId, pocSupplierIds)
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  if (rows.length === 0) {
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }

  const notifIds = rows.map((r) => r.id);
  const reads = await db
    .select({ notificationId: notificationReads.notificationId })
    .from(notificationReads)
    .where(
      and(
        eq(notificationReads.userId, userId),
        inArray(notificationReads.notificationId, notifIds)
      )
    );

  const readSet = new Set(reads.map((r) => r.notificationId));
  const result = rows.map((n) => ({ ...n, read: readSet.has(n.id) }));
  const unreadCount = result.filter((n) => !n.read).length;

  return NextResponse.json({ notifications: result, unreadCount });
}
