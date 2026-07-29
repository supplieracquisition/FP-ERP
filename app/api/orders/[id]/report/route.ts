import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { comments, orderImages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/permissions";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import heicConvert from "heic-convert";
import { createNotification } from "@/lib/createNotification";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id: orderItemId } = await params;

  const formData = await request.formData();
  const issue = formData.get("issue") as string | null;
  const requestedShipDate = formData.get("requestedShipDate") as string | null;
  const imageFiles = formData.getAll("images") as File[];

  if (!issue?.trim()) {
    return NextResponse.json({ error: "Issue description required" }, { status: 400 });
  }

  const commentBody = requestedShipDate?.trim()
    ? `${issue.trim()}\n\nRequested new ship date: ${requestedShipDate}`
    : issue.trim();

  const userId = Number(session.user.id);

  await db.insert(comments).values({
    orderItemId,
    userId,
    body: commentBody,
    isInternal: false,
  });

  for (const file of imageFiles) {
    if (!file || file.size === 0) continue;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "orders", orderItemId);
    await mkdir(uploadDir, { recursive: true });
    const rawExt = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const isHeic = rawExt === "heic" || rawExt === "heif";
    const ext = isHeic ? "jpg" : rawExt;
    const filename = `report-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    let bytes = Buffer.from(await file.arrayBuffer());
    if (isHeic) {
      const converted = await heicConvert({ buffer: bytes, format: "JPEG", quality: 0.9 });
      bytes = Buffer.from(converted);
    }
    await writeFile(path.join(uploadDir, filename), bytes);
    await db.insert(orderImages).values({
      orderItemId,
      type: "report",
      filePath: `/uploads/orders/${orderItemId}/${filename}`,
      fileName: file.name,
      uploadedBy: userId,
    });
  }

  const [poster] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  const posterName = poster?.name ?? "Someone";

  await createNotification({
    type: "issue_report",
    orderItemId,
    triggeredBy: userId,
    message: `${posterName} reported an issue on order ${orderItemId}`,
    audience: "team",
    sendEmail: true,
  });

  return NextResponse.json({ ok: true });
}
