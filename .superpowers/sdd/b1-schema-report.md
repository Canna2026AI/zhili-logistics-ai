# B1 unified schema implementation report

- Branch base: `2a2693817a8631bb5be1eb79ed697a1b8ec7ad1d`
- Initial implementation commit: `3fb8227b091fb79cf69750c0df799181ef43b67b`
- Canonical-contract addendum commit: `9a46544e244af4273d934f173c21e2e763ce9368`
- Scope: ordered identity/master-data → rates/waybills → warehouse/linehaul schema, Drizzle
  exports, migration snapshot/journal, PostgreSQL 17 integration gates, and root-owned P0 contract
  alignments.
- Reviewed proposal SQL files were consumed unchanged. No frontend, controller, service, generated
  contract, or proposal file was modified.

## RED evidence

Initial implementation command:

```sh
pnpm --filter @zhili/db exec vitest run --config vitest.integration.config.ts test/b1-schema.integration.test.ts
```

Before `0001_b1_domains.sql` existed, this exited `1`: the expected B1 table set was empty, the
`tenants` relation was absent, and the reset/reapply fingerprint could not be produced.

The same focused command was run again after adding the P0 contract tests but before the P0
implementation. It exited `1` with five failures and one pass: only 63 of 72 required B1 domain
tables existed, tenant version defaulted to zero, `tenant_entitlements` was absent, the restricted
authentication capability was absent, and the early table failure prevented the fingerprint.

## Implemented contract

- 72 B1 domain tables, plus the three foundation tables, in one ordered migration.
- Forced tenant RLS and tenant-setting policies on every tenant-owned table.
- Compound tenant foreign keys for representative and newly introduced parent-child boundaries.
- Versioned tenant entitlements, customer credit policies, reference-data sets/versions/items,
  OAuth provider-subject bindings, tenant partners, permission simulations, and impersonation
  sessions.
- Immutable entitlement/credit history and guarded reference-data publication/current-head rules.
- Separate device binding actor and bound subject, canonical dot permission codes, and canonical
  device task types/priorities.
- Tenant states `ACTIVE | SUSPENDED | EXPIRED` and required aggregate versions starting at one.
- Canonical waybill, import, receipt, load-unit, booking, delivery, and sync-conflict states, with
  database transition and mutation guards.
- A least-privilege `zhili_auth` capability that has no direct `users` table access and can execute
  only a fixed-search-path `SECURITY DEFINER` password lookup.

## GREEN evidence

```sh
pnpm exec prettier --check packages/db/src packages/db/test packages/db/drizzle.config.ts packages/db/vitest.integration.config.ts packages/db/migrations/meta
# exit 0

pnpm --filter @zhili/db lint
# exit 0

pnpm --filter @zhili/db typecheck
# exit 0

pnpm --filter @zhili/db test
# exit 0; 2 files, 3 tests passed

pnpm --filter @zhili/db test:integration
# exit 0; 3 files, 19 tests passed against postgres:17-alpine

git diff --check
# exit 0
```

The focused B1 gate passes 7/7 tests. It covers table inventory, forced RLS, compound tenant FKs,
cross-tenant rejection, positive measurements, quote/history immutability, canonical state
transitions, reference publication/current head, the restricted authentication boundary, and an
identical normalized schema fingerprint after up → schema reset/down → up. The migration-chain
test proves Drizzle generates no migration after `0001_b1_domains.sql`.

## Deferred platform boundary

No cross-tenant platform mutation function was added. The current custom-GUC tenant context is
service-controlled; schema alone cannot prove a trusted platform principal, target tenant,
audit record, and idempotency outcome atomically without a new service-facing capability. Granting
`BYPASSRLS` would weaken the boundary. The service implementation must introduce an explicitly
authenticated, audited, idempotent command boundary before platform operators can mutate another
tenant.
