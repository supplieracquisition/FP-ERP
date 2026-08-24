-- Deploy 1 of the order-processor claim/lock feature: schema only.
--
-- Adds order_items.processor_user_id and order_items.claimed_at. Nothing reads
-- or writes them yet — this file is deliberately shippable on its own, ahead of
-- any code, and is a no-op for the running application.
--
-- Run against PRODUCTION Postgres (Supabase SQL editor, or psql on the pooler
-- string). NOT via `npm run db:push`: drizzle.config.ts points at
-- lib/db/schema.ts, the barrel that picks pg-vs-sqlite from DATABASE_URL at
-- import time, and DATABASE_URL is commented out in .env.local — so push would
-- read the SQLITE table definitions while claiming dialect "postgresql", with
-- no connection string. The migrations folder is also behind production
-- (0000_right_spot.sql creates order_items without nominated_supplier_id), so
-- `drizzle-kit generate` would emit a large spurious diff.
--
-- Both columns are NULLable, so there is no table rewrite: Postgres only
-- updates the catalog and takes a brief ACCESS EXCLUSIVE lock. Immaterial at
-- 120 rows.
--
-- Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- STEP 1 — PRE-FLIGHT. Run this FIRST, on its own, and read the output.
-- ---------------------------------------------------------------------------
-- Expected before migrating: nominated_supplier_id and supplier_id present;
-- processor_user_id, claimed_at and po_created all ABSENT.
--
-- po_created is the dead flag being removed in this deploy. It should not exist
-- in production — it was only ever declared in schema.sqlite.ts. But the
-- barrel-file hazard above means a past `db:push` could have created it here by
-- accident, so check rather than assume. If the pre-flight DOES show it, stop
-- and confirm nothing reads it before dropping it (a grep of the repo says
-- nothing does).

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'order_items'
  AND column_name IN (
    'supplier_id', 'nominated_supplier_id',
    'processor_user_id', 'claimed_at', 'po_created'
  )
ORDER BY column_name;


-- ---------------------------------------------------------------------------
-- STEP 2 — THE MIGRATION. Run as one block; DDL is transactional in Postgres,
-- so a failure anywhere rolls the whole thing back.
-- ---------------------------------------------------------------------------

BEGIN;

-- The order PROCESSOR: whoever builds the PO. Separate from
-- suppliers.poc_user_id, which is the handler of a SUPPLIER. Never cleared once
-- the PO is built — it is the permanent "who processed this" record.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS processor_user_id INTEGER;

-- When the current claim was taken. A claim older than 24h is treated as
-- abandoned on read, which is why this feature ships with no cron job.
--
-- TEXT, to match every other timestamp in this schema, and ALWAYS written from
-- JS as new Date().toISOString(). Never give this column a now() default:
-- expiry is a string comparison, now() renders "2026-08-24 12:00:00+00" and
-- toISOString() renders "2026-08-24T12:00:00.000Z", and space (0x20) sorts
-- before "T" (0x54). A column holding both formats compares wrong and every
-- stale claim reads as fresh — the lock would stop expiring, silently.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS claimed_at TEXT;

-- Matches the .references(() => users.id) in schema.pg.ts. ADD CONSTRAINT has
-- no IF NOT EXISTS form, hence the exception guard.
DO $$ BEGIN
  ALTER TABLE order_items
    ADD CONSTRAINT order_items_processor_user_id_users_id_fk
    FOREIGN KEY (processor_user_id) REFERENCES users(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_processor
  ON order_items (processor_user_id);

-- The dead flag. Declared only in schema.sqlite.ts, referenced by zero
-- application code, absent from schema.pg.ts. Expected to be a no-op here; see
-- the pre-flight note above.
ALTER TABLE order_items DROP COLUMN IF EXISTS po_created;

COMMIT;


-- ---------------------------------------------------------------------------
-- STEP 3 — VERIFY. Run after the commit.
-- ---------------------------------------------------------------------------
-- Expect: processor_user_id (integer, YES) and claimed_at (text, YES) present,
-- po_created absent, the FK and index listed, and the order count unchanged
-- with every row unclaimed.

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'order_items'
  AND column_name IN ('processor_user_id', 'claimed_at', 'po_created')
ORDER BY column_name;

SELECT conname FROM pg_constraint
WHERE conname = 'order_items_processor_user_id_users_id_fk';

SELECT indexname FROM pg_indexes
WHERE tablename = 'order_items' AND indexname = 'idx_order_items_processor';

SELECT count(*) AS total_orders,
       count(*) FILTER (WHERE supplier_id IS NULL) AS in_pool,
       count(*) FILTER (WHERE processor_user_id IS NOT NULL) AS claimed
FROM order_items;
