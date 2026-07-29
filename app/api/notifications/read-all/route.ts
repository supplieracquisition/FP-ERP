import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifications, notificationReads } from "@/lib/db/schema";
import { eq, and, inArray, notInArray } from "drizzle-orm";
import { requireAuth } from "@/lib/permissions";

export async function POST() {
  const session = await requireAuth();
  const userId = Number(session.user.id);

  // Get all notification IDs visible to this user (reuse same logic)
  const allNotifs = await db
    .select({ id: notifications.id })
    .from(notifications);

  const allIds = allNotifs.map((n) => n.id);
  if (allIds.length === 0) return NextResponse.json({ ok: true });

  const alreadyRead = await db
    .select({ notificationId: notificationReads.notificationId })
    .from(notificationReads)
    .where(
      and(
        eq(notificationReads.userId, userId),
        inArray(notificationReads.notificationId, allIds)
      )
    );

  const alreadyReadIds = new Set(alreadyRead.map((r) => r.notificationId));
  const unreadIds = allIds.filter((id) => !alreadyReadIds.has(id));

  if (unreadIds.length > 0) {
    const readAt = new Date().toISOString();
    await Promise.all(
      unreadIds.map((notificationId) =>
        db.insert(notificationReads).values({ notificationId, userId, readAt })
      )
    );
  }

  return NextResponse.json({ ok: true });
}
