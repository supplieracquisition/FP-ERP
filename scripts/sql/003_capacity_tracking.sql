-- Capacity tracking: two measurements from one capacity number.
--
-- Adds suppliers.weekly_capacity (orders per week) and order_items.assigned_date
-- (when a printer was put on the job). Together those give:
--
--   INTAKE   -- orders assigned to a supplier in the trailing 7 days, against
--               weekly_capacity. "Am I handing this factory more than it can
--               take on?"
--   PIPELINE -- orders occupying the factory right now, against a ceiling
--               DERIVED as weekly_capacity x (production_time / 7). "Is the
--               floor already full?"
--
-- Deliberately one entered number, not two. The old capacity_units was an
-- orders-per-DAY figure that had to be reconciled by hand against
-- production_time, and getting that relationship wrong is what made the
-- previous capacity display untrustworthy. The daily ceiling is now derived,
-- never typed.
--
-- Run against PRODUCTION Postgres (Supabase SQL editor). NOT via
-- `npm run db:push` -- see 001_add_processor_claim.sql for why: the schema
-- barrel picks its dialect from DATABASE_URL at import time, so push would read
-- the SQLite definitions while claiming postgres.
--
-- capacity_units is NOT dropped and NOT read. It keeps its data and stops being
-- an input, the same treatment printer_ship_date got in 002.
--
-- Idempotent -- safe to re-run. The backfill is guarded on IS NULL so a second
-- run cannot overwrite a real assignment timestamp.

-- ---------------------------------------------------------------------------
-- STEP 1 -- PRE-FLIGHT. Run first, on its own.
-- ---------------------------------------------------------------------------
-- Expected: weekly_capacity and assigned_date both ABSENT; capacity_units and
-- production_time present.

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE (table_name = 'suppliers'   AND column_name IN ('weekly_capacity','capacity_units','production_time'))
   OR (table_name = 'order_items' AND column_name IN ('assigned_date','claimed_at','supplier_id'))
ORDER BY table_name, column_name;

-- How much of the backfill will land. assigned_date is reconstructed from
-- claimed_at, which is the closest thing to an assignment time that exists --
-- assign-items preserves it through COALESCE, so for an order claimed and
-- built in one sitting it IS the assignment moment.
--
-- backfillable is what gets a timestamp; assigned_no_claim stays NULL forever
-- and reads as "assigned before tracking existed", which correctly scores zero
-- in any trailing-7-day window.
SELECT
  count(*)                                                                  AS total_orders,
  count(*) FILTER (WHERE supplier_id IS NOT NULL)                           AS assigned,
  count(*) FILTER (WHERE supplier_id IS NOT NULL AND claimed_at IS NOT NULL) AS backfillable,
  count(*) FILTER (WHERE supplier_id IS NOT NULL AND claimed_at IS NULL)     AS assigned_no_claim
FROM order_items;

-- How many suppliers can actually be measured once this lands. Both numbers
-- are expected to be 0 for weekly_capacity -- nobody has entered one yet, and
-- until they do every indicator reads "not set" rather than a false green.
SELECT
  count(*)                                                AS suppliers,
  count(*) FILTER (WHERE production_time IS NOT NULL)      AS have_production_time,
  count(*) FILTER (WHERE capacity_units IS NOT NULL)       AS have_old_daily_capacity
FROM suppliers;


-- ---------------------------------------------------------------------------
-- STEP 2 -- THE MIGRATION. One block; DDL is transactional in Postgres.
-- ---------------------------------------------------------------------------

BEGIN;

-- Orders per WEEK. The only capacity figure anyone types from here on.
-- Nullable on purpose: NULL means "not set yet" and every indicator degrades to
-- a grey "not set" rather than inventing a threshold.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS weekly_capacity INTEGER;

-- When a printer was put on this order. Distinct from claimed_at (who picked
-- the job up, which can precede the PO by days and is cleared on release) and
-- from imported_at (when the row reached the ERP).
--
-- TEXT and ALWAYS written from JS as toISOString(), never a now() default --
-- the trailing-window comparison is a string comparison, and Postgres now()
-- renders "2026-09-08 12:00:00+00" while toISOString() renders
-- "2026-09-08T12:00:00.000Z". Space (0x20) sorts before "T" (0x54), so a column
-- holding both formats compares wrong. Same rule as claimed_at.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS assigned_date TEXT;

-- Intake is a trailing-window count, so it is read far more often than it is
-- written and always alongside supplier_id.
CREATE INDEX IF NOT EXISTS idx_order_items_assigned_date
  ON order_items (supplier_id, assigned_date);

-- Backfill. Only where the order is genuinely assigned -- a claimed_at on an
-- unassigned row is a live claim on a pool item, not an assignment, and
-- copying it would invent intake that never happened.
UPDATE order_items
   SET assigned_date = claimed_at
 WHERE assigned_date IS NULL
   AND supplier_id IS NOT NULL
   AND claimed_at IS NOT NULL;

COMMIT;


-- ---------------------------------------------------------------------------
-- STEP 3 -- VERIFY.
-- ---------------------------------------------------------------------------
-- Expect: both columns present; backfilled equals STEP 1's backfillable;
-- phantom_intake 0 (no unassigned row carries an assignment timestamp);
-- weekly_capacity present and entirely NULL.

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE (table_name = 'suppliers'   AND column_name = 'weekly_capacity')
   OR (table_name = 'order_items' AND column_name = 'assigned_date')
ORDER BY table_name;

SELECT
  count(*) FILTER (WHERE assigned_date IS NOT NULL)                            AS backfilled,
  count(*) FILTER (WHERE supplier_id IS NOT NULL AND assigned_date IS NULL)    AS assigned_but_untimed,
  -- Must be 0: an unassigned order can never have an assignment time.
  count(*) FILTER (WHERE supplier_id IS NULL AND assigned_date IS NOT NULL)    AS phantom_intake
FROM order_items;

SELECT indexname FROM pg_indexes
WHERE tablename = 'order_items' AND indexname = 'idx_order_items_assigned_date';

SELECT count(*) AS suppliers,
       count(weekly_capacity) AS weekly_capacity_set
FROM suppliers;
