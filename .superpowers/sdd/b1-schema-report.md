# B1 unified schema hardening report

- Branch base: `2a2693817a8631bb5be1eb79ed697a1b8ec7ad1d`
- Initial implementation: `3fb8227b091fb79cf69750c0df799181ef43b67b`
- Canonical alignment: `9a46544e244af4273d934f173c21e2e763ce9368`
- Review-remediation code: `863a00b60ac1d66c05f18436274c040610438115`
- Scope: ordered identity/master-data → rates/waybills → warehouse/linehaul schema, Drizzle
  exports, migration snapshot/journal, reversible migration, control-plane capabilities, and
  pre-tenant authentication hardening.
- No frontend, controller, service, generated contract, or reviewed proposal file was modified.

## Review findings resolved

### I1 — Drizzle/live compound-key parity

- Reordered every compound Drizzle foreign key and candidate key to match authoritative SQL
  ordinality, with tenant-first mappings throughout.
- Added six typed raw-only cyclic foreign keys that were absent from Drizzle.
- Regenerated the final `0001_snapshot.json`.
- Added a catalog gate that compares every live compound FK and candidate-key column mapping
  against the Drizzle snapshot. It now covers 197 live foreign keys.

### I2 — Reversible migration and expanded fingerprint

- Added checked-in `migrations/down/0001_b1_domains.down.sql`; it reverses only B1 and never drops
  the public schema or the three foundation tables.
- The integration gate performs real up → down → up, removes only the B1 journal row, verifies the
  foundation remains intact, and requires an identical normalized fingerprint.
- The fingerprint includes columns, constraints, indexes, policies, triggers, function bodies,
  security-definer flags, function settings/ACLs, roles and attributes, memberships, table ACLs,
  RLS/force-RLS flags, and extensions.

### I3 — Aggregate version contract and conflict CAS

- Every API-visible aggregate starts at version `1` in SQL and Drizzle and has a
  `version >= 1` check.
- `device_sync_conflicts` now has its own aggregate version separate from expected/server resource
  versions.
- Conflict resolution advances exactly one version, permits only OPEN → RESOLVED, freezes identity
  and snapshots, and rejects stale jumps or re-resolution.

### I4 — Reference-data immutability

- The item guard locks and validates both OLD and NEW parent versions in deterministic order.
- UPDATE requires both parents to remain DRAFT, so a single statement cannot move and mutate an
  item out of a published version.
- INSERT and DELETE retain parent locking and DRAFT-only mutation.

### I5 — Least-privilege platform control plane

- Added `zhili_control_plane` as NOLOGIN/NOSUPERUSER/NOCREATEROLE/NOBYPASSRLS/NOINHERIT by
  default.
- Added fixed-search-path SECURITY DEFINER capabilities for tenant creation, tenant status CAS, and
  entitlement administration.
- The role receives schema usage and function EXECUTE only, with no direct table privileges.
- Each command verifies the asserted actor through active tenant/user/assignment/role/grant rows,
  honors active DENY grants, supports authorized cross-tenant operations, and uses exact versions.
- Target mutation, actor-tenant idempotency record, audit event, outbox event, and response are one
  transaction. Replays return the stored response; hash mismatch, stale CAS, and unauthorized calls
  roll back without residual writes.

### I6 — Constant-shape pre-tenant authentication

- `auth_lookup_password` always returns exactly one three-column credential row.
- Only one unambiguous ACTIVE tenant + ACTIVE user match returns the real verifier.
- Unknown account, wrong tenant hint, cross-tenant ambiguity, disabled user, and suspended tenant
  all return the same canonical dummy IDs and structurally valid Argon2id verifier.
- `zhili_auth` has EXECUTE only and no direct `users` access; PUBLIC execute is revoked.
- The function comment records the service contract: always perform one Argon2id verification and
  emit the same rate-limited generic failure for every mismatch.

## Strict RED evidence

- I1: snapshot comparison initially reported 191 snapshot FKs versus 197 live FKs plus widespread
  reversed compound mappings.
- I2: the real reversal test failed with `ENOENT` before the checked-in down artifact existed.
- I3/I4: the 10-test focused suite failed three cases: missing conflict aggregate version, default/
  check version drift, and a published→draft simultaneous item move that was accepted.
- I5: the control-plane catalog query returned no capability functions.
- I6: an unknown account returned zero rows instead of the fixed dummy row.

Each failure was recorded before the corresponding production implementation.

## Final GREEN evidence

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
# exit 0; 3 files, 23 tests passed against postgres:17-alpine

pnpm --filter @zhili/db exec vitest run test/b1-schema.integration.test.ts
# exit 0; 1 file, 11 tests passed

git diff --check
# exit 0
```

The migration-chain gate generates no follow-up migration from the final snapshot. The focused B1
suite includes real down/up fingerprint equality, live/snapshot key parity, forced tenant RLS,
cross-tenant FK rejection, immutable history, exact CAS transitions, least-privilege control-plane
commands, atomic replay/negative paths, and constant-shape authentication.
