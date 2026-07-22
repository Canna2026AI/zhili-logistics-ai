# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可冷启动、默认拒绝跨租户访问的 NestJS API、Drizzle/PostgreSQL、Redis/BullMQ、对象存储、事务 Outbox 与可观测性基座。

**Architecture:** `apps/api` 和 `apps/worker` 只做装配；配置、数据库、认证和可观测能力分别放在独立包。OpenAPI 是唯一 HTTP DTO 源，业务工作树只实现生成类型对应的 handler 和 repository；共享迁移由根集成负责人生成。

**Tech Stack:** Node.js 22、pnpm 11、NestJS 11 + Fastify、Drizzle ORM + PostgreSQL 17、Redis 8 + BullMQ、MinIO、Zod、OpenTelemetry、Pino、Vitest、Testcontainers、Docker Compose。

## Global Constraints

- Base path 固定为 `/api/v1`；成功响应为 `{ data, meta }`，错误为 Problem Detail 风格且必须含 `requestId`。
- 所有租户业务表含 `tenant_id`，PostgreSQL RLS 默认拒绝；应用不得使用绕过 RLS 的数据库角色。
- 所有写命令校验 `Idempotency-Key`；版本化命令校验强 ETag `If-Match: "<version>"`。
- 金额使用整数最小货币单位或 PostgreSQL `numeric`，禁止 JavaScript 浮点承担财务计算。
- API、Worker 与外部副作用通过同事务 Outbox；日志禁止记录密码、Cookie、Authorization、密钥、完整手机号和完整地址。
- 共享所有权仅根集成负责人可写 `packages/contracts`、`packages/db/migrations` 与生成文件。

---

## File Structure

```text
apps/api/src/{main,app.module,health.controller}.ts
apps/api/src/platform/{request-context,problem-filter,idempotency,etag}.ts
apps/worker/src/{main,worker.module,outbox.processor}.ts
packages/config/src/{env,index}.ts
packages/observability/src/{logger,tracing,redaction,index}.ts
packages/db/src/{client,transaction,rls,index}.ts
packages/db/src/schema/{platform,outbox,audit,index}.ts
packages/db/migrations/0000_foundation.sql
packages/auth/src/{principal,permission,guard,index}.ts
infra/compose.yaml
infra/docker/{api.Dockerfile,worker.Dockerfile}
infra/postgres/init/00-roles.sql
tests/integration/{health,rls,outbox,idempotency}.test.ts
```

### Task 1: Strict environment configuration and redacted logging

**Files:**

- Create: `packages/config/package.json`, `packages/config/src/env.ts`, `packages/config/src/index.ts`
- Create: `packages/observability/package.json`, `packages/observability/src/redaction.ts`, `packages/observability/src/logger.ts`, `packages/observability/src/index.ts`
- Test: `packages/config/test/env.test.ts`, `packages/observability/test/redaction.test.ts`

**Interfaces:**

- Produces: `loadEnv(source): AppEnv` and `createLogger(options): Logger`.

- [ ] **Step 1: Write failing tests** proving an absent database URL fails startup and secrets/Chinese phone numbers are redacted.

```ts
expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow('DATABASE_URL');
expect(redact({ authorization: 'Bearer secret', phone: '13926548800' })).toEqual({
  authorization: '[REDACTED]',
  phone: '139****8800',
});
```

