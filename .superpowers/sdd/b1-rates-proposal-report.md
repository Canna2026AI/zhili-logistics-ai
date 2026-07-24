# B1 Rates, Orders and Waybills Schema Proposal Report

Status: DONE

Implementation snapshot commit (SQL and verifier):
`d21197f031ba5cfec8f17f97e229584d2bb28de0`.

This report is intentionally committed as the immediate descendant of that named implementation
snapshot, avoiding an impossible self-reference to the report commit's own hash. The final report
commit is provided in the handoff.

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
7. RED: a wildcard BASE rule and concrete BASE rule with the same priority and overlapping weights
   exited 3 with `wildcard and concrete rules tied at the same priority`.
8. GREEN: semantic scope intersection plus a transaction advisory lock rejects the wildcard tie;
   two concurrent inserts prove the concrete transaction commits and the overlapping wildcard
   transaction fails with `rate rule priority tie after wildcard expansion`.
9. RED: a quote head accepted another quote's version/option and exited 3 with
   `quote accepted a version and option owned by another quote`.
10. GREEN: composite quote/version/option ownership foreign keys reject that update. A concurrent
    acceptance/head-pointer test proves acceptance commits, the pointer update fails with
    `accepted quotes are immutable`, and the final head joins exactly to its acceptance.
11. RED: an import row with `commit_status = FAILED` and `rollback_status = ROLLED_BACK` exited 3
    with `a failed import row claimed a successful rollback`.
12. GREEN: rollback shape checks and rollback-job validation accept an applied-row rollback while
    rejecting failed-row rollback, duplicate rollback, and rollback-of-rollback fixtures.
13. RED: with the exclusive-boundary fix temporarily reverted, the boundary fixture exited 3 with
    `quote was accepted at the exclusive valid_until boundary`.
14. GREEN: restoring `accepted_at >= valid_until` rejection returned
    `proposal contract: PASS`; an unavailable option is also rejected.

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
explanation/acceptance immutability. Focused fixtures additionally exercise wildcard-vs-concrete
semantic overlap under concurrent inserts, cross-quote ownership, concurrent acceptance/head
updates, the exact `valid_until` boundary, unavailable options, and import rollback result shapes.

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
  windows and identical same-priority rule scopes/weight ranges. A transaction-locking semantic
  trigger rejects same-priority intersections created by wildcard channel/service/country/package
  dimensions, including concurrent insertions.
- Quote versions, parcels, options, charge lines, explanations, and acceptances are trigger-immutable.
  Composite keys bind each accepted version and option to the owning quote. Acceptance takes a row
  update lock on the quote head, requires an `OFFERED` option, rejects the exclusive `valid_until`
  instant, and checks total equals the sum of charge lines; the accepted explanation remains a
  stored JSON snapshot rather than a recomputation.
- Quotes, orders, waybills, order batches, and imports persist tenant-scoped idempotency/external
  numbers. Batch items and import rows store actual per-item outcomes. Import rows retain the exact
  created order/waybill keys and rollback disposition. Only applied rows can carry rollback
  outcomes; rollback jobs lock and validate a committed same-type original, are deduplicated, and
  cannot target another rollback job.

## Concerns

- The proposal is intentionally ordered after the not-yet-merged identity/master-data proposal.
  The executable verifier uses only a key-surface stub for those fixed upstream relations; root
  integration must preserve the declared proposal order.
- `btree_gist` is a standard PostgreSQL extension and is verified in PostgreSQL 17, but the unified
  migration must run with a database owner allowed to install it.
