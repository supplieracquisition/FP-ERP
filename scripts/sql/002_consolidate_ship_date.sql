-- Step 1 of the ship-date consolidation: data only, no behaviour change.
--
-- The tool has two columns for one concept. The sheet calls it "printer ship
-- date"; the tool reworked the term to "supplier ship date" and the UI already
-- moved — KanbanBoard reads supplier_ship_date everywhere, OrderDetail displays
-- and edits it, CapacityGrid expects it. Every SERVER read stayed on
-- printer_ship_date. This file makes supplier_ship_date the column that holds
-- the data, so the code changes that follow have something to read.
--
-- Nothing in the application reads original_supplier_ship_date or the
-- backfilled values yet. This file is deliberately shippable on its own and is
-- a no-op for the running app.
--
-- Run against PRODUCTION Postgres (Supabase SQL editor, or psql on the pooler
-- string). NOT via `npm run db:push` — see 001_add_processor_claim.sql for the
-- full reason: drizzle.config.ts points at the schema barrel that picks
-- pg-vs-sqlite from DATABASE_URL at import time, DATABASE_URL is not set in
-- .env.local, so push would read the SQLITE definitions while claiming dialect
-- "postgresql". push is additionally unsafe HERE specifically: it renders a
-- column rename as DROP + ADD, which would destroy every ship date in the
-- table.
--
-- Nothing is dropped by this file. printer_ship_date and
-- original_printer_ship_date are left in place, populated, and simply stop
-- being written — they are the rollback net. A later file retires them once a
-- production cycle confirms nothing reads them.
--
-- Idempotent — safe to re-run. Both backfills are guarded on IS NULL, so a
-- second run is a no-op and neither can overwrite a value already present.

-- ---------------------------------------------------------------------------
-- STEP 1 — PRE-FLIGHT. Run this FIRST, on its own, and READ THE OUTPUT.
-- ---------------------------------------------------------------------------
-- Expected: printer_ship_date, original_printer_ship_date and supplier_ship_date
-- all present; original_supplier_ship_date ABSENT.

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'order_items'
  AND column_name IN (
    'printer_ship_date', 'original_printer_ship_date',
    'supplier_ship_date', 'original_supplier_ship_date'
  )
ORDER BY column_name;

-- THE ONE NUMBER THAT GATES THIS MIGRATION: both_set_and_disagree.
--
-- The backfill below only fills rows where supplier_ship_date IS NULL, so a row
-- carrying BOTH dates keeps its supplier_ship_date and its printer_ship_date is
-- left behind. That is the correct resolution when the two agree, and when they
-- disagree it is a deliberate choice: supplier_ship_date is the one a human set
-- in the PO Builder, printer_ship_date is what the sheet last said.
--
-- On the local dev database this count is 0 (100 rows carry only
-- printer_ship_date, 3 carry only supplier_ship_date, 0 carry both), which is
-- what makes the backfill unambiguous there. PRODUCTION IS DIFFERENT DATA AND
-- HAS NOT BEEN CHECKED. If this returns a non-zero disagreement count, stop and
-- decide which side wins before running STEP 2 — do not let the IS NULL guard
-- make that call silently.

SELECT
  count(*)                                                          AS total,
  count(*) FILTER (WHERE printer_ship_date IS NOT NULL
                     AND supplier_ship_date IS NULL)                AS printer_only,
  count(*) FILTER (WHERE supplier_ship_date IS NOT NULL
                     AND printer_ship_date IS NULL)                 AS supplier_only,
  count(*) FILTER (WHERE printer_ship_date IS NOT NULL
                     AND supplier_ship_date IS NOT NULL)            AS both_set,
  count(*) FILTER (WHERE printer_ship_date IS NOT NULL
                     AND supplier_ship_date IS NOT NULL
                     AND printer_ship_date <> supplier_ship_date)   AS both_set_and_disagree,
  count(*) FILTER (WHERE printer_ship_date IS NULL
                     AND supplier_ship_date IS NULL)                AS neither
FROM order_items;


-- ---------------------------------------------------------------------------
-- STEP 2 — THE MIGRATION. Run as one block; DDL is transactional in Postgres,
-- so a failure anywhere rolls the whole thing back.
-- ---------------------------------------------------------------------------

BEGIN;

-- The immutable baseline the "this ship date moved" marker compares against
-- (the amber pencil in OrdersTable and KanbanBoard). Renamed alongside the live
-- column so the tool does not keep a half-renamed pair; added rather than
-- renamed so nothing is ever dropped while it still holds data.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS original_supplier_ship_date TEXT;

-- The consolidation. IS NULL guard makes this idempotent and, more importantly,
-- makes it incapable of overwriting a date a human set in the PO Builder.
UPDATE order_items
   SET supplier_ship_date = printer_ship_date
 WHERE supplier_ship_date IS NULL
   AND printer_ship_date IS NOT NULL;

UPDATE order_items
   SET original_supplier_ship_date = original_printer_ship_date
 WHERE original_supplier_ship_date IS NULL
   AND original_printer_ship_date IS NOT NULL;

-- Rows that had a supplier_ship_date but never an original (the three assigned
-- through the PO Builder, which writes the live date and no baseline). Seeding
-- the baseline to the current value means they read as "not moved", which is
-- true — they have not been re-dated since the PO was built. Without this the
-- marker logic sees a NULL baseline and the row can never show as moved.
UPDATE order_items
   SET original_supplier_ship_date = supplier_ship_date
 WHERE original_supplier_ship_date IS NULL
   AND supplier_ship_date IS NOT NULL;

COMMIT;


-- ---------------------------------------------------------------------------
-- STEP 3 — VERIFY. Run after the commit.
-- ---------------------------------------------------------------------------
-- Expect: original_supplier_ship_date present (text, YES); every row that had a
-- ship date in EITHER column now has supplier_ship_date set; orphaned_baseline
-- and lost_dates both 0; the old columns still populated and untouched.

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'order_items'
  AND column_name IN (
    'printer_ship_date', 'original_printer_ship_date',
    'supplier_ship_date', 'original_supplier_ship_date'
  )
ORDER BY column_name;

SELECT
  count(*)                                                        AS total,
  count(*) FILTER (WHERE supplier_ship_date IS NOT NULL)          AS has_ship_date,
  count(*) FILTER (WHERE original_supplier_ship_date IS NOT NULL) AS has_baseline,
  -- Must be 0: any row with a date in the old column but not the new one means
  -- the backfill did not reach it.
  count(*) FILTER (WHERE printer_ship_date IS NOT NULL
                     AND supplier_ship_date IS NULL)              AS lost_dates,
  -- Must be 0: a baseline with no live date to compare against.
  count(*) FILTER (WHERE original_supplier_ship_date IS NOT NULL
                     AND supplier_ship_date IS NULL)              AS orphaned_baseline,
  -- Informational: rows still legitimately without any ship date at all.
  count(*) FILTER (WHERE supplier_ship_date IS NULL)              AS no_ship_date
FROM order_items;

-- The rollback net, confirmed intact. Both counts should be unchanged from the
-- pre-flight.
SELECT
  count(*) FILTER (WHERE printer_ship_date IS NOT NULL)          AS old_live_still_populated,
  count(*) FILTER (WHERE original_printer_ship_date IS NOT NULL) AS old_baseline_still_populated
FROM order_items;
