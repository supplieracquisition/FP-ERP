import path from "path";

/**
 * Where uploaded order images live.
 *
 * Deliberately outside `public/`. Anything under `public/` is served by the
 * static handler, which runs before any of our code and applies no auth — and
 * `/uploads/` is additionally exempt from the proxy gate. Files placed there
 * are fetchable by anyone holding the URL, signed in or not.
 *
 * Nothing here is reachable by URL. The only way to read one of these files is
 * `GET /api/orders/[id]/images/[imageId]`, which applies denyOrderAccess first.
 */
export const UPLOAD_ROOT = path.join(process.cwd(), "private-uploads");

export function orderUploadDir(orderItemId: string) {
  return path.join(UPLOAD_ROOT, "orders", orderItemId);
}

/**
 * What goes in `order_images.file_path`: a path relative to UPLOAD_ROOT, not a
 * URL. Callers build the URL with imageUrl() instead, so the browser never
 * learns where a file sits on disk and no request path is ever turned back into
 * a filesystem path.
 */
export function storedPath(orderItemId: string, filename: string) {
  return `orders/${orderItemId}/${filename}`;
}

export function absoluteFromStored(stored: string) {
  // Tolerates rows written before the move, whose file_path is the old public
  // URL (`/uploads/orders/…`). Lets the data migration and the deploy land in
  // either order.
  const relative = stored.startsWith("/uploads/")
    ? stored.slice("/uploads/".length)
    : stored;
  return path.join(UPLOAD_ROOT, relative);
}

export function imageUrl(orderItemId: string, imageId: number) {
  return `/api/orders/${orderItemId}/images/${imageId}`;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export function contentTypeFor(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
