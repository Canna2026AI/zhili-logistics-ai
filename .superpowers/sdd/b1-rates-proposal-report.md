# B1 Rates, Orders and Waybills Schema Proposal Report

Status: DONE

Commit: `HEAD` in `codex/backend-rates-waybills`; the exact immutable hash is reported in the handoff
after this report is included in that commit.

## Exact files

- `docs/03-delivery/schema-proposals/backend-rates-waybills.sql`
- `docs/03-delivery/schema-proposals/verify-backend-rates-waybills.sh`
- `.superpowers/sdd/b1-rates-proposal-report.md`

## TDD and verification evidence

1. RED: `docs/03-delivery/schema-proposals/verify-backend-rates-waybills.sh`
   exited 1 with `proposal contract: FAIL: missing backend-rates-waybills.sql`.
2. GREEN: after implementing the proposal, the same command printed
   `proposal contract: PASS`.
3. RED: the contract was extended to require persisted per-item order batch outcomes and exited 1
   with `proposal contract: FAIL: missing table order_batch_jobs`.
4. GREEN: after adding `order_batch_jobs` and `order_batch_items`, the command printed
   `proposal contract: PASS`.
5. RED: a wildcard routing rule fixture exposed an incorrect PostgreSQL regular expression and
   exited 3 with a `rate_rules_destination_check` violation.
6. GREEN: after using the literal-star character class, the command printed
   `proposal contract: PASS`.

Executable proposal verification command:

```sh
docs/03-delivery/schema-proposals/verify-backend-rates-waybills.sh
```

Expected result:

```text
proposal contract: PASS
```

The verifier starts a disposable PostgreSQL 17 container, applies `0000_foundation.sql`, creates
only the three declared identity/master-data key surfaces, executes the proposal, checks every
tenant table for forced RLS and `UNIQUE (tenant_id, id)`, rejects non-compound cross-table foreign
keys, exercises tenant isolation, rejects overlapping same-priority rate rules, and proves quote
explanation/acceptance immutability.

Additional checks:

```text
git diff --check
exit 0

sh -n docs/03-delivery/schema-proposals/verify-backend-rates-waybills.sh
exit 0
```

## Self-review

- Scope is limited to the SQL proposal, its focused verifier, and this report. No database package,
  migration, generated contract, service, controller, frontend, or sibling proposal was changed.
- The proposal declares but does not redefine `tenants(id)`, `customers(tenant_id,id)`, and
  `customer_addresses(tenant_id,id)`.
- All 21 tenant-owned tables carry `tenant_id`, tenant-safe keys, explicit foreign-key actions,
  enabled/forced RLS using `current_setting('app.tenant_id', true)`, checks, and stable cursor indexes.
- Monetary values use `bigint` minor units with ISO-style currency checks. Weight and dimensional
  values use positive integer grams/millimetres.
- Rate versions persist validity windows. GiST exclusion constraints reject overlapping published
  windows and overlapping same-priority rule scopes/weight ranges.
- Quote versions, parcels, options, charge lines, explanations, and acceptances are trigger-immutable.
  Acceptance also checks `valid_until`, the accepted pointers, and total equals the sum of charge
  lines; the accepted explanation remains a stored JSON snapshot rather than a recomputation.
- Quotes, orders, waybills, order batches, and imports persist tenant-scoped idempotency/external
  numbers. Batch items and import rows store actual per-item outcomes. Import rows retain the exact
  created order/waybill keys and rollback disposition, while rollback jobs are deduplicated.

## Concerns

- The proposal is intentionally ordered after the not-yet-merged identity/master-data proposal.
  The executable verifier uses only a key-surface stub for those fixed upstream relations; root
  integration must preserve the declared proposal order.
- `btree_gist` is a standard PostgreSQL extension and is verified in PostgreSQL 17, but the unified
  migration must run with a database owner allowed to install it.
