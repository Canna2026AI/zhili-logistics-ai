# Backend B2 and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成财务支付、轨迹客服通知、开放集成自动化 AI 报表，并通过恢复、性能、安全、外部沙箱和发布门槛。

**Architecture:** 三个 B2 工作树消费 B1 公开端口和 Outbox 事件。所有外部连接器采用签名、限流、重试、对账和死信统一端口；AI 只返回建议或进入显式审批，不直接绕过领域权限与事务。

**Tech Stack:** Backend Foundation、BullMQ、Stripe-style webhook semantics for internal abstraction、WeChat Pay v3 adapter、OpenAI/火山/通义/DeepSeek adapters、Prometheus/OpenTelemetry、k6、Trivy、OWASP ZAP。

## Global Constraints

- 分支：`codex/backend-finance`、`codex/backend-tracking-support`、`codex/backend-integrations-ai`。
- 财务金额使用 `numeric`/整数最小单位和显式币种；任何核销、退款、反审核、期间重开都写不可变审计。
- Webhook 验证时间戳、签名、事件 ID、版本和重放窗口后才入事务。
- AI 输入先按调用者字段策略过滤；输出包含 provider/model/promptVersion/evidence/confidence/policyDecision，关键写入必须审批。
- P0 外部连接器只在官方沙箱/测试环境可验证时标 VERIFIED；缺凭据必须标 BLOCKED_EXTERNAL，不得伪造通过。

---

### Task 1: Finance schema merge and ledger invariants

**Files:**

- Create: `packages/db/src/schema/finance.ts`, `packages/db/migrations/0002_finance.sql`
- Create: `packages/features/finance/src/backend/{ledger,charges,statements,payments,periods,repository}.ts`
- Test: `packages/features/finance/src/backend/test/{ledger,charges,payments,periods}.test.ts`

**Interfaces:**

- Produces FIN-01..10, PAY-01..04 and LM-06 handlers.

```ts
export interface Money {
  currency: string;
  minor: bigint;
}

export interface AllocationCommand {
  sourceId: string;
  targetId: string;
  amount: Money;
  expectedSourceVersion: number;
  idempotencyKey: string;
}
```

- [ ] **Step 1: Write property RED tests**: debit=credit, allocations never exceed source/target, reversal restores balances exactly, statement lines sum to total, FX rounding residue is explicit, closed period rejects writes.
- [ ] **Step 2: Write payment RED tests** for callback before browser return, duplicate callback, timeout where provider succeeded, direct statement allocation snapshot, prepayment to unapplied cash, partial refund and reconciliation exception.
- [ ] **Step 3: Merge reviewed finance schema** with charges, ledger entries, statements/versions, cash, allocations/reversals, payment orders/events/refunds, FX sets, periods and invoices; add tenant RLS and immutable ledger triggers.
- [ ] **Step 4: Implement services/controllers and WeChat Pay abstraction**; provider callbacks store raw encrypted evidence reference, never log plaintext secrets.
- [ ] **Step 5: Run property/module/Compose tests** and commit `git commit -m "feat: implement finance and payment backend"`.

### Task 2: Tracking, issues, claims, notifications and reports

**Files:**

- Create: `packages/db/src/schema/tracking-support.ts`
- Create: `packages/features/tracking-support/src/backend/{tracking,issues,claims,notifications}.ts`
- Create: `packages/features/reports/src/{query-service,worker,index}.ts`
- Create: `apps/api/src/modules/support/*`, `apps/worker/src/processors/{notifications,reports}.ts`
- Test: domain and worker tests under matching `test/` folders.

- [ ] **Step 1: Write RED tests** for event ID/source dedupe, occurredAt vs receivedAt ordering, milestone projection, stall threshold, issue visibility, SLA escalation, claim settlement and notification retry/dead-letter.
- [ ] **Step 2: Write report RED tests** reconciling business/finance totals to source versions and rejecting unrestricted cross-tenant filters.
- [ ] **Step 3: Merge schema and implement services**; projections update through idempotent Outbox consumers and retain source timestamps.
- [ ] **Step 4: Implement enterprise WeChat/email/webhook notification ports** with templates, locale, unsubscribe/policy and redacted delivery logs.
- [ ] **Step 5: Run tests** and commit `git commit -m "feat: implement tracking support notifications and reports"`.

### Task 3: Public API, webhooks and P0 connectors

**Files:**

- Create: `packages/db/src/schema/integrations.ts`
- Create: `packages/features/integrations/src/{api-clients,webhooks,connector-port,reconciliation}.ts`
- Create: `packages/features/integrations/src/connectors/{ups,dhl,amazon-sp-api,wecom,wechat-pay}.ts`
- Create: `apps/api/src/modules/integrations/*`, `apps/worker/src/processors/connectors.ts`
- Test: connector contract and sandbox tests.

```ts
export interface ConnectorPort<Input, Output> {
  validateConfiguration(): Promise<void>;
  execute(input: Input, context: { idempotencyKey: string; traceId: string }): Promise<Output>;
  reconcile(cursor?: string): AsyncIterable<ReconciliationItem>;
}
```

