# Ops Production Recovery Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make F02, F10 and F04 use authoritative server state, typed recoverable errors, replay-safe commands, truthful evidence, and accessible 390 px interactions.

**Architecture:** Add shared typed API error and command-evidence primitives at the feature boundaries. Keep quote and import UI controlled by the Ops workspace, so only validated server DTOs can advance state; keep logical idempotency intents inside API ports until an authoritative response completes. Treat import batch and AI proposal as separate versioned aggregates, then hydrate the existing import workbench with the mapped batch.

**Tech Stack:** React 19, TypeScript, Vitest/Testing Library, openapi-fetch generated contracts, Playwright Chromium, axe-core, CSS media queries.

## Global Constraints

- Production must never expose demo selectors or a user reset that clears a real error state.
- Mutation success must be derived from an identity-checked authoritative response; malformed success responses fail closed.
- A retry of the same unresolved logical intent reuses its idempotency key.
- OpenAPI YAML and generated TypeScript must remain byte-for-byte generation-consistent.
- Every implementation step follows RED, GREEN, then refactor.

---

### Task 1: Typed production errors and quote authority

**Files:**

- Create: `packages/api-client/src/domain-error.ts`
- Modify: `packages/api-client/src/index.ts`
- Modify: `packages/features/rates-routing/src/quote/model/quote.ts`
- Modify: `packages/features/rates-routing/src/quote/adapters/api/quote-api.ts`
- Modify: `packages/features/rates-routing/src/quote/ui/quote-workbench.tsx`
- Modify: `apps/ops/src/features/orders/index.tsx`
- Test: `packages/features/rates-routing/src/quote/test/quote.test.tsx`
- Test: `apps/ops/src/features/orders/orders-workspace.test.tsx`

**Interfaces:**

- Produces `DomainApiError { status?, code?, remediation?, requestId?, details? }` and `toDomainApiError(error)`.
- Extends quote UI with `onError(error, operation)` and nullable authoritative `snapshot`.
- Quote accept returns a validated authoritative quote snapshot, not a synthesized version.

- [ ] Write tests proving initial production quote is unquoted, malformed quote/accept DTOs fail closed, exact accept replaces the authoritative snapshot, and 410/409/412 select blocking parent states while preserving input.
- [ ] Run targeted Vitest and confirm failures are caused by the missing typed callbacks and nullable snapshot behavior.
- [ ] Implement the shared error type, response identity validation, controlled nullable snapshot, synchronous pending ref, and parent error mapping.
- [ ] Run the same tests to GREEN and refactor duplicated error mapping.

### Task 2: Controlled AI proposal and import aggregate

**Files:**

- Modify: `packages/features/waybills/src/import/model/import.ts`
- Modify: `packages/features/waybills/src/import/adapters/api/import-api.ts`
- Modify: `packages/features/waybills/src/import/ui/import-workbench.tsx`
- Modify: `apps/ops/src/features/orders/index.tsx`
- Test: `packages/features/waybills/src/order/test/order-import.test.tsx`
- Test: `apps/ops/src/features/orders/orders-workspace.test.tsx`

**Interfaces:**

- Adds `AiMappingProposalRef` and `ImportPort.proposeMapping(importId, version)`.
- Changes `applyMapping(importId, importVersion, proposalId, proposalVersion, acceptedMappingIds)`.
- Adds controlled `job`/`onJobChange` and `onError` to `ImportWorkbench`.

- [ ] Write tests proving low-confidence errors carry a legal proposal, candidate selection is server-owned, proposal and batch versions stay distinct, and the mapped batch continues through validate/commit.
- [ ] Write RED tests for identity mismatch, ETag/body authoritative versions, lost-response idempotency-key replay, and synchronous duplicate clicks.
- [ ] Implement proposal retrieval/application, stable intent-key retention, authoritative version parsing, and controlled workbench hydration.
- [ ] Run targeted tests to GREEN and remove hard-coded proposal identities.

### Task 3: F04 truthful command evidence

**Files:**

- Modify: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.tsx`
- Modify: `apps/ops/src/features/fulfillment-finance/api-command-port.ts`
- Test: `apps/ops/src/features/fulfillment-finance/api-command-port.test.ts`
- Test: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.test.tsx`

**Interfaces:**

- Changes command results to discriminated `audit | trace | resource` evidence.
- Uses a contract-valid hold ULID for release approval.

- [ ] Write tests separating explicit audit event IDs from request tracing/resource IDs and asserting the legal ULID path.
- [ ] Run targeted tests to RED.
- [ ] Implement typed evidence extraction/rendering without calling request IDs audits.
- [ ] Run targeted tests to GREEN.

### Task 4: Mobile layout and accessibility

**Files:**

- Modify: `packages/ui/src/styles.css`
- Modify: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.tsx`
- Modify: `packages/features/rates-routing/src/quote/ui/quote-workbench.css`
- Test: `packages/ui/test/app-shell.test.tsx`
- Test: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.test.tsx`

**Interfaces:**

- Every collapsed domain-nav button exposes `aria-label` and `title`.
- At 600 px or below quote form/results stack without a fixed 1180 px canvas.

- [ ] Add component assertions for navigation accessible names and CSS source assertions for the mobile stacked quote layout.
- [ ] Run targeted tests to RED.
- [ ] Implement accessible names, AA primary-button colors, and stacked quote layout.
- [ ] Run Vitest plus Playwright/axe at 390 px to GREEN with no serious/critical violations.

### Task 5: Contract and branch verification

**Files:**

- Modify generated contract only if `pnpm --filter @zhili/contracts generate` requires it.

- [ ] Run all affected tests, repository lint/typecheck/build, Prettier check, Redocly lint, generation comparison and `git diff --check`.
- [ ] Run production Playwright routes for 410, 409/412 and 422 plus desktop and 390 px axe checks.
- [ ] Inspect the complete diff for fixture leakage, fake audit labels and unstable command keys.
- [ ] Commit the verified changes on `codex/frontend-ops-interaction-v2`.