- [ ] **Step 2: Run RED:** `pnpm --filter @zhili/config test && pnpm --filter @zhili/observability test`; expect both packages to fail because exports do not exist.
- [ ] **Step 3: Implement `AppEnv` with Zod** including `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `SESSION_KEY`, `ENVELOPE_MASTER_KEY`, `PORT`, `LOG_LEVEL` and production-safe defaults only.
- [ ] **Step 4: Implement recursive redaction** for configured key names and phone/address display values; configure Pino serializers to call it before emission.
- [ ] **Step 5: Run GREEN:** package lint/typecheck/test must exit 0.
- [ ] **Step 6: Commit:** `git commit -m "feat: add validated config and redacted logging"`.

### Task 2: PostgreSQL client, tenant transactions, RLS and base schema

**Files:**

- Create: `packages/db/package.json`, `packages/db/drizzle.config.ts`
- Create: `packages/db/src/client.ts`, `packages/db/src/transaction.ts`, `packages/db/src/rls.ts`, `packages/db/src/index.ts`
- Create: `packages/db/src/schema/platform.ts`, `packages/db/src/schema/outbox.ts`, `packages/db/src/schema/audit.ts`, `packages/db/src/schema/index.ts`
- Create: `packages/db/migrations/0000_foundation.sql`
- Test: `packages/db/test/rls.integration.test.ts`, `packages/db/test/outbox.integration.test.ts`

**Interfaces:**

- Produces: `withTenantTransaction(context, work)`, `DbTransaction`, `outboxEvents`, `auditEvents`, `idempotencyRecords`.

```ts
export interface TenantContext {
  tenantId: string;
  subjectId: string;
  requestId: string;
  permissions: readonly string[];
}

