# Task 4 Report: Contract-Guarded NestJS API Composition

## Scope and Revision

- Required base: `9eab3d055eca741380abf7173235684831fe015f`
- Verified starting HEAD: `9eab3d055eca741380abf7173235684831fe015f`
- Head branch: `codex/backend-foundation`
- Final Task 4 HEAD: the commit containing this report; its non-self-referential hash is recorded in the controller handoff after commit.
- Scope: Task 4 only. No contract source, migration, generated API, frontend application, or Task 5 worker code was changed.

## TDD Evidence

### Initial loadable RED

After installing only the required Nest/Fastify test and runtime dependencies, real tests were written before implementation. Explicit `Not implemented` interface stubs made the suites load without providing behavior.

```text
pnpm --filter @zhili/api test:e2e

Test Files  2 failed (2)
Tests       6 failed | 1 passed | 9 skipped (16)
```

The health suite reached real Nest module construction and failed at `registerFeatureModule`. The coverage suite reached actual decorated controller classes and failed at `collectControllerOperations`. These were the intended missing Task 4 behaviors rather than import, syntax, or fake `ExecutionContext` failures.

Problem-contract RED was recorded separately after adding the required ErrorEnvelope assertions:

```text
pnpm --filter @zhili/api test -- platform.test.ts

platform.test.ts: 13 failed, 35 passed
combined selected run: 19 failed, 36 passed
```

All 13 Problem failures showed that real mapped responses lacked the OpenAPI-required `message` and `details` fields.

### Integration-driven RED

The first real Nest + Fastify GREEN attempt deliberately kept strong byte-level replay and stable 413 assertions:

```text
pnpm --filter @zhili/api test:e2e

Test Files  1 failed | 1 passed
Tests       2 failed | 14 passed (16)
```

The exact failures were:

- PostgreSQL JSONB canonicalized cached Problem key order, so the replay bytes differed from the first deterministic 409 response.
- Fastify's default 413 text escaped instead of the stable safe Problem text.

The implementation was corrected without weakening either assertion. A further test-first boundary pass then proved that automatic compiled-controller discovery and authenticated Redis probing were still absent:

```text
pnpm --filter @zhili/api test:e2e

Test Files  2 failed (2)
Tests       2 failed | 15 passed (17)
```

The failures were `Not implemented: collectApplicationOperations` and `Unexpected Redis readiness response` from a real ACL-style TCP Redis fixture. The collector was implemented through Nest `DiscoveryService`, and Redis readiness gained `AUTH` followed by `PING`, abort handling, TLS support, and socket cleanup.

Updating Problem responses also produced the expected Task 3 integration RED before its assertion was aligned to the existing OpenAPI contract:

```text
pnpm --filter @zhili/api test:integration

Test Files  1 failed (1)
Tests       1 failed | 20 passed (21)
```

The sole difference was the newly required `message` and `details` fields in the deterministic 409 snapshot; no Task 3 behavior was relaxed.

### Targeted GREEN

```text
pnpm --filter @zhili/api test
# 2 files passed; 55 tests passed

pnpm --filter @zhili/api test:e2e
# 2 files passed; 17 tests passed

pnpm --filter @zhili/api test:integration
# 1 file passed; 21 tests passed
```

The e2e suite uses Nest 11 `TestingModule`, `NestFastifyApplication`, Fastify injection, PostgreSQL 17 Testcontainers, the real migrations and application role, real global providers, real TCP/HTTP protocol fixtures, and actual `app.close()` lifecycle behavior. It does not use hand-built Nest `ExecutionContext` doubles.

## Implemented Behavior

### Secure bootstrap and deterministic composition

- Added `main.ts`, `app.module.ts`, and practical `dev`, `start`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, and integration scripts.
- Strict `loadEnv()` validation happens before Nest application creation and again through the application provider boundary.
- Fastify uses an explicit 1 MiB body limit, `@fastify/helmet`, `@fastify/cookie`, the global `/api/v1` prefix, and Nest shutdown hooks.
- No handwritten DTO validation pipe is installed.
- `registerFeatureModule(module)` returns a deterministic DynamicModule without a global mutable feature registry.
- Application shutdown drains the shared PostgreSQL client; readiness TCP connections and aborted HTTP probes are bounded and released.

