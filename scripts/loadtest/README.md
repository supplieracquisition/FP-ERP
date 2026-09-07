# 50-agent claim-lock stress test

Harness for the plan in the stress-test runbook. Rehearse the whole thing on
rung-2 — teardown included — before pointing it at production.

## Rehearsal (rung-2)

rung-2 is a database copy, not a deployment, so the app under test is a local
server wired to that copy. Keep the Supabase env vars set: blanking them flips
`localAuthEnabled` on and the app starts expecting `fp_local_user_id` (an integer)
instead of `fp-user-id` (a UUID), which is not the production code path.

```bash
# terminal 1 — the app, against the rung-2 copy
DATABASE_URL='<rung-2 pooler URL>' npm run dev

# terminal 2 — the harness
export LOADTEST_TARGET=rung2
export LOADTEST_BASE_URL=http://localhost:3000
export LOADTEST_DATABASE_URL='<the same rung-2 pooler URL>'

npx tsx scripts/loadtest/seed.ts
npx tsx scripts/loadtest/run.ts 0     # gate — stop here if anything fails
npx tsx scripts/loadtest/run.ts 1     # baseline
npx tsx scripts/loadtest/run.ts 2     # thundering herd
npx tsx scripts/loadtest/run.ts 3     # sustained churn
npx tsx scripts/loadtest/run.ts 4     # bulk all-or-nothing
npx tsx scripts/loadtest/run.ts 5     # read storm
npx tsx scripts/loadtest/run.ts 7     # expiry
npx tsx scripts/loadtest/teardown.ts
```

Phases 1–5 will not reproduce production's lambda fan-out — one local Node
process holds one connection pool, where Vercel holds one per warm instance.
Phase 5 is therefore close to meaningless on rung-2 and is the phase most worth
re-running against prod. Run it here anyway to prove the harness works.

Phase 6 needs real browser sessions; skip it in rehearsal.

## Production

```bash
export LOADTEST_TARGET=prod
export LOADTEST_CONFIRM=yes-production
export LOADTEST_BASE_URL='https://<prod host>'
export LOADTEST_DATABASE_URL='<prod pooler URL, port 6543>'
```

Same sequence. Low-traffic window.

## Safety

Three independent brakes, all in `lib.ts`:

- **Budget** — `LOADTEST_BUDGET` (default 25000) requests, then hard stop.
- **Breaker** — aborts if more than 10 of the last 100 requests are 5xx.
- **Kill switch** — `touch ~/.fp-erp-loadtest/STOP` ends the run within one request.

And two structural guards:

- The manifest is bound to a **database fingerprint**. A manifest seeded on
  rung-2 will not load against prod. This matters because `order_items.id` is a
  bare integer: the same id means an unrelated real order in the other database,
  and the assign-items allowlist is built from those ids. Without this guard the
  thing meant to bound the blast radius becomes a list of real orders to
  permanently assign.
- The 50 agents are POC of nothing, so `orderScope()` fails them closed to the
  unassigned pool. They cannot see or touch any order that already has a
  supplier. Do not assign `suppliers.poc_user_id` to any of them.

## Two things that will bite

**The manifest holds 50 working credentials.** An `auth_id` is a complete session
via the `fp-user-id` fallback. It lives at `~/.fp-erp-loadtest/manifest.<target>.json`,
mode 0600, deliberately outside the repo. Never copy it in. Teardown deletes it.

**This pollutes the Stage 6 evidence gate.** Stage 6 retires `fp-user-id` on the
evidence that logs show nothing resolving through it. A full run emits tens of
thousands of `[auth-path] fp-user-id` lines. Seed and teardown both print the
window — record it, or a later reader takes the spike for real users still on the
fallback and defers Stage 6 for nothing.

## Not committed

Nothing here is tracked. If you do commit the harness, commit `*.ts` and this
file only — never anything from `~/.fp-erp-loadtest/`.
