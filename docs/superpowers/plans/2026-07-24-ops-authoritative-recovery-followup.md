# Ops Authoritative Recovery Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fail closed around import mapping and versioned command receipts, then provide a real authoritative F04 reload-and-retry recovery path.

**Architecture:** Model import validation readiness from explicit authoritative mapping facts rather than the absence of a proposal. Centralize the versioned-mutation receipt invariant so both the production adapter and workbench reject missing, mismatched, or non-advancing resources. Extend the command port with a generated-client-backed load-unit reload that updates the workbench version map before returning F04 to its normal state.

**Tech Stack:** React 19, TypeScript, generated OpenAPI client, Vitest/Testing Library, Playwright, Vite.

## Global Constraints

- Use TDD and observe every regression test fail before changing production code.
- Preserve the batch, user input, and stale state on failed recovery.
- Never infer a new resource version locally.
- Do not merge or push; commit only to the current worktree branch.

---

### Task 1: Fail-closed F10 mapping readiness

**Files:**

- Modify: `packages/features/waybills/src/import/model/import.ts`
- Modify: `packages/features/waybills/src/import/ui/import-workbench.tsx`
- Modify: `packages/features/waybills/src/order/test/order-import.test.tsx`
- Modify: `apps/ops/src/features/orders/orders-workspace.test.tsx`
- Modify: `tests/e2e/ops-integration.spec.ts`

**Interfaces:**

- Produces: `ImportJobRef.mappingStatus?: 'REQUIRED' | 'NOT_REQUIRED' | 'APPLIED'`.
- Validation is available only after an applied proposal/mapping or authoritative `NOT_REQUIRED`.

- [x] **Step 1: Write failing component tests**

Add tests proving a rejected or empty proposal never exposes `校验数据`, while `mappingStatus: 'NOT_REQUIRED'` does.

- [x] **Step 2: Verify RED**

Run the focused Waybills and Ops tests and observe that proposal failure currently exposes validation.

- [x] **Step 3: Implement readiness guard**

Compute validation readiness from `mappingApplied`, local applied state, proposal status `APPLIED`, or job `mappingStatus === 'NOT_REQUIRED'`; render a blocked recovery message otherwise.

- [x] **Step 4: Verify GREEN**

Run the focused tests and add a production Playwright route where batch B proposal returns 500 and validation remains unavailable.

### Task 2: Strict versioned mutation receipts

**Files:**

- Modify: `apps/ops/src/features/fulfillment-finance/fulfillment-command.ts`
- Modify: `apps/ops/src/features/fulfillment-finance/api-command-port.ts`
- Modify: `apps/ops/src/features/fulfillment-finance/api-command-port.test.ts`
- Modify: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.tsx`
- Modify: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.test.tsx`

**Interfaces:**

- Produces: `requiresAuthoritativeResource(command)`.
- Every non-GET command carrying `expectedVersion` requires an exact `resource.id` and a strictly greater integer `resource.version`.

- [x] **Step 1: Write failing receipt tests**

Cover missing resource, wrong resource ID, missing version, non-advancing version, and prove `onResolved`/success/audit are not emitted.

- [x] **Step 2: Verify RED**

Run focused adapter and workbench tests and observe missing/wrong resources are currently accepted.

- [x] **Step 3: Enforce the shared invariant**

Validate authoritative resources before callbacks, audit counting, success feedback, or version-map mutation.

- [x] **Step 4: Verify GREEN**

Update legitimate test receipts with matching advanced resources and run all Ops tests.

### Task 3: F04 authoritative reload and retry

**Files:**

- Modify: `apps/ops/src/features/interaction-states/flow-state-catalog.ts`
- Modify: `apps/ops/src/features/fulfillment-finance/api-command-port.ts`
- Modify: `apps/ops/src/features/fulfillment-finance/api-command-port.test.ts`
- Modify: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.tsx`
- Modify: `apps/ops/src/features/fulfillment-finance/fulfillment-finance-workbench.test.tsx`
- Modify: `tests/e2e/ops-integration.spec.ts`

**Interfaces:**

- Extends: `FulfillmentFinanceCommandPort.reloadResource(entityRef)`.
- The production implementation calls `GET /linehaul/load-units/{loadUnitId}` and returns an exact, positive authoritative resource version plus server evidence.

- [x] **Step 1: Write failing recovery tests**

Assert 412 enters stale, reload failure stays stale, reload success records v8 and returns normal, and the next dispatch sends v8 with a recomputed idempotency key.

- [x] **Step 2: Verify RED**

Run focused workbench/adapter tests and observe no reload action exists.

- [x] **Step 3: Implement reload action**

Add `刷新装载单版本` to stale-load, call the generated-client GET port, validate identity/version, update the authoritative version map only on success, and recover to normal.

- [x] **Step 4: Verify GREEN**

Run focused tests and replace the stale-only production E2E with 412 → GET v8 → dispatch v8 success.

### Task 4: Release gates and commit

**Files:**

- Modify: this plan checklist only.

- [x] **Step 1: Run release verification**

Run related/full tests, lint, typecheck, build, contract tests, isolated 4110 Playwright, targeted format check, and `git diff --check`.

- [x] **Step 2: Review and commit**

Review the complete diff, stage only planned files, commit on the current branch, and keep the worktree intact.
