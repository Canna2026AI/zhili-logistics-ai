# B1 Identity and Master Data Proposal Report

## Status

DONE

## Commit

- Original proposal commit: `bbd7f5c29c1bdd85b8922a4dd2fd06f819532143`
- Reviewed implementation commit (including refresh-lineage fix):
  `c7d5f314195f3cd061cb8745f671688b7385235a`

This report is updated in a subsequent report-only commit so it can name the immutable implementation
commit without making an impossible self-referential hash claim. The report-only hash is emitted in
the final handoff.

## Files

- `docs/03-delivery/schema-proposals/backend-identity-masterdata.sql`
- `docs/03-delivery/schema-proposals/verify-backend-identity-masterdata.mjs`
- `.superpowers/sdd/b1-identity-proposal-report.md`

No files under `packages/db`, migrations, generated contracts, services, controllers, or frontends
were modified.

## TDD and Verification

### RED

Command:

```sh
node docs/03-delivery/schema-proposals/verify-backend-identity-masterdata.mjs
```

Expected and observed before implementation: exit 1 with `ENOENT` for the missing
`backend-identity-masterdata.sql` proposal.

During self-review, the verifier was extended to require forced RLS on the `tenants` root. It was
observed failing with exit 1 and `tenant roots must not expose other tenant records` (`0 !== 1`)
before the root policy was added.

The independent-review refresh-lineage regression was then added before its database constraints.
The focused command exited 1 and reported both invalid inserts as accepted:

```text
cross_family_parent: { code: null, rejected: false }
duplicate_successor: { code: null, rejected: false }
```

### GREEN

Executable proposal verification command:

```sh
node docs/03-delivery/schema-proposals/verify-backend-identity-masterdata.mjs
```

Expected and observed result (exit 0):

```text
PASS backend identity/master-data proposal: 21 tables, 20 forced RLS policies; refresh lineage rejects cross-family=23503 duplicate-successor=23505
```

The command starts PostgreSQL 17, executes `0000_foundation.sql` followed by the proposal, checks
catalog constraints and policies, verifies fail-closed/cross-tenant visibility as `zhili_app`, and
proves that cross-family refresh parentage is rejected with foreign-key SQLSTATE `23503` while a
second successor is rejected with unique-violation SQLSTATE `23505`.

Baseline command and result:

```text
pnpm --filter @zhili/db test
Test Files  2 passed (2)
Tests  3 passed (3)
```

## Self-review

- `tenants(id)` is the root and has forced RLS using `id = nullif(current_setting('app.tenant_id',
  true), '')`; all 19 tenant-owned tables have `tenant_id`, `UNIQUE (tenant_id, id)`, forced RLS,
  fail-closed tenant policies, stable IDs, versions, non-negative version checks, and audit timestamps.
- Every proposal foreign key uses explicit `ON UPDATE RESTRICT` and `ON DELETE CASCADE` or
  `ON DELETE RESTRICT`; tenant-owned cross-table references are compound `(tenant_id, id)` keys.
- Passwords use Argon2id verifiers; refresh tokens and device credentials use keyed digests; OAuth
  state uses a digest and PKCE verifier storage is authenticated ciphertext with nonce/key version.
  Refresh rotation uses a family-safe `(tenant_id, family_id, parent_token_id)` foreign key, rejects
  self-parenting, and has a partial unique successor index. Compromised/revoked family states and reuse
  timestamps retain the family-wide revocation relationship.
- Permissions normalize role, action, organization/customer/warehouse scopes, and per-field
  `READ`/`MASK`/`DENY` policies through relational foreign keys rather than JSON-only references.
- Minimal upstream `warehouses`, device binding history, and stable device task queues support
  `bindDevice` and `getDeviceTasks` without taking ownership of fulfillment-domain operational tables.
- Changed-path review found only the three Phase A files listed above.

## Concerns

None within Phase A. Canonical permission-action seed data, Drizzle translation, the ordered B1
migration, and service behavior remain intentionally deferred to the root integration and Task 2
phases.
