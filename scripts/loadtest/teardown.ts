/**
 * Remove everything the test created, then prove the fence held.
 *
 *   npx tsx scripts/loadtest/teardown.ts
 *
 * The verification is not optional decoration. Deleting the synthetic rows is
 * easy; the question that actually matters is whether the harness touched a
 * real one, and the only way to answer it is to diff against the Phase 0
 * snapshot before the evidence ages out.
 */

import fs from "node:fs";
import path from "node:path";
import { sql, banner, check, finish, readManifest, MANIFEST_PATH, RESULTS_DIR } from "./lib";

async function main() {
  banner("TEARDOWN");
  const m = readManifest();

  // -- delete, children first ------------------------------------------------
  //
  // Order is forced by foreign keys, and the last two are the ones that bite:
  // order_items.processor_user_id references users.id, so the agent rows cannot
  // go until every synthetic order that points at one is gone. If a delete here
  // errors, something survived that you did not expect — find it rather than
  // forcing past it.
  const counts: Record<string, number> = {};
  const del = async (label: string, run: () => Promise<any>) => {
    const r = await run();
    counts[label] = r.count ?? 0;
    console.log(`  deleted ${String(r.count ?? 0).padStart(5)} ${label}`);
  };

  await del("notification_reads", () => sql`
    DELETE FROM notification_reads WHERE notification_id IN (
      SELECT id FROM notifications WHERE order_item_id LIKE 'LOADTEST-%'
    )`);
  await del("notifications", () => sql`DELETE FROM notifications WHERE order_item_id LIKE 'LOADTEST-%'`);
  await del("status_history", () => sql`DELETE FROM status_history WHERE order_item_id LIKE 'LOADTEST-%'`);
  await del("comments", () => sql`DELETE FROM comments WHERE order_item_id LIKE 'LOADTEST-%'`);
  await del("order_images", () => sql`DELETE FROM order_images WHERE order_item_id LIKE 'LOADTEST-%'`);
  await del("order_items", () => sql`DELETE FROM order_items WHERE order_item_id LIKE 'LOADTEST-%'`);
  await del("suppliers", () => sql`DELETE FROM suppliers WHERE id = ${m.supplierId}`);
  await del("users", () => sql`DELETE FROM users WHERE email LIKE 'loadtest+%@fp-erp.invalid'`);

  // -- verify the fence held -------------------------------------------------

  const [{ n: leftovers }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM order_items WHERE order_item_id LIKE 'LOADTEST-%'
  `;
  check("no synthetic orders remain", leftovers === "0", `${leftovers} left`);

  const [{ n: leftUsers }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM users WHERE email LIKE 'loadtest+%@fp-erp.invalid'
  `;
  check("no synthetic users remain", leftUsers === "0", `${leftUsers} left`);

  // Did any REAL order change during the test window? updated_at is written by
  // both the claim endpoint and assign-items, so anything the harness touched
  // shows up here. Empty is the answer you want.
  //
  // The ::timestamptz casts are load-bearing, not tidiness. updated_at is TEXT
  // and production holds TWO formats in it: the routes write
  // toISOString() ("...T21:00:39.099Z") while the column's now() default and
  // the n8n import write Postgres style ("... 21:00:39.099195+00"). A plain
  // `updated_at > $seededAt` is therefore a lexicographic comparison across
  // mixed formats, and space (0x20) sorts before "T" (0x54) — so every
  // space-formatted row reads as OLDER than any ISO cutoff on the same date,
  // whatever its real time. Measured against production: a probe of
  // 2026-09-07T20:00:00Z found 0 rows lexicographically and 1 by cast.
  //
  // This is the same hazard the schema comments document for claimed_at, in a
  // different column — and here it would have made the safety check silently
  // report "no real order was modified" while a real one had been. Casting both
  // sides makes Postgres parse them as instants, which it does correctly for
  // both formats.
  const touched = await sql`
    SELECT order_item_id, supplier_id, processor_user_id, updated_at
    FROM order_items
    WHERE order_item_id NOT LIKE 'LOADTEST-%'
      AND updated_at::timestamptz > ${m.seededAt}::timestamptz
    ORDER BY updated_at::timestamptz
  `;
  check("no real order was modified during the window", touched.length === 0, `${touched.length} rows`);
  if (touched.length) {
    console.log("\n  Real orders modified during the test window:");
    touched.forEach((r: any) => console.log(`    ${r.order_item_id} supplier=${r.supplier_id} processor=${r.processor_user_id} at=${r.updated_at}`));
    console.log("  Some of these may be real users working normally — check the timestamps");
    console.log("  against your window before assuming the harness did it.");
  }

  // Diff the real pool against the Phase 0 snapshot.
  const snapshotFile = path.join(RESULTS_DIR, "phase0-real-pool-snapshot.json");
  if (fs.existsSync(snapshotFile)) {
    const before = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
    const after = await sql`
      SELECT order_item_id, processor_user_id, claimed_at, supplier_id
      FROM order_items WHERE supplier_id IS NULL AND order_item_id NOT LIKE 'LOADTEST-%'
      ORDER BY order_item_id
    `;
    const key = (r: any) => `${r.order_item_id}|${r.processor_user_id}|${r.claimed_at}|${r.supplier_id}`;
    const beforeSet = new Set(before.rows.map(key));
    const changed = after.filter((r: any) => !beforeSet.has(key(r)));
    const vanished = before.rows.filter((r: any) => !after.some((a: any) => a.order_item_id === r.order_item_id));

    check("real pool orders unchanged", changed.length === 0, `${changed.length} differ`);
    check("no real pool order left the pool", vanished.length === 0, `${vanished.length} vanished`);
    if (vanished.length) {
      console.log("\n  A real order leaving the pool means it was ASSIGNED — permanent, and the");
      console.log("  release endpoint refuses to undo it. Investigate before doing anything else:");
      vanished.forEach((r: any) => console.log(`    ${r.order_item_id}`));
    }
  } else {
    console.log(`  SKIP  pool diff — no Phase 0 snapshot at ${snapshotFile}`);
  }

  // The format invariant, re-checked. If the test itself corrupted it, this is
  // where that shows up.
  const [{ n: malformed }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM order_items
    WHERE claimed_at IS NOT NULL AND claimed_at NOT LIKE '%T%'
  `;
  check("claimed_at still holds exactly one format", malformed === "0", `${malformed} space-separated rows`);

  // The manifest is 50 live session credentials. Once the users are gone the
  // values are inert, but there is no reason to leave them lying around.
  fs.rmSync(MANIFEST_PATH, { force: true });
  console.log(`\n  Removed manifest ${MANIFEST_PATH}`);
  console.log(`  Results kept in ${RESULTS_DIR}`);
  console.log(`\n  Window for the [auth-path] log spike: ${m.seededAt} → ${new Date().toISOString()}`);
  console.log(`  Note it against Stage 6 — those fp-user-id resolutions were this test, not real users.`);

  await finish();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
