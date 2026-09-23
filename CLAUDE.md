@AGENTS.md


## In progress
- Pulling fabric details per style (New Exclusives sheet) and supplier details per style (FPE Database sheet) into the ERP.
- Not finished yet.
## Fabric/supplier sync — WORKING
- Endpoint: POST /api/po-builder/sync-fabric-data
- Syncs MTO sheet + HJA Content sheet → fabric_details, fabric_colors, fpe_suppliers tables
- Both CSV parsers use header-mapping + relax_column_count (handle the sheets' quirks)
- To re-sync after updating a sheet: re-run the curl (paths in po builder data/)
- Gotcha: if code changes seem ignored, a stale dev server may be holding port 3000.
  Ctrl+C only kills the terminal you press it in — check for zombies, kill the PID.

  ## Auth rebuild status
- Stage 1 COMPLETE: promote-self deleted, product-library routes protected,
  n8n import locked behind API key. All verified in production. n8n key
  "Order Import Key 2" confirmed working (lastUsedAt populated).
- Stage 2 IN PROGRESS: commits 1-2 pushed to branch auth-stage2-prep
  (proxy rename + auth-mode separation). Postgres 17 tools installed.
  Copy Supabase project created (ref kfpwqumvhksintnqtrga). Rung-2 db copy
  setup underway. NEXT: finish db copy, verify authId UUIDs survived,
  then commits 3-6 (the real session rebuild) — plan-first, small steps.
- Vercel still needs SUPABASE_SERVICE_ROLE_KEY for Stage 5.
- Local dev now off production DB (DATABASE_URL commented in .env.local).

## Auth rebuild — Stage 2 status (stopped mid-stage)
- Commits 1-4 PUSHED to branch auth-stage2-prep, all verified.
  4 (auth() prefers Supabase session) validated via /api/notifications
  isolation test: 200 for BOTH admin and supplier with fp-user-id deleted.
- Commit 5 (a2a5670) WRITTEN + curl-verified, HELD LOCALLY, NOT PUSHED.
  Teaches proxy to accept either session + adds session refresh.
- NEXT SESSION, in order:
  1. Run browser tests A/B/C/D against the rung-2 copy. HARD RELOAD every
     time (Cmd+Shift+R) — soft reload gave a false pass last time.
     A=admin Supabase-only, B=fallback, C=supplier, D=impersonation.
  2. If all pass → push a2a5670.
  3. (Optional) refresh test: lower JWT expiry in PROD Supabase auth, idle,
     hard reload, stay logged in, cookies change — then SET EXPIRY BACK.
  4. Commit 6 (telemetry) closes Stage 2.
- rung-2 setup LIVE: .env.local data=copy (kfpwqumvhksintnqtrga),
  auth=prod Supabase. Test user test@freshprints.com KEEP until testing
  done, then DELETE from prod Supabase auth.
- Gotchas this session: zombie server→SQLite, stale .next→phantom syntax
  error, proxy gate confounds page-level auth tests (isolate via /api/*),
  soft reload = false pass (always hard reload for browser auth tests).
- Still open: SUPABASE_SERVICE_ROLE_KEY in Vercel (Stage 5).

## Auth rebuild — COMPLETE & LIVE
- Stage 2 shipped to production (merge f6964ea). Real Supabase sessions
  confirmed live via [auth-path] supabase log line. fp-user-id kept as
  fallback — nothing load-bearing on new path removed yet.
- NEXT auth work: Stage 3 (stop exempting /api/* from the proxy gate,
  ship log-only first) → Stage 6 (retire fp-user-id; only 1 user, so this
  is "log in once, confirm no fp-user-id resolutions" not a waiting period).
- Local dev back on SQLite (.env.local DATABASE_URL commented).
- ⚠️ fp-erp.db (real data: 4 users/19 suppliers/120 orders) was committed to
  the PUBLIC repo. .gitignore + untracking now DONE (see EXPOSURE INVENTORY
  below) — the HISTORY SCRUB is still outstanding. Flag to Lizzie.
  Do NOT `git add -A` — would publish fresh data.
- Deferred: SUPABASE_SERVICE_ROLE_KEY in Vercel (for Stage 5). Anon key is
  legacy JWT format, not publishable — both work, standardize later.

  ## Uploads — CONFIRMED broken on Vercel (deferred fix)
- Tested in production 2026-08-20: admin photo upload → failed (Vercel
  filesystem is read-only, as suspected). Uploads do NOT persist in prod.
- NOT urgent: no suppliers yet, zero image rows, feature unused in prod.
- FIX (before real suppliers upload test prints): move storage to Supabase
  Storage. The auth check + /api/orders/[id]/images/[imageId] URL scheme
  DON'T change — only the read/write inside that route swaps. Contained work.
- Security fix (images behind auth) is deployed and works regardless.

## Test accounts in production
- Supplier login [the throwaway email you used] — INTENTIONAL, kept for
  testing supplier-side access (permissions, supplier view, uploads).
  Not a real supplier. Delete when supplier-side testing is done.

  ## Status as of [today]

DONE & LIVE IN PRODUCTION:
- Stage 1: all security holes closed (admin backdoor, product-library routes,
  n8n import locked behind API key).
- Stage 2: real Supabase sessions — full rebuild, verified via [auth-path]
  supabase log. fp-user-id kept as fallback.
- Data-exposure batch: order routes scoped (supplier sees only own orders),
  PATCH field allowlist, images moved behind auth, uploads out of public/,
  DELETE-all locked to admin. All deployed.
- Phase 2: Add Supplier with all 6 fields + working invite-by-email login.
  First real supplier account created and tested end-to-end. LIVE.

NEXT (tomorrow): Phase 4 team-member order scoping.
- Build base + PERMANENT reassignment: scope orders by suppliers.pocUserId
  (internal user sees only their POC'd suppliers' orders; admin sees all +
  can reassign POC). Enforce server-side. FAIL CLOSED (no POC = no orders,
  never all). Prompt is ready.
- THEN separate follow-up: TEMPORARY coverage (cover someone's suppliers for
  a period without permanent reassignment). New concept — needs design pass
  (cover a person vs. suppliers? auto-expire vs. manual?). Get Raghav's input.

DEFERRED / OUTSTANDING:
- Supabase Storage for uploads (uploads confirmed broken on Vercel — read-only
  FS). Waiting on Raghav's infra input. Note: Supabase Storage has a free tier
  (~1GB) so may not need payment — confirm with him.
- Stage 3 (stop exempting /api/* from proxy gate) + Stage 6 (retire fp-user-id,
  just needs "log in once, confirm no fp-user-id resolutions" — 1 user).
- Remaining PRD: Phase 3 (account views) + Phase 5 (POC response-time metric).

KEPT INTENTIONALLY:
- Test supplier login [the throwaway email] — kept for testing supplier-side
  access. Not a real supplier. Delete when done testing.

⚠️ LIZZIE CONVERSATION (important, not started):
- fp-erp.db (real data: 4 users/19 suppliers/120 orders) is committed to the
  PUBLIC repo and still in git history. Two order images too. Needs .gitignore
  + history scrub. Frame: found it, here's scope, fixing it. Also fold in the
  data-exposure fixes shipped + the storage decision.
- NEVER git add -A — would publish fresh DB data.

## EXPOSURE INVENTORY (for Lizzie / history scrub) — THREE files, not one:
- fp-erp.db (4 real users incl personal Gmails, 19 suppliers, 120 orders)
- fp-erp.db.bak (2 users, 14 suppliers, 100 orders)
- fp-erp.db.backup-before-migration (2 users, 14 suppliers, 100 orders)

UNTRACKING IS DONE for all three (a0dafab, 2026-08-24). All three are now in
.gitignore by name — the two backups needed naming explicitly because neither
matches `*.db` (one ends .bak, the other -before-migration), so extension
patterns skip them and so does any audit that scans by extension. Local files
were left untouched (`git rm --cached` only).

⚠️ THE HISTORY SCRUB IS STILL OUTSTANDING. Untracking only stops the exposure
GROWING — every byte already committed is still in history and still public.
Do not let "we untracked them" be mistaken for "we fixed it". Still the Lizzie
conversation, still covers ALL THREE.

Related gap, unfixed: the sidecar patterns are `*.db-wal` / `*.db-shm`, which
do NOT match `fp-erp.db.bak-wal`. Any sqlite3 read of a backup recreates those
files untracked and unignored. Widen the patterns or keep deleting them.

## Also today (post-firefight):
- Prod recovered from password-rotation outage. DB password rotated, new
  pooler string set via CLI. LESSON: rotate DB pw → ALWAYS update Vercel
  DATABASE_URL (pooler host, port 6543, postgres.<ref> user) → redeploy.
  Direct host (db.<ref>.supabase.co) is IPv6-only, Vercel can't reach it.
- Password SupplierACQ2026 was exposed in transcript — already rotated past it.
- Phase 3 BOTH account views deployed (merge 9c2d664). Supplier + team views live.
- Stage 3 IS enforcing (CLAUDE.md was stale saying "ship log-only next").

## UNTESTED against real Supabase (verify before real users rely on them):
- Team-user password change (signInWithPassword→updateUser) — live but untested.
  FIRST TEST: sign in, change own password, hard reload, confirm still signed in.
- Supplier Group-B-field 403 with a live supplier session.

## ORDER PROCESSOR / CLAIM LOCK — SHIPPED 2026-08-24 (4 deploys, all pushed)

Two separate roles, don't conflate them:
- `suppliers.poc_user_id` = the HANDLER of a supplier (Phase 4, pre-existing).
- `order_items.processor_user_id` = the PROCESSOR of one order: whoever builds
  its PO. Per-order, anyone internal, INDEPENDENT of who is POC. Recorded
  permanently once the PO is built.

Never call the processor concept "nominate". `nominated_supplier_id` already
exists and means a SUPPLIER (a suggestion of who should make it), not a person.

Lifecycle: Available (`supplier_id IS NULL`, no live claim) → Claimed (greyed
+ un-draggable to others) → PO built (leaves the pool, processor permanent)
OR abandoned (24h expiry / self-release / admin release → back to Available).

Commits: 21d05e4 schema+DDL · 2928941 the collapse · a0dafab untracking ·
cd6bcb2 endpoints · e3de415 UI.

### The one file that matters: lib/claims.ts
`IN_POOL`, `claimable()`, `heldBy()`, `allClaimable()`, `claimIsActive()`.
Every consumer imports from here. "Unassigned" used to be spelled three
different ways (list route, permissions.ts, Kanban) and they had drifted.

### Invariants — breaking any of these silently breaks the lock
- The claim is ONE conditional `UPDATE ... WHERE ... RETURNING`. Never split it
  into a SELECT that checks and an UPDATE that writes: both racers pass the
  SELECT. Use `.returning()`, never a row count — count semantics differ
  between the postgres-js and better-sqlite3 drivers.
- `claimed_at` is ALWAYS written from JS as `toISOString()`. Never give it a
  `now()`/`CURRENT_TIMESTAMP` default: expiry is a string comparison, and
  Postgres `now()` renders "2026-08-24 12:00:00+00" while toISOString renders
  "2026-08-24T12:00:00.000Z". Space (0x20) sorts before "T" (0x54), so a column
  holding both formats makes every stale claim read as fresh — the lock stops
  expiring with nothing visibly broken.
- Expiry is ON READ. There is NO cron. A missed job can't leave an order stuck.
- `claimActive` is computed server-side and sent down. Don't re-derive it from
  `claimed_at` in the browser; the client clock isn't the one the write is
  judged against.
- Kanban drag-disable is `useDraggable({ disabled })`, NOT CSS. Greying alone
  still lets dnd-kit run the drag and PATCH the column, and the server accepts
  it — pool orders are reachable by every internal user, so there is no second
  line of defence. (`pointer-events:none` would also kill the admin's release
  button on the same card.)
- `PATCH /api/orders/[id]` REFUSES `supplierId` (400). Assignment happens only
  via assign-items, which holds the guard. Don't "helpfully" re-add the field.

### Gotcha: no transactions in the shared-dialect paths
`db.transaction(async …)` is UNSUPPORTED on better-sqlite3 — it throws
"Transaction function cannot return a promise" and the body never runs. Code
written that way works in prod (Postgres) and silently fails in local dev.
`allClaimable()` gets all-or-nothing from a count-guard subquery inside the
same statement instead. Verified: a rival who can reach 2 of 3 orders writes 0.

### ⚠️ Admin reassignment endpoint has NO UI
`PATCH /api/orders/[id]/supplier` (admin-only, reassigns an ALREADY-assigned
order, refuses pooled ones, writes history, never rewrites processor_user_id)
is built and tested by curl — but nothing in the app calls it. The OrderDetail
manufacturer dropdown is read-only now. If anyone needs to change a
manufacturer they currently cannot do it from the UI. Wire a button, or accept
it's an API-only operation.

### Local testing recipe (how the 33 checks were run)
- Dev auth stub: `NEXT_PUBLIC_SUPABASE_URL="" NEXT_PUBLIC_SUPABASE_ANON_KEY=""
  NEXT_PUBLIC_ALLOW_DEV_AUTH_STUB=1 npx next dev`. Blanking the Supabase vars
  is what enables it (Next won't override values already in process.env).
  Then curl with `-H "Cookie: fp_local_user_id=<id>"` — no login needed.
- Browser tests: `npm install --no-save playwright-core` + `chromium.launch({
  channel: "chrome" })` — no browser download, package.json untouched. Remove
  after.
- ⚠️ RESTORING fp-erp.db: STOP the dev server and `rm fp-erp.db-wal
  fp-erp.db-shm` FIRST. Copying the .db alone while the server holds it open
  gives an inconsistent snapshot — a restore looked like it worked and didn't.
- Any concurrency test needs DISTINCT user ids. Re-claiming your OWN order
  correctly returns 200 (idempotent refresh), which reads as a second winner.

### Not yet verified in production
The Deploy 2 checks were never run against prod: `PATCH {"supplierId": null}`
→ expect 400 (use null, NOT a real id — under old code a real id would assign
the order for real and the new code then refuses to undo it); supplier sees no
pool rows; zero-POC internal user sees the widened pool. All 33 local checks
passed but nothing here has been exercised against real Supabase.

## To get Khalid & Richard testing:
- Confirm internal-user creation makes REAL logins (not just db rows — the old
  supplier flow had that bug). [was going to check — still pending]
- Create their accounts → they can log in & navigate.
- For real ORDER testing they need POC assignments (else fail-closed = only
  unassigned pool visible). POCs = rollout/Lizzie decision.