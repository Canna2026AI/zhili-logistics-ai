# B1 unified schema final implementation report

- Branch base: `2a2693817a8631bb5be1eb79ed697a1b8ec7ad1d`
- Initial schema: `3fb8227b091fb79cf69750c0df799181ef43b67b`
- Canonical alignment: `9a46544e244af4273d934f173c21e2e763ce9368`
- Round-1 hardening: `863a00b60ac1d66c05f18436274c040610438115`
- Round-2 remediation code: `44bb3d382cedcce79f657205cddfe06bc4055279`
- Scope: identity/master-data → rates/waybills → warehouse/linehaul schema, Drizzle source and
  snapshot, ordered migrations, reversible B1 down, cluster prerequisites, platform control-plane
  capabilities, and pre-tenant authentication.
- No frontend, controller, service, generated contract, or reviewed proposal file was modified.

## Canonical schema and migration source

- The migration creates 72 B1 domain tables in addition to three foundation tables.
- Compound-key parity covers 197 foreign keys and 166 unique candidate keys.
- Index parity covers 56 standalone B1 indexes and 164 ordered indexed columns/expressions.
- All 161 explicit Drizzle index opclass annotations were removed. PostgreSQL now selects the
  type-correct default opclass instead of receiving generated mismatches such as
  `timestamptz_ops` for text IDs.
- `0001_snapshot.json` was regenerated from the same TypeScript Drizzle schema.
- A dedicated integration gate starts from `0000_snapshot.json`, generates a brand-new Drizzle
  `0001`, and applies foundation plus the generated migration to PostgreSQL 17. This prevents the
  checked-in raw migration from hiding an invalid Drizzle source.

### Live/snapshot parity catalogs

The parity test explicitly compares:

- `pg_constraint`, `pg_class`, `pg_namespace`, and `pg_attribute` for FK and unique-key
  column ordinality;
- `pg_index`, `pg_class`, `pg_am`, `pg_opclass`, and `pg_attribute` for standalone index
  name, table, access method, uniqueness, ordered columns/expression positions, direction,
  NULL ordering, and effective default/non-default opclass.

Aggregate version defaults and lower-bound checks are separately verified through
`information_schema.columns` and `pg_constraint`.

## Platform authorization boundary

- `role_grants.data_scope_kind` now includes the explicit `PLATFORM` scope in raw SQL, Drizzle,
  and the snapshot.
- Tenant creation and tenant status commands require
  `platform.tenant.manage / ALLOW / ACTIVE / PLATFORM`.
- Entitlement administration requires
  `platform.entitlement.write / ALLOW / ACTIVE / PLATFORM`.
- Active DENY evaluation uses the same action and `PLATFORM` scope.
- ALLOW grants scoped to `SELF`, `TENANT`, `ORGANIZATION`, `CUSTOMER`, or `WAREHOUSE`
  cannot authorize any platform-global command.
- The migration idempotently seeds the two canonical `permission_actions`.
- Audit literals match OpenAPI exactly:
  `platform.tenant.created`, `platform.tenant.status-changed`, and
  `platform.tenant-entitlements.updated`.
- `zhili_control_plane` receives schema usage and function EXECUTE only. It has no tenant, user,
  foundation-event, or entitlement table privileges and never receives BYPASSRLS.

Each command verifies the actor through active tenant, user, assignment, role, and grant rows.
Target mutation, actor-tenant idempotency, audit, outbox, and stored response remain one
transaction.

## Foundation/provisioning ownership

- `zhili_auth`, `zhili_control_plane`, and `btree_gist` are explicit
  `0000_foundation.sql` cluster prerequisites.
- Foundation creates missing prerequisites but never alters a pre-existing auth/control role.
- B1 up no longer creates or rewrites these resources.
- B1 down contains no cluster role, owned-object, or extension removal.
- The rollback regression pre-creates both roles, role-owned schemas/tables, `btree_gist`, and an
  unrelated GiST exclusion constraint. It applies foundation and B1, runs B1 down, and proves role
  attributes, object ownership, extension identity/version/owner/schema, and the dependent
  constraint are unchanged.

