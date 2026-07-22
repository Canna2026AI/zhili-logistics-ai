# B1 Warehouse Proposal Report

- Status: `DONE`
- Proposal snapshot commit: `6db792f933b4aa6b1096695cea6eb2a946632415`
- Review-remediation commit: reported in the parent handoff after this report is committed.

## Exact files

- `.superpowers/sdd/verify-b1-warehouse-proposal.mjs`
- `.superpowers/sdd/b1-warehouse-proposal-report.md`
- `docs/03-delivery/schema-proposals/backend-warehouse-linehaul.sql`

## Verification

- Focused executable PostgreSQL 17 command:
  `node .superpowers/sdd/verify-b1-warehouse-proposal.mjs`
  - It starts disposable `postgres:17-alpine`, applies `0000_foundation.sql`, exact upstream key-surface stubs and this proposal with `ON_ERROR_STOP=1`, then checks catalog and behavior contracts.
- Semantic RED, after adding the executable replay assertion and before changing SQL:
  - Exit code: `1`.
  - Output: `ERROR: device events must use the next ordered local sequence` from `guard_device_event_session()` while replaying the same event.
- Semantic GREEN, same command after the SQL fix:
  - Exit code: `0`.
  - Expected and observed output: `PASS: PostgreSQL 17 warehouse proposal (21 RLS tables; replay, POD, pairing, state and seal races verified)`.
- The GREEN harness proves:
  - Catalog-level ENABLE/FORCE RLS, foundation policy expression and explicit FK delete actions for all 21 tenant tables.
  - Stable scan replay returns the original scan ID with `DUPLICATE`; stable device replay returns the original receipt/server version with `DUPLICATE`.
  - Direct `SEALED` and `DISPATCHED` inserts are rejected.
  - Seal versus insert, delete and old-to-new parent move are serialized; all three manifest mutations lose the race and are rejected.
  - POD version 2 can supersede same-record version 1, while cross-record and skipped-version links are rejected.
  - Contradictory package/waybill inventory and load items, and contradictory customer/address delivery tasks, are rejected.
  - Tenant `t1` sees its scan and tenant `t2` sees zero scans.
- Baseline: `pnpm --filter @zhili/db test`
  - Output: `2 passed` files, `3 passed` tests.
- Hygiene: `git diff --check`
  - Expected output: none; exit code `0`.

## Self-review

- Scope contains proposal/report/verifier only; no database package, migration, generated contract, service, controller, frontend, or sibling proposal was changed.
- Dependencies are comments plus foreign keys to the fixed upstream tables; upstream tables are not redefined.
- All 21 owned tables carry `tenant_id`, `(tenant_id, id)` uniqueness, forced RLS, foundation-style `app.tenant_id` policies, stable `(tenant_id, created_at, id)` cursor indexes, and explicit delete behavior.
- Load units can only be inserted as `DRAFT` version zero. Item mutations lock parents in deterministic order and check both OLD and NEW parents on moves, closing the sealed-manifest race.
- POD history uses a tenant-safe composite self-FK that binds version N to same-record version N-1; immutable triggers and the deferred head FK remain in force.
- Proposal-local guards validate package-to-waybill and address-to-customer facts against the authoritative upstream rows on insert/update.
- Device sequence enforcement now lets an already-processed sequence reach the unique event key, enabling `ON CONFLICT` replay to return the original durable result without advancing the session.

## Concerns

- None.
