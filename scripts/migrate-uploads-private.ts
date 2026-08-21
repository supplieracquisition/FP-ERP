/**
 * Move order images out of public/ and repoint their rows.
 *
 * Files under public/uploads/ are served by the static handler with no auth.
 * They now live in private-uploads/ and are reachable only through
 * GET /api/orders/[id]/images/[imageId], which applies denyOrderAccess.
 *
 * Run once per environment, against whichever database DATABASE_URL selects:
 *   npx tsx scripts/migrate-uploads-private.ts
 *
 * Idempotent: rows already migrated are skipped, and a missing source file is
 * reported rather than fatal (production may have rows whose uploads never
 * landed, since Vercel's filesystem is read-only outside /tmp).
 */
import { db } from "../lib/db";
import { orderImages } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { mkdir, rename, access } from "fs/promises";
import path from "path";
import { UPLOAD_ROOT } from "../lib/uploads";

const PUBLIC_ROOT = path.join(process.cwd(), "public", "uploads");
const LEGACY_PREFIX = "/uploads/";

async function exists(p: string) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const rows = await db.select().from(orderImages);
  console.log(`${rows.length} image row(s) found`);

  let moved = 0;
  let repointed = 0;
  let skipped = 0;
  let missing = 0;

  for (const row of rows) {
    if (!row.filePath.startsWith(LEGACY_PREFIX)) {
      skipped++;
      continue;
    }

    const relative = row.filePath.slice(LEGACY_PREFIX.length);
    const from = path.join(PUBLIC_ROOT, relative.replace(/^orders\//, "orders/"));
    const to = path.join(UPLOAD_ROOT, relative);

    if (await exists(from)) {
      await mkdir(path.dirname(to), { recursive: true });
      await rename(from, to);
      moved++;
    } else if (!(await exists(to))) {
      console.warn(`  no file on disk for row ${row.id}: ${row.filePath}`);
      missing++;
    }

    // Repoint regardless: the row should describe the new scheme even when the
    // file behind it is already gone, so the serving route 404s cleanly.
    await db
      .update(orderImages)
      .set({ filePath: relative })
      .where(eq(orderImages.id, row.id));
    repointed++;
  }

  console.log(
    `moved ${moved} file(s), repointed ${repointed} row(s), ` +
      `skipped ${skipped} already-migrated, ${missing} row(s) with no file`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
