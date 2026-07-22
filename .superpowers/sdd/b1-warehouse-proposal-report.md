# B1 Warehouse Proposal Report

- Status: `DONE`
- Proposal snapshot commit: `6db792f933b4aa6b1096695cea6eb2a946632415`
- Final amended commit: reported in the parent handoff; a Git commit cannot embed its own content-addressed hash.

## Exact files

- `.superpowers/sdd/verify-b1-warehouse-proposal.mjs`
- `.superpowers/sdd/b1-warehouse-proposal-report.md`
- `docs/03-delivery/schema-proposals/backend-warehouse-linehaul.sql`

## Verification

- RED: `node .superpowers/sdd/verify-b1-warehouse-proposal.mjs`
  - Output before the SQL existed: `FAIL: proposal is missing: .../backend-warehouse-linehaul.sql`
- Focused executable proposal verification command:
  `node .superpowers/sdd/verify-b1-warehouse-proposal.mjs`
  - Expected and observed output: `PASS: warehouse proposal contract (21 tenant tables, RLS/constraints/guards verified)`
- PostgreSQL 17 execution harness: applied `0000_foundation.sql`, the completed identity proposal, the completed rates/waybills proposal, then this proposal under `psql -v ON_ERROR_STOP=1`.
  - Output: `21/21 RLS tables`; exit code `0`.
- PostgreSQL behavior harness:
  - Duplicate scan rejected by tenant/device/event uniqueness.
  - Stale receipt undo rejected with SQLSTATE `40001`.
  - Negative inventory rejected by a database check.
  - Load-item mutation after sealing rejected with SQLSTATE `55000`.
  - POD version update rejected with SQLSTATE `55000`.
  - Expired-session event persisted only as `REJECTED`; out-of-order local sequence rejected with SQLSTATE `40001`.
  - RLS observation for the same scan: tenant `t1` count `1`, tenant `t2` count `0`; session sequence remained `1` after rejected out-of-order insert.
- Baseline: `pnpm --filter @zhili/db test`
  - Output: `2 passed` files, `3 passed` tests.
- Hygiene: `git diff --check`
  - Expected output: none; exit code `0`.

## Self-review

- Scope contains proposal/report/verifier only; no database package, migration, generated contract, service, controller, frontend, or sibling proposal was changed.
- Dependencies are comments plus foreign keys to the fixed upstream tables; upstream tables are not redefined.
- All 21 owned tables carry `tenant_id`, `(tenant_id, id)` uniqueness, forced RLS, foundation-style `app.tenant_id` policies, stable `(tenant_id, created_at, id)` cursor indexes, and explicit delete behavior.
- Database guards cover receipt undo/version, inventory non-negativity and ledger immutability, load seal/dispatch and item locks, deferred immutable POD heads, ordered device sequences/session expiry, per-event dispositions, media claims, conflict resolution, and print dedupe.

## Concerns

- None.