### Real global pipeline

Global providers are registered in this order:

1. `AuthenticatedPrincipalGuard`
2. `PermissionGuard`
3. `RequestContextInterceptor`
4. `IdempotencyInterceptor`
5. `ProblemFilter`

Real lifecycle coverage proves public health bypass, protected reads, trusted identity that ignores body/query identity fields, fail-closed commands, explicit skipped public mutation, cookie parsing, deterministic 409 replay, unknown generic 500 behavior, 413 mapping, request-ID propagation, secure headers, and shutdown.

### Health probes

- Liveness never invokes dependency probes.
- Readiness checks PostgreSQL, Redis, and MinIO-compatible object storage concurrently.
- Every probe has a bounded timeout and returns only safe `up`/`down`, integer latency, and generic failure/timeout detail.
- Any unavailable dependency produces HTTP 503; all-up produces HTTP 200.
- Tests prove concurrency, a permanently hanging probe timeout, credentials/URL non-disclosure, a real PostgreSQL query, Redis ACL authentication plus PING, and the object-storage health path.

### OpenAPI and three-state idempotency guard

- Added `@ContractOperation(operationId)` and metadata collectors for compiled controllers.
- `collectApplicationOperations` enumerates the actual Nest application through `DiscoveryService`.
- Coverage combines the OpenAPI server prefix, global `/api/v1` prefix, controller path, HTTP method path, route method, and operationId.
- Uncontracted paths, missing methods, and operationId mismatches fail.
- Every implemented `POST`/`PUT`/`PATCH`/`DELETE` must explicitly declare `@IdempotentCommand()` or `@SkipIdempotency()`.
- Metadata `true` must match an OpenAPI operation declaring `Idempotency-Key`; metadata `false` must match one without it. Both mismatch directions and the unclassified case have negative tests.
- Runtime idempotency remains fail-closed. Deterministic cached Problems now use PostgreSQL JSONB-stable ordering so the first wire response and replay are byte-identical.

### Problem compatibility

- Error bodies retain Task 3 `code`, `detail`, `remediation`, and `requestId`.
- They now also emit OpenAPI-required `message` and `details`; `message` and `detail` intentionally share the same safe text.
- Safe structured error details are preserved, framework-default 413 text is normalized, and final 500 responses remain generic.
- Unknown/final 500 logging remains allowlisted and redacted.

## Fresh Final Verification

```text
pnpm install --frozen-lockfile
# Already up to date; exit 0

pnpm lint
# 23 successful / 23; markdownlint 0 errors

pnpm typecheck
# 23 successful / 23

pnpm test
# 32 successful / 32; @zhili/api 55 tests passed

pnpm --filter @zhili/db test:integration
# 2 files passed; 12 tests passed

pnpm --filter @zhili/api test:integration
# 1 file passed; 21 tests passed

pnpm --filter @zhili/api test:e2e
# 2 files passed; 17 tests passed

pnpm --filter @zhili/api build
# exit 0

pnpm contracts:generate:check
# OpenAPI generation completed and generated diff check exited 0

pnpm exec prettier --check <all Task 4 changed files>
# All matched files use Prettier code style

git diff --check
# exit 0
```

## Self-Review and Concerns

- Scope review found no changes to `packages/contracts`, `packages/db/migrations`, generated sources, frontend applications, or Task 5.
- No known Critical or Important correctness/security issue remains in Task 4 behavior covered here.
- Object-storage readiness intentionally targets MinIO's `/minio/health/ready`, matching the foundation plan. A future non-MinIO S3 provider will need a provider-specific signed readiness adapter rather than exposing raw endpoint failures.
- Coverage is automatic for every controller present in the composed Nest module supplied to the guard. Future feature modules must include that composed application coverage test when they are registered.
- Expected unknown-500 e2e requests emit two redacted Pino error records containing only `{ type: "Error" }` and request IDs; the secret-bearing exception text is absent.
