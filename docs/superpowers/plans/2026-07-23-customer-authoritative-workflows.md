# Customer Authoritative Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Customer billing and exception workflows authoritative, reload-safe, data-driven, and covered by the repository Playwright release gate.

**Architecture:** `BillingFlow` and `ExceptionFlow` receive strongly typed selected records instead of owning resource constants. Persisted workflow records use strict versioned schemas containing the logical operation intent and idempotency key; state writes use generation and monotonic-step compare-and-swap. Payment recovery always queries the server before displaying a cached financial state.

**Tech Stack:** React 19, TypeScript, Vitest/Testing Library, Playwright, Vite, localStorage, OpenAPI client.

## Global Constraints

- Follow red-green-refactor for every behavior change.
- Explicit mock mode remains limited to tests and `?mock=1`.
- Do not claim server-side statement/customer verification that is absent from the OpenAPI PaymentOrder response; preserve and validate request correlation locally and document the contract gap.
- Keep the worktree clean and create one final commit after all gates pass.

---

### Task 1: Authoritative billing recovery and monotonic persistence

**Files:**

- Modify: `apps/customer-portal/src/features/customer-workflows.test.tsx`
- Modify: `apps/customer-portal/src/features/billing/billing-flow.tsx`

**Interfaces:**

- Consumes: `customerPort.getPaymentOrder(paymentOrderId)` and `getReceiptAllocation(receiptId)`.
- Produces: strict `BillingSession` schema v2 with `generation`, full payment fields, selected record identity, and operation intents.

- [x] Add tests proving cached pending/partial/conflict stays in RECOVERING until the payment order and, when applicable, allocation snapshot resolve.
- [x] Add tests rejecting mismatched payment amount/currency/purpose and cached statement/customer correlation.
- [x] Add a deferred-response test proving an old PENDING response cannot replace a newer SUCCEEDED/partial session.
- [x] Run `pnpm --filter @zhili/customer-portal test -- customer-workflows.test.tsx` and observe the expected failures.
- [x] Implement strict validators and a generation/monotonic CAS writer; recover payment first, then allocation.
- [x] Re-run the focused tests until green.

### Task 2: Durable logical operation intents

**Files:**

- Modify: `apps/customer-portal/src/features/customer-workflows.test.tsx`
- Modify: `apps/customer-portal/src/features/billing/billing-flow.tsx`
- Modify: `apps/customer-portal/src/api.ts`

**Interfaces:**

- Produces: `{ kind, idempotencyKey, resource }` intents for allocate, refresh, and voucher upload; the resource field is a logical-operation fingerprint, and successful or deterministic 4xx outcomes clear only the matching intent.

- [x] Add reload/remount tests asserting allocate and refresh reuse the stored key.
- [x] Add voucher retry test asserting a reselected identical file resumes the stored key using its name/size/type/lastModified fingerprint.
- [x] Verify the new tests fail because current keys live only in refs.
- [x] Persist strictly validated intents and bind async completion to generation plus intent identity.
- [x] Verify all focused tests pass.

### Task 3: Data-driven F03 with synchronous dedupe

**Files:**

- Modify: `apps/customer-portal/src/features/customer-workflows.test.tsx`
- Modify: `apps/customer-portal/src/features/exceptions/exception-flow.tsx`
- Modify: `apps/customer-portal/src/api.ts`
- Modify: `apps/customer-portal/src/app.tsx`

**Interfaces:**

- Produces: `ExceptionRecord` props and caller-provided idempotency keys for evidence submission and failed-notification retry.

- [x] Add tests selecting each exception record and asserting its own issue ID/details reach the port.
- [x] Add same-tick double-click tests for evidence and notification retry.
- [x] Verify the tests fail with duplicate calls/current fixed ID.
- [x] Add synchronous pending refs, stable operation keys, and make every exception row select a real detail.
- [x] Verify the focused tests pass.

### Task 4: Data-driven billing resources and contract-gap record

**Files:**

- Create: `apps/customer-portal/src/customer-records.ts`
- Modify: `apps/customer-portal/src/app.tsx`
- Modify: `apps/customer-portal/src/features/billing/billing-flow.tsx`
- Modify: `apps/customer-portal/src/api.ts`
- Create: `docs/contracts/customer-payment-authority-gap.md`

**Interfaces:**

- Produces: `CustomerBillingRecord` containing customer, receipt, statement, amount, currency and display metadata; all commands accept values from the selected record.

- [x] Add tests selecting a non-default bill and asserting payment/allocation/voucher calls use that record.
- [x] Verify failures show the fixed constants.
- [x] Move typed fixture records to the app boundary, pass selected values through the flow, and pass current statement to voucher upload.
- [x] Document that OpenAPI PaymentOrder omits statement/customer IDs and the backend response must add them for server-side correlation; frontend validates the request correlation and all response fields currently available.
- [x] Verify focused tests pass.

### Task 5: Root browser release gate

**Files:**

- Modify: `tests/e2e/customer.spec.ts`
- Modify: `apps/customer-portal/e2e/customer-workflows.mjs`
- Modify: `playwright.config.ts`

**Interfaces:**

- Produces: repository-discovered Customer desktop/mobile tests covering the canonical workflow.

- [x] Replace removed payment-dialog selectors with the canonical BillingFlow path.
- [x] Add a route-state test where the first request commits by key but its response is aborted, and replay returns the committed response for the same key.
- [x] Add production-route 409 and 412 allocation assertions.
- [x] Ensure desktop, 390px, and axe checks run under the root Customer project.
- [x] Run the root Customer Playwright project and fix only failures caused by canonical entry changes.

### Task 6: Full verification and commit

**Files:** all modified files above.

- [x] Run Customer and Website unit, lint, typecheck, and build commands.
- [x] Run root Customer, Website desktop/mobile Playwright and axe coverage.
- [x] Run Prettier and `git diff --check`.
- [x] Confirm `git status --short` contains only intended files.
- [x] Commit with `fix(customer-portal): make workflows authoritative and reload safe` and confirm the worktree is clean.
