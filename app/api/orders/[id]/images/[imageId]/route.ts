import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderImages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, denyOrderAccess } from "@/lib/permissions";
import { readFile } from "fs/promises";
import { absoluteFromStored, contentTypeFor } from "@/lib/uploads";

/**
 * Serve one order image, to callers allowed to see that order.
 *
 * This route exists because these files used to sit in `public/uploads/`, where
 * the static handler served them to anyone with the URL.
 *
 * The image is addressed by row id, never by filename: the path on disk comes
 * from the database row, so no part of the request is used to build a
 * filesystem path and there is no traversal to defend against.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const session = await requireAuth();
  const { id: orderItemId, imageId } = await params;

  const denied = await denyOrderAccess(session, orderItemId);
  if (denied) return denied;

  const numericId = Number(imageId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [image] = await db
    .select()
    .from(orderImages)
    .where(eq(orderImages.id, numericId))
    .limit(1);

  // The row must belong to the order whose access we just checked — otherwise
  // any image could be fetched through an order the caller does happen to own.
  if (!image || image.orderItemId !== orderItemId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(absoluteFromStored(image.filePath));
  } catch {
    // Row without a file behind it — a rejected test print clears files before
    // rows, and the pre-move rows may not have been migrated yet.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentTypeFor(image.fileName ?? image.filePath),
      "Content-Length": String(bytes.byteLength),
      // Access-controlled: must never be held by a shared cache.
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
