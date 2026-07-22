# B1 Contract Hardening Report

## Status

DONE for the contract-hardening scope, including the first independent review remediation and the
R2 I1 / I2 / M1 remediation. Database migrations, repositories, services, controllers and visual
form work were intentionally not modified by this branch.

## Commits

- Review base: `a769e39`
- Immutable implementation commit: `7a7c8f858db95d3ccd96278e04f074b3fba8099a`
- Independent review evidence commit: `bd8a1589b13f2270fbdcd906ad880d8542938868`
- Review remediation commit: `578782160e64db524341188429206d2cca26223a`
- Review remediation report commit: `a38e5be4fc766532bf38f4a5c2db68e9ba0065c3`
- R2 remediation implementation commit: `598d7d9d818d4e2fb8a8a52f54b1d7ecdb4ce68d`
- This report is committed separately so it can name both immutable implementation commits.

## Independent review remediation

- ORD-08 batch requests now carry one `{waybillId, expectedVersion}` per input and return one ordered
  authoritative outcome per input. Split and merge return explicit lineage with every aggregate
  version and do not expose an ambiguous global ETag.
- Shipment/load validation returns failed rules, warnings and alternatives. Rate rules now encode
  scope, weight range, calculation-specific values, measurement/rounding, effective dates, priority
  and status.
- Seven upsert families now use closed CREATE/UPDATE unions with explicit discriminator mappings.
  The machine-readable `x-upsert-precondition` boundary is covered by semantic tests and documented
  in `b1-upsert-precondition-boundary.md`.
- Accepted-quote linkage carries `acceptedQuoteVersion`, returns quote/link/order/waybill versions,
  documents the order ETag, and declares scoped 404 and 410 outcomes.
- Nine workbench list families now publish real filters, signed filter-bound cursors, immutable order
  tuples, snapshot metadata and `CURSOR_FILTER_MISMATCH` behavior.
- Waybill PII is transported as four closed secured projection objects. READ contains raw and
  display values, MASK contains only a server-masked display value, and DENY contains no value and
  fixes copy/export capabilities to false. The adapter consumes display values only and never
  retains or reconstructs raw PII.
- Rate, order, waybill and platform adapters no longer invent IDs, statuses, timestamps, currencies
  or committed versions. They collect required caller inputs, propagate current ETags and fail closed
  on incomplete responses. Order submission now has an authoritative `submitOrder` contract.
- Customer quote linkage and platform mutation mocks derive each strong ETag from the same
  authoritative resource version returned in the response body, including non-default input
  versions. Stateless shipment and load validation operations no longer advertise stale-version
  responses that callers cannot remediate.

## Delivered contract surface

- Replaced the B1 identity, rates, waybill, warehouse, linehaul and last-mile command placeholders
  with 41 closed, operation-specific request schemas with required business fields.
- Split WeChat OAuth start and callback contracts, kept the verifier server-side, and made
  reauthentication explicitly password- or challenge-based.
- Made field-policy preview non-mutating and specified safe create/update preconditions for master
  data and rate upserts: CREATE forbids `If-Match`; UPDATE requires the latest strong ETag.
- Added the formal atomic `linkAcceptedQuoteToOrder` operation, returning the authoritative order and
  waybill identities and versions. The customer portal no longer calls the private
  `/portal/order-quote-links` endpoint.
- Added stable cursor list and detail reads for quotes, orders, waybills, imports, warehouse receipts,
  load units, bookings, last-mile intakes and delivery tasks; PDA task reads now accept a cursor.
- Expanded the waybill projection to the operational fields already consumed by the workbench and
  changed B1 stale-write semantics to `412 PreconditionFailed` with response ETags.
- Regenerated TypeScript contracts and adapted affected identity, rates, waybill, portal, PDA,
  platform, website and mock clients to use the explicit DTOs.

## TDD evidence

### RED

The contract-coverage tests were written first and the focused command failed as expected:

```sh
pnpm --filter @zhili/contracts test -- --run packages/contracts/test/contract-coverage.test.ts
```

Observed before implementation: 9 failed and 13 passed. Failures covered missing explicit request
schemas, OAuth/reauth separation, preview semantics, upsert preconditions, quote-to-order linkage,
cursor workbench reads, waybill detail fields and ETag/412 behavior.

Independent review tests were also added before remediation:

- Contract semantics: 7 failed / 22 passed, one failure for each I1–I7 gap.
- Waybill/order adapters: 5 failed / 42 passed, covering field decisions, ordered batch outcomes and
  removal of submit/copy/label/renumber/split/merge fallbacks.
- Rates: 2 failed / 19 passed; customer portal: 1 failed / 32 passed; platform: 2 failed / 16 passed.

R2 tests were likewise written and observed failing before the implementation:

- Contracts: 3 failed / 31 total, covering machine-invalid denied raw data, contradictory DENY
  capabilities, closed secured projections and stateless validation responses.
- Waybills: 2 failed / 47 total, covering secured projection consumption and exact MASK/DENY output.
- Customer portal: 1 failed / 34 total; platform: 1 failed / 19 total; mocks: 2 failed / 6 total,
  covering non-default authoritative ETags and canonical secured projection payloads.

### GREEN

The following fresh gates passed after implementation:

```text
pnpm --filter @zhili/contracts lint
OpenAPI valid; 0 errors and 0 warnings

pnpm contracts:generate:check
generated api.d.ts matches the staged OpenAPI source

pnpm --filter @zhili/contracts test
31/31 tests passed

pnpm format:check
all files matched Prettier formatting

pnpm lint
24/24 package lint tasks passed; Markdown lint 0 errors

pnpm typecheck
24/24 package typecheck tasks passed

pnpm test
35/35 repository test tasks passed

pnpm build
20/20 build tasks passed

git diff --check
passed
```

Focused affected-module verification also passed: identity/master data 11/11, rates/routing 21/21,
waybills 47/47, customer portal 34/34, PDA 137/137, platform 19/19, website 11/11 and mocks 6/6.
The repository-wide gates passed with 24/24 lint tasks, 24/24 typecheck tasks, 35/35 test tasks and
20/20 build tasks. Platform tests still print pre-existing React `act(...)` warnings while passing;
Storybook also prints its pre-existing large-chunk advisory while building successfully.

## Remaining integration blockers

1. This branch defines and consumes the contracts but does not add the corresponding database tables,
   migrations, repositories, application services or HTTP controllers. Runtime Mock-off completion
   still requires those layers to implement the new operation IDs, strong ETags, 412 envelopes,
   cursor ordering and idempotent atomic quote/order/waybill linkage.
2. Identity/control-plane runtime work must keep OAuth verifier material encrypted and server-only,
   implement challenge issuance/verification, and enforce tenant/data-scope authorization. Returning a
   raw verifier to any frontend remains forbidden by the contract.
3. The current customer address visual form only collects a display name, while the hardened contract
   requires structured country, locality, address line, contact name and phone fields. Because visual
   UI work was out of scope, the adapter now fails closed for the legacy string-only input rather than
   inventing address data. The UI form must be expanded before real address creation can succeed.
4. Canonical status enums and address snapshot persistence must be aligned with the eventual SQL
   migration before the contract branch is merged with the database/service worktrees.
5. The seven upsert controller implementations must enforce the documented CREATE/UPDATE
   `id`/`If-Match` matrix atomically. The contract and boundary document are complete, but controllers
   remain intentionally outside this branch.

## Scope guard

No database schema, migration, backend service, backend controller or visual layout file was changed.
The frontend changes are typed adapter compatibility and safety behavior required by the hardened
contracts.
