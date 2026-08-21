import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderImages, orderItems, suppliers, users, testPrintQueue } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, denyOrderAccess } from "@/lib/permissions";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import heicConvert from "heic-convert";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id: orderItemId } = await params;

  const denied = await denyOrderAccess(session, orderItemId);
  if (denied) return denied;

  const imgs = await db
    .select()
    .from(orderImages)
    .where(eq(orderImages.orderItemId, orderItemId));
  return NextResponse.json(imgs);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id: orderItemId } = await params;

  // Checked before the upload is read or written: without this a supplier can
  // plant a file on another supplier's order, and a test_print upload also
  // flips that order's status below.
  const denied = await denyOrderAccess(session, orderItemId);
  if (denied) return denied;

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const type = formData.get("type") as string | null;

  if (!file || !type) {
    return NextResponse.json({ error: "Missing file or type" }, { status: 400 });
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "orders", orderItemId);
  await mkdir(uploadDir, { recursive: true });

  const rawExt = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const isHeic = rawExt === "heic" || rawExt === "heif";
  const ext = isHeic ? "jpg" : rawExt;
  const filename = `${type}-${Date.now()}.${ext}`;

  let bytes = Buffer.from(await file.arrayBuffer());
  if (isHeic) {
    const converted = await heicConvert({ buffer: bytes, format: "JPEG", quality: 0.9 });
    bytes = Buffer.from(converted);
  }

  await writeFile(path.join(uploadDir, filename), bytes);

  const urlPath = `/uploads/orders/${orderItemId}/${filename}`;

  await db.insert(orderImages).values({
    orderItemId,
    type,
    filePath: urlPath,
    fileName: file.name,
    uploadedBy: Number(session.user.id),
  });

  // When a supplier uploads a test print, queue it for batch notification (debounced)
  if (type === "test_print" && session.user.role === "supplier") {
    // Always set status to needs_approval (regardless of previous state)
    await db
      .update(orderItems)
      .set({ testPrintStatus: "needs_approval", updatedAt: new Date().toISOString() })
      .where(eq(orderItems.orderItemId, orderItemId));

    // Upsert into queue: if row exists, increment count; if not, insert with count=1
    const existingQueue = await db
      .select()
      .from(testPrintQueue)
      .where(eq(testPrintQueue.orderItemId, orderItemId))
      .limit(1);

    if (existingQueue.length > 0) {
      // Already queued, increment count
      await db
        .update(testPrintQueue)
        .set({ uploadCount: existingQueue[0].uploadCount + 1 })
        .where(eq(testPrintQueue.orderItemId, orderItemId));
    } else {
      // New queue entry
      await db.insert(testPrintQueue).values({
        orderItemId,
        uploadCount: 1,
        firstUploadTime: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({ ok: true, filePath: urlPath });
}