## Concurrency, idempotency, and negative coverage

- Device conflict CAS is genuinely concurrent: one transaction updates and deliberately holds the
  row lock while a second connection issues the same version-1 CAS. After commit, exactly one
  contender returns the version-2 row and the other returns no row.
- A wrong version jump and mutation after resolution remain rejected by trigger guards.
- Idempotent replay returns the stored response once without duplicate tenant, audit, or outbox
  rows.
- Reusing the same actor-tenant idempotency key with a different request hash returns SQLSTATE
  `23514`.
- A real active PLATFORM DENY overrides PLATFORM ALLOW and leaves tenant, idempotency, audit, and
  outbox counts at zero.
- Each of the five narrower ALLOW scopes is tested independently and returns SQLSTATE `42501`
  with zero writes.
- Stale tenant CAS and an unassigned actor also return no residual writes.

## Authentication boundary

- `auth_lookup_password` always returns one three-column credential row.
- Only one unambiguous ACTIVE tenant + ACTIVE user match receives the real Argon2id verifier.
- Unknown account, wrong tenant hint, cross-tenant ambiguity, disabled user, and suspended tenant
  receive identical dummy IDs and a structurally valid Argon2id verifier.
- PUBLIC execute is revoked; `zhili_auth` has function EXECUTE only and no direct users-table
  access.
- The database comment records the service contract: perform one Argon2id verification and use the
  same rate-limited generic failure for every mismatch.

## Reversible migration and fingerprint

The checked-in B1 down never drops the public schema and leaves foundation tables and cluster
prerequisites intact. The real up → down → journal-row removal → up gate requires an identical
normalized fingerprint.

The fingerprint includes:

- columns, defaults, generated expressions, constraints, indexes, policies, and triggers;
- function definitions/bodies, SECURITY DEFINER flags, fixed settings, and ACLs;
- selected role attributes and role memberships;
- table ACLs plus RLS/force-RLS flags;
- extensions, versions, owners, and schemas.

## Strict RED evidence

- Compound-key work began with 191 snapshot FKs versus 197 live FKs and reversed tenant mappings.
- The real reversal gate initially failed because no B1 down artifact existed.
- Aggregate/conflict work failed on version-zero drift, missing conflict CAS version, and a
  published→draft item move.
- Control-plane work initially had no capability functions; auth misses initially returned zero
  rows.
- Round 2 fresh generation failed on PostgreSQL 17 with SQLSTATE `42804` because a text provider
  column was emitted with `timestamptz_ops`.
- Round 2 index parity exposed incorrect opclasses across the generated snapshot.
- The canonical permission seed query initially returned no rows.
- The pre-existing-resource rollback initially attempted to remove an unrelated role-owned schema.

Each failure was observed before its corresponding production fix.

## Final GREEN evidence

```sh
pnpm exec prettier --check packages/db/src packages/db/test packages/db/drizzle.config.ts packages/db/vitest.integration.config.ts packages/db/migrations/meta .superpowers/sdd/b1-schema-report.md
# exit 0

pnpm --filter @zhili/db lint
# exit 0

pnpm --filter @zhili/db typecheck
# exit 0

pnpm --filter @zhili/db test
# exit 0; 2 files, 3 tests passed

pnpm --filter @zhili/db test:integration
# exit 0; 4 files, 25 tests passed against postgres:17-alpine

pnpm --filter @zhili/db exec vitest run --config vitest.integration.config.ts test/b1-schema.integration.test.ts
# exit 0; 1 file, 12 tests passed

git diff --check
# exit 0
```

The unit suite includes the no-follow-up Drizzle migration-chain gate. The integration suite
includes the fresh generated migration apply, live/snapshot key and index parity, PostgreSQL 17
down/up fingerprint equality, pre-existing cluster-resource preservation, scoped authorization,
active DENY, idempotency hash mismatch, true concurrent CAS, and constant-shape authentication.
