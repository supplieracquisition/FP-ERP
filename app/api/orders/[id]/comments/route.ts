import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { comments, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/permissions";
import { createNotification } from "@/lib/createNotification";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id: orderItemId } = await params;
  const body = await request.json();

  if (!body.body?.trim()) {
    return NextResponse.json({ error: "Comment body required" }, { status: 400 });
  }

  const isInternal = session.user.role !== "supplier" && Boolean(body.isInternal);
  const userId = Number(session.user.id);

  await db.insert(comments).values({
    orderItemId,
    userId,
    body: body.body.trim(),
    isInternal,
  });

  const [poster] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const posterName = poster?.name ?? "Someone";

  if (session.user.role === "supplier") {
    // Supplier comment → notify team, send email
    await createNotification({
      type: "comment",
      orderItemId,
      triggeredBy: userId,
      message: `${posterName} left a comment on order ${orderItemId}`,
      audience: "team",
      sendEmail: true,
    });
  } else {
    // Team comment on supplier order → notify supplier
    await createNotification({
      type: "comment",
      orderItemId,
      triggeredBy: userId,
      message: `${posterName} replied to your order ${orderItemId}`,
      audience: "supplier",
    });
  }

  return NextResponse.json({ ok: true });
}
