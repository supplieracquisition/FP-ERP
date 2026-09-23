-- The audit trail: one row per change anyone made through the tool.
--
-- Creates activity_log and seeds it from the history that already exists, so
-- the page is not blank on its first day.
--
-- Run against PRODUCTION Postgres (Supabase SQL editor). NOT via
-- `npm run db:push` -- see 001_add_processor_claim.sql for why: the schema
-- barrel picks its dialect from DATABASE_URL at import time, so push would read
-- the SQLite definitions while claiming postgres.
--
-- NOTHING IN THIS TABLE IS A FOREIGN KEY, and that is deliberate rather than an
-- omission. The most important events it records are deletions -- an order
-- wiped, a user removed. A reference to order_items would make those
-- impossible to record: ON DELETE CASCADE would erase the evidence along with
-- the order, and a plain reference would block the delete outright. The log has
-- to outlive everything it describes. The same reasoning drives actor_name and
-- supplier_name being stored text rather than joins: they still answer "who did
-- this" after the account is gone.
--
-- Idempotent -- safe to re-run. The backfill is guarded on a NOT EXISTS against
-- what it already inserted, so a second run adds nothing.

-- ---------------------------------------------------------------------------
-- STEP 1 -- PRE-FLIGHT. Run first, on its own.
-- ---------------------------------------------------------------------------
-- Expected: activity_log ABSENT. The three source tables present, with the row
-- counts you are about to backfill.

SELECT table_name
FROM information_schema.tables
WHERE table_name = 'activity_log';

SELECT
  (SELECT count(*) FROM status_history) AS status_history_rows,
  (SELECT count(*) FROM comments)       AS comment_rows,
  (SELECT count(*) FROM csv_imports)    AS import_rows;


-- ---------------------------------------------------------------------------
-- STEP 2 -- THE MIGRATION. One block; DDL is transactional in Postgres.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE TABLE IF NOT EXISTS activity_log (
  id            SERIAL PRIMARY KEY,
  -- TEXT, and ALWAYS written from JS as toISOString() -- never a now() default.
  -- Same rule as order_items.claimed_at and assigned_date, for the same reason:
  -- these sort as strings, and Postgres now() renders "2026-09-22 12:00:00+00"
  -- while toISOString() renders "2026-09-22T12:00:00.000Z". Space (0x20) sorts
  -- before "T" (0x54), so a column holding both formats orders wrong -- which
  -- in a log means entries silently appearing on the wrong day.
  created_at    TEXT    NOT NULL,
  -- Null for anything the system did on its own (n8n imports, cron).
  actor_user_id INTEGER,
  actor_name    TEXT    NOT NULL,
  actor_role    TEXT    NOT NULL,
  action        TEXT    NOT NULL,
  entity_type   TEXT    NOT NULL,
  entity_id     TEXT,
  order_item_id TEXT,
  supplier_id   INTEGER,
  supplier_name TEXT,
  summary       TEXT    NOT NULL,
  details       TEXT
);