- [ ] **Step 1: Write RED security tests** for API scopes, IP policy, rate limits, secret rotation overlap, HMAC timestamp/replay and webhook dead-letter replay authorization.
- [ ] **Step 2: Write connector RED contract tests** for UPS/DHL labels+tracking, Amazon SP-API authorization/rate backoff/FBA sync, WeCom message token refresh and WeChat Pay callback/query reconciliation.
- [ ] **Step 3: Merge encrypted configuration schema** and implement envelope encryption with key IDs and rotation; plaintext secrets exist only inside the adapter call scope.
- [ ] **Step 4: Implement connectors with bounded retries** and timeout-then-query/reconcile behavior; never retry non-idempotent requests without provider idempotency support.
- [ ] **Step 5: Run local contract sandboxes and available official sandboxes**; write exact BLOCKED_EXTERNAL entries for unavailable credentials.
- [ ] **Step 6: Commit:** `git commit -m "feat: implement public api webhooks and connectors"`.

### Task 4: Automation and governed AI gateway

**Files:**

- Create: `packages/features/automation/src/{dsl,simulator,executor,approval}.ts`
- Create: `packages/features/ai/src/{gateway,policy,prompt-registry}.ts`
- Create: `packages/features/ai/src/providers/{openai,volcengine,qwen,deepseek}.ts`
- Create: `apps/api/src/modules/automation-ai/*`, `apps/worker/src/processors/{automation,ai}.ts`
- Test: policy, prompt version, injection and rollback tests.

- [ ] **Step 1: Write RED DSL tests** for deterministic trigger matching, dry-run diff, action permission, recursion limit, dedupe and rollback eligibility.
- [ ] **Step 2: Write RED AI tests** for field-policy filtering, prompt injection corpus, provider timeout/fallback, evidence/confidence, cost limit, approval threshold and immutable prompt/model version.
- [ ] **Step 3: Implement provider-neutral gateway** returning structured outputs validated by Zod; disallow model-produced operation names outside the registered allowlist.
- [ ] **Step 4: Implement automation simulation/publish/execution**; critical actions create approval records and resume only from an authenticated approval command.
- [ ] **Step 5: Run adversarial and policy tests** and commit `git commit -m "feat: add governed automation and ai gateway"`.

### Task 5: Observability, backup and restore

**Files:**

- Create: `infra/monitoring/{prometheus.yml,otel-collector.yaml,alerts.yml}`
- Create: `infra/scripts/{backup,restore,restore-drill}.sh`
- Create: `docs/03-delivery/evidence/recovery.md`
- Test: `tests/integration/telemetry.test.ts`, `tests/integration/restore.test.ts`

- [ ] **Step 1: Write RED telemetry tests** linking browser request → API transaction → Outbox → Worker/connector spans without secret attributes.
- [ ] **Step 2: Add RED restore drill**: create multi-tenant fixture, take PostgreSQL/Object Store backup, destroy volumes, restore, compare row/object/audit hashes and resume unprocessed Outbox exactly once.
- [ ] **Step 3: Implement metrics/alerts** for API latency/errors, DB pool, queue lag/dead letters, sync conflicts, payment reconciliation and connector failures.
- [ ] **Step 4: Implement encrypted backup and documented retention**; restore refuses a backup whose manifest/hash/key ID is invalid.
- [ ] **Step 5: Run two fresh restore drills** and commit `git commit -m "feat: add observability backup and recovery"`.

### Task 6: Performance, security and release gate

**Files:**

- Create: `tests/performance/{queries,scans,imports}.js`
- Create: `tests/security/{authorization,zap-baseline,secrets}.test.ts`
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`, `docs/03-delivery/evidence/release-v1.md`

- [ ] **Step 1: Seed performance data** for 100 tenants, one tenant with 1,000,000 waybills, 300 online sessions and warehouse scans.
- [ ] **Step 2: Run k6 gates**: normal queries p95 <500 ms, scan confirmation p95 <250 ms at 100 scans/s, no duplicate receipts, error rate <1%.
- [ ] **Step 3: Run security gates**: tenant/role/field negative matrix, OWASP ZAP, dependency/license audit, Trivy image/filesystem scan, secret scan and log inspection.
- [ ] **Step 4: Run complete release matrix**: frozen install, contract generation/lint, format/lint/typecheck, unit/property/integration, five-end Mock-off Playwright/axe/visual, Compose cold start, restore, performance and available official sandboxes.
- [ ] **Step 5: Reconcile all feature-traceability rows** to `VERIFIED`, `PARTIAL` or `BLOCKED_EXTERNAL` with direct evidence; no row remains silently `PLANNED`.
- [ ] **Step 6: Build and sign API/Worker images**, publish GHCR and create `v1.0.0` only after GitHub Actions passes on `main`.
- [ ] **Step 7: Commit:** `git commit -m "release: prepare verified v1.0.0"`.

## Release Exit Gate

- [ ] Independent reviews of all B2 branches and final integration report 0 Critical and 0 Important.
- [ ] Compose cold start, backup restore, performance, security, license and Mock-off five-end E2E pass.
- [ ] External adapters have official sandbox evidence or explicit `BLOCKED_EXTERNAL`; no simulated result is labeled production success.
- [ ] GitHub `main` CI and signed `v1.0.0` artifacts are available to the team.
