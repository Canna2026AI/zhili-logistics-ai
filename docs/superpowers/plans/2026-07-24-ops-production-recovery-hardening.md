# Ops Production Recovery Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four production correctness gaps found in commit `9164576`: import-batch isolation, quote acceptance guards, fulfillment version recovery, and payload-bound idempotency.

**Architecture:** Keep authoritative workflow state in the existing controlled workspaces. Add small pure helpers for quote acceptance and fulfillment intent/version handling so boundary invariants are unit-testable, then drive UI recovery from typed domain errors. Production E2E verifies the generated-client path and responsive layouts.

**Tech Stack:** React 19, TypeScript, Vitest/Testing Library, Playwright, generated OpenAPI client, Vite.

## Global Constraints

- Use TDD for every behavior change and observe each regression test fail before production edits.
- Do not merge or push; commit only on the current worktree branch.
- Preserve production server authority and never fabricate resource versions or audit evidence.
- Same logical mutation payload must reuse an idempotency key; different normalized payloads must not collide.

---

### Task 1: Import batch isolation

**Files:**

- Modify: `apps/ops/src/features/orders/orders-workspace.test.tsx`
- Modify: `apps/ops/src/features/orders/index.tsx`
- Modify: `packages/features/waybills/src/import/ui/import-workbench.tsx`

**Interfaces:**

- Consumes: controlled `job`, `proposal`, and `mappingApplied` props.
- Produces: `onBatchCreated(job)` callback that atomically replaces the current batch state and clears proposal, receipt, and mapping-applied state.

- [x] **Step 1: Write the failing regression**

Add a test that completes low-confidence manual mapping for batch A, creates batch B, and asserts batch B exposes its mapping controls instead of `校验数据`.

- [x] **Step 2: Verify RED**

Run `pnpm --filter @zhili/ops test -- orders-workspace.test.tsx` and confirm batch B incorrectly skips mapping.

- [x] **Step 3: Implement the minimum reset**

Notify the parent when a create command returns, then reset all batch-scoped parent state before publishing batch B and its proposal.

- [x] **Step 4: Verify GREEN**

Run the focused Ops and Waybills tests and confirm both pass.

### Task 2: Authoritative quote acceptance guard

**Files:**

- Modify: `packages/features/rates-routing/src/quote/test/quote.test.tsx`
- Modify: `packages/features/rates-routing/src/quote/model/quote.ts`
- Modify: `packages/features/rates-routing/src/quote/adapters/api/quote-api.ts`
- Modify: `packages/features/rates-routing/src/quote/ui/quote-workbench.tsx`
- Modify: `tests/e2e/ops-integration.spec.ts`

**Interfaces:**

- Produces: `isQuoteAcceptable(quote, now?)` and an adapter boundary that rejects invalid authoritative snapshots.

- [x] **Step 1: Write failing tests**

Cover `EXPIRED`, past `validUntil`, and no available option at the adapter/UI boundaries; assert unavailable options are never selected as fallback.

- [x] **Step 2: Verify RED**

Run the focused rate-routing tests and confirm each invalid snapshot currently remains acceptable.

- [x] **Step 3: Implement the minimum guard**

Reject invalid server snapshots with typed domain errors, select only available options, and hide/disable accept and submit when the snapshot is not acceptable.

- [x] **Step 4: Verify GREEN**

Run the focused rate-routing tests and update production E2E dates to future-stable values.

### Task 3: Fulfillment version progression and stale recovery

**Files:**

- Modify: `apps/ops/src/features/fulfillment-finance/api-command-port.test.ts`
- Modify: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.test.tsx`
- Modify: `apps/ops/src/features/fulfillment-finance/api-command-port.ts`
- Modify: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.tsx`

**Interfaces:**

- `FulfillmentFinanceCommandResult` returns an authoritative `resource` with `id` and `version` when the response mutates a versioned resource.
- The workbench maintains a resource-version map keyed by entity reference.
- Typed 412 errors set the F04 stale-load recovery state.

- [x] **Step 1: Write failing tests**

Assert two sequential receipt commands use v7 then authoritative v8, malformed/non-advancing response versions fail closed, and a generated-client 412 enters stale recovery without changing local state.

- [x] **Step 2: Verify RED**

Run focused Ops tests and confirm version remains v7 and 412 is generic.

- [x] **Step 3: Implement version evidence and recovery**

Parse typed domain errors, require a strictly advancing version for versioned mutation responses, update the local resource-version map only after success, and route 412 to `stale-load`.

- [x] **Step 4: Verify GREEN**

Run focused API-port and workbench tests.

### Task 4: Payload-bound idempotency

**Files:**

- Modify: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.test.tsx`
- Modify: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.tsx`
- Create: `apps/ops/src/features/fulfillment-finance/fulfillment-command.ts`

**Interfaces:**

- Produces: stable canonical serialization and a deterministic intent key derived from operation, entity, version, and normalized payload.

- [x] **Step 1: Write failing tests**

Assert equal payloads with different object key order reuse a key, while distinct routes or file lists produce different keys.

- [x] **Step 2: Verify RED**

Run the focused workbench tests and confirm payload variants collide.

- [x] **Step 3: Implement canonical intent hashing**

Recursively sort object keys, preserve array order, encode the canonical payload into a deterministic browser-safe digest, and append it to the key.

- [x] **Step 4: Verify GREEN**

Run focused workbench tests and update exact command assertions.

### Task 5: Responsive and production verification

**Files:**

- Modify: `tests/e2e/ops-integration.spec.ts`
- Modify as required: Ops/feature responsive styles.

- [x] **Step 1: Add 390px assertions**

Exercise quote, F10 import, and F04 linehaul at 390px; assert one-column computed layouts, no document overflow, and zero serious/critical axe violations.

- [x] **Step 2: Run production Playwright**

Run `pnpm exec playwright test --config tests/e2e/ops-production.playwright.config.ts` and fix only failures caused by the required behaviors.

- [x] **Step 3: Run all release gates**

Run focused tests, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm --filter @zhili/contracts test`, `pnpm --filter @zhili/ops build`, and `git diff --check`.

- [x] **Step 4: Commit**

Stage only the planned files and create one descriptive commit on the current branch. Do not merge or push.