-- The log is read newest-first with no other filter far more often than any
-- other way, so this is the index carrying the default view and its paging.
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at    ON activity_log (created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_order_item_id ON activity_log (order_item_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor         ON activity_log (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action        ON activity_log (action);

-- ---------------------------------------------------------------------------
-- BACKFILL. Everything already recorded, converted into log entries.
--
-- Three sources, and they are all this database holds: status_history (stage
-- moves), comments, and csv_imports. Nominations, claims, assignments, date
-- edits, role changes and deletions were never recorded anywhere before the
-- code accompanying this migration, so they CANNOT be recovered -- the log
-- begins for those the moment this ships.
--
-- created_at is normalised to the toISOString shape. status_history.changed_at
-- defaults to now() in Postgres, so historical rows carry the
-- "2026-05-06 13:52:27+00" form; left as-is they would sort before every entry
-- written from JS regardless of their actual date. replace(...,' ','T') is not
-- enough on its own -- the offset has to go too -- so this goes through
-- to_char, which produces exactly the JS shape.
-- ---------------------------------------------------------------------------

-- Stage and status moves.
INSERT INTO activity_log (
  created_at, actor_user_id, actor_name, actor_role,
  action, entity_type, entity_id, order_item_id, supplier_id, summary, details
)
SELECT
  to_char(sh.changed_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  sh.changed_by,
  COALESCE(u.name, u.email, 'Unknown'),
  COALESCE(u.role, 'internal'),
  -- An assignment written by the PO Builder carries this exact note; anything
  -- else is an ordinary stage move. This is the only signal the old rows have.
  CASE WHEN sh.note LIKE 'PO built%' THEN 'order.assign' ELSE 'order.stage' END,
  'order',
  sh.order_item_id,
  sh.order_item_id,
  oi.supplier_id,
  CASE
    WHEN sh.note LIKE 'PO built%' THEN 'Built the PO for order ' || sh.order_item_id || ' — ' || sh.note
    ELSE 'Moved order ' || sh.order_item_id || ' from ' || COALESCE(sh.from_status, 'unassigned') || ' to ' || sh.to_status
  END,
  json_build_object('from', sh.from_status, 'to', sh.to_status, 'note', sh.note, 'backfilled', true)::text
FROM status_history sh
LEFT JOIN users       u  ON u.id = sh.changed_by
LEFT JOIN order_items oi ON oi.order_item_id = sh.order_item_id
WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE details LIKE '%"backfilled": true%' AND entity_id = sh.order_item_id AND action IN ('order.stage','order.assign'));

-- Comments.
INSERT INTO activity_log (
  created_at, actor_user_id, actor_name, actor_role,
  action, entity_type, entity_id, order_item_id, summary, details
)
SELECT
  to_char(c.created_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  c.user_id,
  COALESCE(u.name, u.email, 'Unknown'),
  COALESCE(u.role, 'internal'),
  'order.comment',
  'order',
  c.order_item_id,
  c.order_item_id,
  'Commented on order ' || c.order_item_id || ': ' || left(c.body, 120),
  json_build_object('isInternal', c.is_internal, 'backfilled', true)::text
FROM comments c
LEFT JOIN users u ON u.id = c.user_id
WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action = 'order.comment' AND details LIKE '%"backfilled": true%' AND entity_id = c.order_item_id);

-- Imports.
INSERT INTO activity_log (
  created_at, actor_user_id, actor_name, actor_role,
  action, entity_type, entity_id, summary, details
)
SELECT
  to_char(ci.created_at::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  ci.imported_by,
  COALESCE(u.name, u.email, 'Unknown'),
  COALESCE(u.role, 'internal'),
  'import.run',
  'import',
  ci.id::text,
  'Imported ' || COALESCE(ci.filename, 'a file') || ': ' ||
    COALESCE(ci.success_count, 0) || ' rows applied, ' || COALESCE(ci.error_count, 0) || ' errors',
  json_build_object('successCount', ci.success_count, 'errorCount', ci.error_count, 'backfilled', true)::text
FROM csv_imports ci
LEFT JOIN users u ON u.id = ci.imported_by
WHERE NOT EXISTS (SELECT 1 FROM activity_log WHERE action = 'import.run' AND entity_id = ci.id::text);

COMMIT;


-- ---------------------------------------------------------------------------
-- STEP 3 -- VERIFY.
-- ---------------------------------------------------------------------------
-- Expect: the table present with its four indexes; backfilled counts matching
-- STEP 1; and bad_timestamps 0 -- every created_at in the JS shape, which is
-- what keeps sorting correct once live entries start arriving alongside these.

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'activity_log'
ORDER BY ordinal_position;

SELECT indexname FROM pg_indexes WHERE tablename = 'activity_log' ORDER BY indexname;

SELECT action, count(*) FROM activity_log GROUP BY action ORDER BY action;

-- Must be 0. Anything here sorts against live entries incorrectly.
SELECT count(*) AS bad_timestamps
FROM activity_log
WHERE created_at NOT LIKE '____-__-__T__:__:__.___Z';

SELECT * FROM activity_log ORDER BY created_at DESC, id DESC LIMIT 10;
