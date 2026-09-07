/**
 * Seed the synthetic world the stress test runs in: 50 internal agents, one
 * inactive supplier to build POs against, and 60 pool orders.
 *
 *   npx tsx scripts/loadtest/seed.ts
 *
 * Everything created here is prefixed or suffixed so teardown.ts can find it by
 * pattern, and nothing here touches a real row.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import {
  sql,
  banner,
  dbFingerprint,
  writeManifest,
  MANIFEST_PATH,
  BASE_URL,
  TARGET,
  type Agent,
  type SeededOrder,
} from "./lib";

const AGENT_COUNT = 50;
const ORDER_COUNT = 60;

/** Reserved by RFC 2606: cannot resolve, so a stray notify path cannot mail a real person. */
const EMAIL_DOMAIN = "fp-erp.invalid";
const SUPPLIER_NAME = "LOADTEST Supplier (delete me)";

async function main() {
  banner("SEED");

  if (fs.existsSync(MANIFEST_PATH) && !process.argv.includes("--force")) {
    throw new Error(
      `A manifest already exists at ${MANIFEST_PATH}.\n` +
        `Run teardown.ts first. Seeding on top of a live run would orphan the previous ` +
        `rows — they would stop being in the manifest, and teardown works from patterns ` +
        `but verification works from the manifest.`
    );
  }

  // The number that defines the real blast radius: every one of these is an
  // order a buggy harness could reach, because pool rows are visible to every
  // internal user regardless of POC.
  const [{ count: livePool }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM order_items WHERE supplier_id IS NULL
  `;
  console.log(`  Real orders currently in the pool: ${livePool}`);
  console.log(`  (Phase 0 snapshots these; teardown diffs them.)\n`);

  // -- agents ---------------------------------------------------------------
  //
  // auth_id is generated here rather than by gen_random_uuid() so the harness
  // holds the value without a second round-trip. No Supabase auth user is
  // created: lib/auth.ts matches the fp-user-id cookie straight against this
  // column, so a row here is a complete, working session.
  //
  // role 'internal' with no POC assignment anywhere is what makes these agents
  // fail closed — orderScope() gives a POC-of-nothing internal user the
  // unassigned pool and nothing else. Do NOT set suppliers.poc_user_id to any
  // of these ids; that would widen their scope to real assigned orders.
  const agentRows = Array.from({ length: AGENT_COUNT }, (_, i) => ({
    auth_id: crypto.randomUUID(),
    email: `loadtest+${i + 1}@${EMAIL_DOMAIN}`,
    name: `Loadtest Agent ${i + 1}`,
    role: "internal",
  }));

  // No row-type generic on the inserts: postgres-js cannot reconcile an
  // explicit result type with a spread Helper in the same template, so the
  // shape is asserted on the way out instead.
  const insertedUsers = (await sql`
    INSERT INTO users ${sql(agentRows, "auth_id", "email", "name", "role")}
    RETURNING id, auth_id, email
  `) as unknown as { id: number; auth_id: string; email: string }[];
  const agents: Agent[] = insertedUsers.map((u) => ({
    userId: u.id,
    authId: u.auth_id,
    email: u.email,
  }));
  console.log(`  Seeded ${agents.length} agents (user ids ${agents[0].userId}–${agents[agents.length - 1].userId})`);

  // -- supplier -------------------------------------------------------------
  //
  // A synthetic supplier rather than a real one. assign-items only reads the
  // name, so a real supplier would work — but it would also leave phantom
  // orders sitting in that supplier's view until teardown, and there is one
  // real supplier account live right now. active=false keeps it out of the UI's
  // supplier lists. poc_user_id stays NULL: pointing it at an agent would give
  // that agent scope over these orders after assignment.
  const [supplier] = await sql<{ id: number }[]>`
    INSERT INTO suppliers (name, nickname, active, poc_user_id)
    VALUES (${SUPPLIER_NAME}, 'LOADTEST', false, NULL)
    RETURNING id
  `;
  console.log(`  Seeded supplier id ${supplier.id} (inactive)`);

  // -- orders ---------------------------------------------------------------
  //
  // supplier_id NULL puts them in the pool, which is where the claim lock
  // operates. claimed_at stays NULL — Phase 7 sets it, and only ever in
  // toISOString() format.
  const orderRows = Array.from({ length: ORDER_COUNT }, (_, i) => ({
    order_id: "LOADTEST",
    order_item_id: `LOADTEST-${String(i + 1).padStart(4, "0")}`,
    order_name: `Loadtest order ${i + 1}`,
    quantity: 10,
    status: "in_production",
    supplier_id: null,
  }));

  const insertedOrders = (await sql`
    INSERT INTO order_items ${sql(
      orderRows,
      "order_id",
      "order_item_id",
      "order_name",
      "quantity",
      "status",
      "supplier_id"
    )}
    RETURNING id, order_item_id
  `) as unknown as { id: number; order_item_id: string }[];
  const orders: SeededOrder[] = insertedOrders.map((o) => ({
    id: o.id,
    orderItemId: o.order_item_id,
  }));
  console.log(`  Seeded ${orders.length} pool orders (${orders[0].orderItemId}–${orders[orders.length - 1].orderItemId})`);

  writeManifest({
    version: 1,
    target: TARGET,
    baseUrl: BASE_URL,
    db: dbFingerprint(),
    seededAt: new Date().toISOString(),
    agents,
    orders,
    supplierId: supplier.id,
  });

  console.log(`\n  Manifest: ${MANIFEST_PATH} (0600)`);
  console.log(`  This file contains ${AGENT_COUNT} working session credentials. Do not copy it into the repo.`);
  console.log(`\n  Window start (for the [auth-path] log spike): ${new Date().toISOString()}`);
  console.log(`  Record it — Stage 6's evidence gate reads these logs, and this run will`);
  console.log(`  add tens of thousands of fp-user-id resolutions that are not real users.`);

  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