export type TenantWork<T> = (tx: DbTransaction) => Promise<T>;
export declare function withTenantTransaction<T>(
  context: TenantContext,
  work: TenantWork<T>
): Promise<T>;
```

- [ ] **Step 1: Write Testcontainers RED tests**: no tenant context returns zero rows; tenant A cannot select/update tenant B; a business insert and Outbox insert roll back together.
- [ ] **Step 2: Run RED:** `pnpm --filter @zhili/db test:integration`; expect missing migration/client failures.
- [ ] **Step 3: Implement base tables** with ULID text IDs, `tenant_id`, UTC timestamps, immutable audit payload, Outbox aggregate/version/dedupe fields and idempotency request hash/response snapshot/expiry.
- [ ] **Step 4: Implement `withTenantTransaction`** using `SET LOCAL app.tenant_id`, `app.subject_id`, `app.request_id`, `app.permissions`; reject empty context before opening work.
- [ ] **Step 5: Add RLS policies** using `current_setting('app.tenant_id', true)` and a non-bypass application role; add triggers preventing audit update/delete.
- [ ] **Step 6: Run GREEN:** integration tests and `drizzle-kit check` exit 0.
- [ ] **Step 7: Commit:** `git commit -m "feat: add tenant database and transactional outbox"`.

### Task 3: Request context, Problem Details, ETag and idempotency pipeline

**Files:**

- Create: `apps/api/package.json`, `apps/api/tsconfig.json`
- Create: `apps/api/src/platform/request-context.ts`, `problem-filter.ts`, `etag.ts`, `idempotency.ts`
- Test: `apps/api/test/platform.test.ts`, `tests/integration/idempotency.test.ts`

**Interfaces:**

- Consumes: `TenantContext`, `idempotencyRecords`, generated OpenAPI parameter names.
- Produces: `RequestContext`, `parseStrongEtag`, `IdempotencyInterceptor`, `ProblemFilter`.

```ts
export function parseStrongEtag(value: string | undefined): number {
  const match = /^"([1-9][0-9]*)"$/.exec(value ?? '');
  if (!match) throw new PreconditionRequiredException('If-Match must be a strong version ETag');
  return Number(match[1]);
}
```

- [ ] **Step 1: Write RED tests** for missing/weak ETag, missing/short idempotency key, same key+same body replay, same key+different body 409, and request ID propagation.
- [ ] **Step 2: Run RED:** `pnpm --filter @zhili/api test -- platform.test.ts`.
- [ ] **Step 3: Implement Fastify request context** from authenticated principal and `x-request-id`; never accept tenant/subject identity directly from body/query.
- [ ] **Step 4: Implement idempotency interceptor** with SHA-256 canonical body hash and stored status/headers/body; concurrent duplicate keys serialize on PostgreSQL advisory lock.
- [ ] **Step 5: Implement error mapping** for 400/401/403/404/409/412/413/422/429/500 with `code`, `detail`, `remediation`, `requestId`; unexpected exceptions log only redacted context.
- [ ] **Step 6: Run GREEN** and commit `git commit -m "feat: enforce request, etag and idempotency semantics"`.

### Task 4: NestJS API composition and OpenAPI coverage guard

**Files:**

- Create: `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/health.controller.ts`
- Create: `apps/api/test/health.e2e.test.ts`, `apps/api/test/openapi-coverage.test.ts`
- Modify: `apps/api/README.md`

**Interfaces:**

- Produces: `/api/v1/health/live`, `/api/v1/health/ready`, `registerFeatureModule(module)`.

- [ ] **Step 1: Write RED tests** requiring liveness without dependencies, readiness to fail when PostgreSQL/Redis/S3 is unavailable, and every implemented route to match an OpenAPI method/path/operationId.
- [ ] **Step 2: Run RED:** `pnpm --filter @zhili/api test:e2e`.
- [ ] **Step 3: Bootstrap Nest Fastify** with body limits, secure headers, Cookie parsing, global validation disabled for handwritten DTOs, global request/filter/interceptor pipeline and graceful shutdown.
- [ ] **Step 4: Implement health probes** with bounded timeouts and per-dependency results; readiness returns 503 on any required dependency failure.
- [ ] **Step 5: Add contract coverage test** reading `zhili.openapi.yaml` and compiled controller metadata; a route without matching contract fails CI.
- [ ] **Step 6: Run GREEN** and commit `git commit -m "feat: compose contract-guarded api service"`.

### Task 5: Worker, Outbox leases, retry and dead-letter behavior

**Files:**

- Create: `apps/worker/package.json`, `apps/worker/src/main.ts`, `apps/worker/src/worker.module.ts`, `apps/worker/src/outbox.processor.ts`
- Test: `apps/worker/test/outbox.processor.test.ts`, `tests/integration/outbox-worker.test.ts`

**Interfaces:**

- Produces: `OutboxPublisher.tick(limit)`, queue names `imports`, `print`, `notifications`, `tracking`, `connectors`, `ai`, `reports`, and `<queue>.dead`.

- [ ] **Step 1: Write RED tests** for two workers claiming no duplicate row, lease expiry recovery, exponential backoff, terminal dead-letter record and trace ID propagation.
- [ ] **Step 2: Run RED:** `pnpm --filter @zhili/worker test`.
- [ ] **Step 3: Implement `FOR UPDATE SKIP LOCKED` claims** with attempt count, lease owner/expiry and publish confirmation in a new transaction.
- [ ] **Step 4: Implement BullMQ defaults** with deterministic job IDs from Outbox IDs, bounded retries and dead-letter metadata that excludes secret payload fields.
- [ ] **Step 5: Run GREEN** and commit `git commit -m "feat: add outbox worker and dead letters"`.

### Task 6: Compose, images and cold-start proof

**Files:**

- Create: `infra/compose.yaml`, `infra/.env.example`
- Create: `infra/docker/api.Dockerfile`, `infra/docker/worker.Dockerfile`
- Create: `infra/postgres/init/00-roles.sql`, `infra/scripts/smoke.sh`
- Modify: `README.md`
- Test: `tests/integration/compose-smoke.test.ts`

- [ ] **Step 1: Write RED smoke test** that starts an empty project, waits for health, writes an object, enqueues and observes one Outbox job, then verifies tenant B cannot read tenant A.
- [ ] **Step 2: Add health-checked services** for PostgreSQL, Redis, MinIO, API and Worker; persist named volumes and bind only development ports.
- [ ] **Step 3: Add non-root multi-stage images**, read-only root filesystem where compatible, dropped Linux capabilities and explicit resource limits.
- [ ] **Step 4: Run:** `docker compose -f infra/compose.yaml down -v && docker compose -f infra/compose.yaml up --build -d`; expect all health checks healthy from empty volumes.
- [ ] **Step 5: Run GREEN:** `pnpm test:compose` and `docker compose ... down -v` exit 0.
- [ ] **Step 6: Commit:** `git commit -m "feat: add reproducible backend compose stack"`.

## Foundation Exit Gate

- [ ] Frozen install, format, lint, typecheck, unit and integration tests pass.
- [ ] Empty-volume Compose cold start and graceful stop pass twice.
- [ ] RLS default-deny, idempotency concurrency, Outbox rollback/retry/dead-letter and log-redaction negative tests pass.
- [ ] Independent review reports 0 Critical and 0 Important before B1 worktrees branch.
