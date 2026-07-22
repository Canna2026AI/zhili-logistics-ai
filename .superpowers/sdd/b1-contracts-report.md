# B1 Contract Hardening Report

## Status

DONE for the contract-hardening scope. Database migrations, repositories, services, controllers and
visual form work were intentionally not modified by this branch.

## Commits

- Review base: `a769e39`
- Immutable implementation commit: `7a7c8f858db95d3ccd96278e04f074b3fba8099a`
- This report is committed separately so it can name the immutable implementation commit.

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

### GREEN

The following fresh gates passed after implementation:

```text
pnpm --filter @zhili/contracts lint
OpenAPI valid; 0 errors and 0 warnings

pnpm contracts:generate:check
generated api.d.ts matches the staged OpenAPI source

pnpm --filter @zhili/contracts test
22/22 tests passed

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

Focused affected-module verification also passed: identity/master data 11/11, rates/routing 20/20,
waybills 43/43, customer portal 33/33, PDA 137/137, platform 17/17, website 11/11 and mocks 6/6.
Platform tests still print pre-existing React `act(...)` warnings while passing.

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

## Scope guard

No database schema, migration, backend service, backend controller or visual layout file was changed.
The frontend changes are typed adapter compatibility and safety behavior required by the hardened
contracts.
