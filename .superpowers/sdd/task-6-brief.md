# Backend Foundation Task 6 SDD Brief — Docker Compose, cold start, and production-like smoke

> Approved implementation brief. Task 6 starts from the exact clean base recorded below.

## 0. Frozen prerequisite: Task 5 approved

`TASK6_BASE_SHA=301ec59f33896e123f154b4b01f63ff211d1a05a`

Task 5 was independently re-reviewed at this exact HEAD and approved with **0 Critical / 0 Important / 0 Minor**. The worktree was clean before this brief was added, and Task 6 had not started. Review evidence is `/tmp/zhili-backend-foundation-task5-rereview.md`; the checked-in implementation evidence is `.superpowers/sdd/task-5-report.md`.

The re-review independently verified the dedicated `zhili_worker` NOBYPASSRLS role, real PostgreSQL 17.10 access boundaries, Redis 8.8.0 dead-letter recovery, migration snapshot alignment, and real BullMQ job options. Worker tests passed 42/42 and DB integration passed 12/12.

Before any Task 6 RED work:

1. Verify `git rev-parse HEAD` equals `TASK6_BASE_SHA` before adding the Task 6 brief, and record the brief-only status separately from implementation changes.
2. Read the fresh review and confirm it explicitly approves C1 (least-privilege worker RLS access), I1 (durable dead-letter publication), and I2 (migration snapshot alignment), with Redis 8 coverage.
3. Preserve Task 5 files and security properties unchanged.
4. Re-run the approved Task 5 commands on that exact SHA:

   ```sh
   pnpm --filter @zhili/worker test
   pnpm --filter @zhili/worker lint
   pnpm --filter @zhili/worker typecheck
   pnpm --filter @zhili/worker build
   pnpm --filter @zhili/db test:integration
   ```

5. If any prerequisite fails, stop and report the Task 5 blocker. Task 6 must not repair Task 5, weaken RLS, substitute an administrator URL into the worker, or silently edit Task 5 files.

## 1. Objective

Deliver a macOS Docker Desktop-executable, production-like local stack using:

- Node.js 22.22 application images built with pnpm 11.5;
- PostgreSQL 17;
- Redis 8 and real BullMQ;
- MinIO and the real S3-compatible object protocol;
- the existing Nest/Fastify API artifact and health endpoints;
- the existing least-privilege Outbox worker artifact;
- Drizzle migrations applied by a one-shot migration service.

The executable acceptance must cold-start the complete stack from **empty named volumes twice**. Each cycle must prove real API readiness, a real MinIO write/read, tenant isolation, one real Outbox row becoming one real BullMQ job, runtime hardening/resource limits, and graceful SIGTERM shutdown. The second cycle must use a frozen offline pnpm install, no image pulls, and a Docker build network of `none` while reusing the primed build cache.

This is not a mock-stack task. A container merely being “running” is not acceptance evidence.

## 2. Frozen existing interfaces to consume

Do not redesign these interfaces in Task 6:

- API startup: `pnpm --filter @zhili/api build`, then `node apps/api/dist/main.js` / package `start`.
- Worker startup: `pnpm --filter @zhili/worker build`, then `node apps/worker/dist/main.js` / package `start`.
- API public health:
  - `GET /api/v1/health/live` — process liveness only.
  - `GET /api/v1/health/ready` — real concurrent PostgreSQL, authenticated Redis, and MinIO readiness; `200` only when all are up, otherwise `503`.
- API environment: `loadEnv()` and `AppEnv` require `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `SESSION_KEY`, `ENVELOPE_MASTER_KEY`; `PORT`, `LOG_LEVEL`, and `NODE_ENV` retain their validated semantics.
- Worker environment: `loadWorkerEnv()` and `WorkerEnv` require `WORKER_DATABASE_URL` instead of `DATABASE_URL`, plus the remaining validated application variables.
- Tenant transaction: `withTenantTransaction(context, work)` with `TenantContext { tenantId, subjectId, requestId, permissions }` and `SET LOCAL` request settings.
- Tenant data: `outboxEvents` is forced-RLS; the application role defaults to zero visible rows when tenant context is absent.
- Worker database access: the approved Task 5 `zhili_worker` group role and its limited Outbox SELECT/UPDATE policies. It must remain `NOSUPERUSER`, `NOBYPASSRLS`, and unable to read unrelated tenant tables or alter Outbox identity/payload columns.
- Worker queues: `imports`, `print`, `notifications`, `tracking`, `connectors`, `ai`, `reports`, plus `<queue>.dead`; the normal BullMQ `jobId` is the Outbox ULID.
- Worker behavior: `OutboxPublisher` polls automatically, publishes queue I/O outside the claim transaction, acknowledges with the lease fence, and drains owned PostgreSQL/Redis/BullMQ resources on shutdown.

There is no current product endpoint whose purpose is “seed a smoke-test Outbox event.” Do not add one. The Compose test must import the existing DB API, call `withTenantTransaction` as tenant A, insert through the exported `outboxEvents` schema, and observe the production worker.

## 3. Exact Task 6 ownership

The Task 6 implementer may create or modify only the following files after the prerequisite is approved.

### Create

- `.dockerignore`
- `infra/compose.yaml`
- `infra/.env.example`
- `infra/docker/api.Dockerfile`
- `infra/docker/worker.Dockerfile`
- `infra/postgres/init/00-roles.sql`
- `infra/scripts/migrate.mjs`
- `infra/scripts/smoke.sh`
- `tests/integration/compose-smoke.test.ts`
- `.superpowers/sdd/task-6-report.md`

### Modify

- `package.json` — add only the root `test:compose` script.
- `README.md` — add Compose prerequisites, setup, ports, health semantics, cold-start command, shutdown/volume cleanup, and local-secret warnings.

### Executable-bit ownership

- `infra/scripts/smoke.sh` must be mode `100755` with LF endings and a `#!/bin/sh` shebang.

### Explicitly outside ownership

- `apps/api/**`
- `apps/worker/**`
- `packages/config/**`
- `packages/db/**`, including every migration and `migrations/meta/**`
- `packages/contracts/**` and generated contract artifacts
- `pnpm-lock.yaml` and `pnpm-workspace.yaml` (no dependency is needed for this task)
- frontend applications, feature packages, reports, and unrelated documentation

If the approved Task 5 interfaces cannot satisfy this brief without editing an outside-ownership file, stop and ask the controller to re-scope. Do not smuggle a Task 5 repair into Task 6.

## 4. File-level implementation contract

### 4.1 `.dockerignore`

Exclude at minimum `.git`, `.worktrees`, `.superpowers`, all `node_modules`, `.turbo`, coverage/test artifacts, application `dist` directories, local `.env*`, logs, and OS/editor files. Keep lockfiles, workspace manifests, source, build scripts, migrations, and `infra/scripts/migrate.mjs` in the build context. No secret-bearing local file may enter an image layer.

### 4.2 Application Dockerfiles

Both Dockerfiles must be multi-stage Linux images and must work natively on Docker Desktop arm64; do not force `linux/amd64`.

Approved base contract:

- build/runtime Node base: `node:22.22.0-bookworm-slim`;
- package manager: Corepack-pinned `pnpm@11.5.0`;
- dependency resolution: `pnpm fetch --frozen-lockfile`, followed by `pnpm install --offline --frozen-lockfile` using a BuildKit cache mount;
- build only the owned application filter;
- create a production deployment with `pnpm --filter @zhili/api deploy --prod /prod/api` or `pnpm --filter @zhili/worker deploy --prod /prod/worker`, matching the already-proven Task 4/5 deployment approach;
- final image contains only the production deployment, built `dist`, required migration runner/migrations for the API image, and runtime metadata—not repository source, dev dependencies, pnpm, or the package store.

Runtime contract for both final images:

- numeric user/group `10001:10001`, set in the Dockerfile with `USER 10001:10001`;
- `NODE_ENV=production`;
- `WORKDIR /app` owned by that numeric user;
- JSON-array command (`node dist/main.js`), no shell wrapper;
- no package installation, migration, or remote download at container startup;
- no embedded `.env`, access key, password, or secret;
- OCI labels for repository component and the Task 6 base SHA.

The API image also copies `infra/scripts/migrate.mjs` and `packages/db/migrations` to fixed read-only paths for the one-shot `migrate` service. The API process itself must never run migrations during normal startup.

### 4.3 `infra/postgres/init/00-roles.sql`

On a brand-new PostgreSQL volume, idempotently create/normalize only the non-login group roles required by the existing migration contract:

- `zhili_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`;
- `zhili_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`.

Do not create schema tables here, mount `0000_foundation.sql` into `docker-entrypoint-initdb.d`, grant `BYPASSRLS`, or duplicate Drizzle’s migration journal. Schema state belongs to Drizzle migrations.

### 4.4 `infra/scripts/migrate.mjs`

Provide a fail-closed one-shot entrypoint with this environment interface:

- `ADMIN_DATABASE_URL` — PostgreSQL administrator URL used only by `migrate`;
- `DATABASE_URL` — API login URL;
- `WORKER_DATABASE_URL` — worker login URL;
- `MIGRATIONS_FOLDER` — fixed to the copied image path by Compose.

Required behavior, in order:

1. Parse all three URLs without logging them. Reject missing passwords, unexpected schemes, or API/worker URLs pointing to a different database/host than the administrator URL.
2. Apply the existing Drizzle migration chain with `drizzle-orm/postgres-js/migrator` and wait for completion.
3. Idempotently create/normalize fixed login roles `zhili_api_login` and `zhili_worker_login`, sourcing their passwords from the corresponding URLs. Both login roles must be `NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS`.
4. Grant only `zhili_app` to `zhili_api_login`, and only `zhili_worker` to `zhili_worker_login`; remove cross-membership if present.
5. Assert role flags and memberships before exiting zero. Any mismatch exits nonzero with a fixed redacted reason code.
6. Close the PostgreSQL client in `finally`.

No URL, password, raw database exception, or migration SQL is printed. The `migrate` service receives the administrator credential; API and Worker do not.

### 4.5 `infra/compose.yaml`

Use modern Docker Compose syntax without an obsolete top-level `version` key. Define exactly these services:

| Service | Required contract |
| --- | --- |
| `postgres` | `postgres:17-alpine`; named volume; loopback-only development port; `pg_isready` health check. |
| `redis` | `redis:8-alpine`; password-protected; AOF enabled; named volume; loopback-only development port; authenticated `PING` health check. |
| `minio` | `minio/minio:RELEASE.2025-04-22T22-12-26Z`; `server /data --console-address :9001`; named volume; loopback-only API/console ports; real `/minio/health/live` health check. |
| `minio-init` | `minio/mc:RELEASE.2025-04-16T18-13-26Z`; waits for MinIO and idempotently creates the local bucket; exits zero. |
| `migrate` | API image with command `node /app/infra/scripts/migrate.mjs`; waits for healthy PostgreSQL; applies migrations and provisions login memberships; exits zero. |
| `api` | API image; waits for PostgreSQL/Redis/MinIO health plus successful `migrate`/`minio-init`; exposes API on loopback; Docker health calls the existing `/api/v1/health/ready`. |
| `worker` | Worker image; waits for PostgreSQL/Redis health and successful `migrate`; Docker health proves the expected `node dist/main.js` PID 1 is alive; behavioral health is separately proved by the real Outbox job. |
| `object-smoke` | `minio/mc` image under profile `smoke`; writes a supplied body to a supplied unique key, reads it back, checks equality/stat, and prints a credential-free success marker. |

Use named volumes exactly `postgres-data`, `redis-data`, and `minio-data`. Use one private project bridge network. Do not use host networking.

`infra/.env.example` must contain only conspicuously local, invalid-for-production values and these overrideable loopback ports:

- `POSTGRES_PORT=55432`
- `REDIS_PORT=56379`
- `MINIO_API_PORT=59000`
- `MINIO_CONSOLE_PORT=59001`
- `API_PORT=53000`

It must also define the local database name, administrator password, API-login password, worker-login password, Redis password, MinIO access/secret keys, bucket, session key, envelope key, and `LOG_LEVEL`. Values must satisfy the actual Zod/MinIO minimums. The tracked example is acceptable only for disposable local development. A real `infra/.env` remains ignored and must never be committed.

All published ports must bind to `127.0.0.1`, never `0.0.0.0`.

API environment must use `zhili_api_login`; Worker environment must use `zhili_worker_login`. Neither receives `ADMIN_DATABASE_URL` or the PostgreSQL administrator password. The worker still receives every variable required by `loadWorkerEnv`, even if the current worker does not use S3/session settings.

#### Runtime hardening

For both `api` and `worker`, Compose must set:

- `user: "10001:10001"` as defense in depth;
- `read_only: true`;
- a bounded `tmpfs` at `/tmp` with `nosuid,nodev,noexec`;
- `cap_drop: [ALL]`;
- `security_opt: [no-new-privileges:true]`;
- no device, Docker socket, host path, privileged mode, added capability, or writable source mount;
- `stop_signal: SIGTERM` and `stop_grace_period: 30s`;
- production environment and a bounded JSON-file log rotation policy.

Apply explicit service-level limits supported by local Docker Compose, not Swarm-only assumptions:

- API: `cpus: 1.0`, `mem_limit: 512m`, `pids_limit: 256`;
- Worker: `cpus: 1.0`, `mem_limit: 512m`, `pids_limit: 256`;
- PostgreSQL: `cpus: 1.0`, `mem_limit: 768m`, `pids_limit: 256`;
- Redis: `cpus: 0.5`, `mem_limit: 256m`, `pids_limit: 128`;
- MinIO: `cpus: 1.0`, `mem_limit: 512m`, `pids_limit: 256`;
- one-shot services: `cpus: 0.5`, `mem_limit: 256m`, `pids_limit: 128`.

Health checks must be bounded (`timeout`, `interval`, `retries`, `start_period`) and cannot rely on an unbounded sleep. API health must use Node’s built-in HTTP/fetch capability inside the image; do not install curl into the application image merely for a health check. Because Worker has no HTTP server, its container health may check the exact expected PID-1 command, but Task 6 acceptance still requires the Worker to process the real Outbox event.

Set each Dockerfile build network from `${DOCKER_BUILD_NETWORK:-default}`. This permits the second acceptance build to set `DOCKER_BUILD_NETWORK=none` and prove that dependency-fetch/install layers are already cached and frozen.

### 4.6 `tests/integration/compose-smoke.test.ts`

This test assumes the named Compose project is already up; orchestration belongs to `smoke.sh`. It uses only existing repository dependencies (`postgres`, `drizzle-orm`, `ioredis`, `bullmq`, Vitest, and Node APIs), so the lockfile must not change.

Required test sequence per cycle:

1. Resolve containers only through `docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$COMPOSE_ENV_FILE" -f infra/compose.yaml`; never depend on generated container names.
2. Assert runtime images/versions:
   - PostgreSQL `server_version` begins `17.`;
   - Redis `INFO server` reports `redis_version:8.`;
   - MinIO command/version identifies the pinned RELEASE;
   - API and Worker report Node `v22.22.x` and `process.getuid() === 10001`.
3. Inspect API/Worker runtime configuration with `docker inspect` and assert:
   - nonzero numeric user;
   - `ReadonlyRootfs === true`;
   - `CapDrop` contains `ALL` and `CapAdd` is empty;
   - `no-new-privileges:true` is present;
   - configured memory, NanoCPU, and PID limits are nonzero and equal the contract;
   - both containers are Docker-health `healthy`.
4. Fetch `/api/v1/health/live` and `/api/v1/health/ready` with fixed `x-request-id` values. Assert the `{data,meta}` envelope, status `200`, propagated request ID, and readiness checks `postgresql`, `redis`, `objectStorage` all `up`.
5. Stop only MinIO, then assert liveness remains `200` and readiness becomes `503` with only safe dependency detail. Restart MinIO, wait with a bounded poll, and assert API Docker health and readiness recover to healthy/`200`. No credential, URL, or raw exception may occur in the response.
6. Run the profiled `object-smoke` service with a cycle-unique object key and deterministic body. Assert it performs `mc cp`, `mc cat`, equality, and stat against the real MinIO service and returns the success marker. This is the required **real object write and read**, not a readiness-only check.
7. Connect through the host API-login URL, set it as `DATABASE_URL`, dynamically import `@zhili/db`, and use `withTenantTransaction`:
   - first assert tenant A’s Outbox table is empty;
   - insert one valid ULID Outbox row for event type `imports.compose-smoke`, trace ID, tenant A, deterministic dedupe key, and non-secret payload through `outboxEvents`;
   - in a separate tenant B transaction, select that exact Outbox ID and assert zero rows;
   - without any tenant context, assert the application login also sees zero rows;
   - in a new tenant A transaction, assert exactly the inserted row is visible.
8. Poll with a bounded deadline until tenant A sees `published_at IS NOT NULL`. Open the real Redis 8/BullMQ `imports` queue and assert exactly one job with `jobId === outboxId`, event type `imports.compose-smoke`, tenant A, matching trace/aggregate metadata, and expected non-secret payload. Recheck that no duplicate job exists and no `<queue>.dead` job was created. This is the required **real Outbox row plus real Worker-created BullMQ job**.
9. Query role metadata and membership through a safe database connection and assert API/Worker logins and group roles are non-superuser/non-bypass; assert the Worker login has only the worker membership. Prove the Worker login cannot select `audit_events` and cannot update `outbox_events.tenant_id` or `.payload`.
10. Close every test-owned queue, Redis, and PostgreSQL/Drizzle client in `afterAll`, including `closeDatabaseClient()`.
11. Read `docker compose logs --no-color api worker migrate` and assert none of the known local database, Redis, MinIO, session, or envelope secrets appears. Do not snapshot or print the secrets on failure; report only the fixed secret label that leaked.

Every wait helper must have an explicit deadline and a final diagnostic containing service name/state but no credentials.

### 4.7 `infra/scripts/smoke.sh`

Use portable macOS `/bin/sh`: no Bash arrays, `pipefail`, GNU `timeout`, `readlink -f`, GNU `sed`, or `grep -P`. Use a unique project name such as `zhili-task6-$$`, a `/tmp` evidence directory, and a trap that always runs `docker compose down --volumes --remove-orphans` for that project only.

Preflight:

1. Require `node`, `corepack`, `pnpm`, `docker`, and `docker compose`.
2. Require a responsive Docker Desktop Linux engine and Compose v2.
3. Run `docker compose config --quiet` and `docker compose build --check`.
4. Run `pnpm install --offline --frozen-lockfile`. A cache miss must fail with a concise instruction to run `pnpm fetch --frozen-lockfile` while network is available; it must not silently retry online.
5. Pull the pinned PostgreSQL 17, Redis 8, MinIO, MinIO client, and Node base images before the air-gapped phase. Record resolved repository digests without treating the mutable local image ID as source truth.
6. Build API/Worker once with `DOCKER_BUILD_NETWORK=default` and `--pull`.

Define one `run_cycle` function and invoke it exactly twice:

```text
cleanup this unique project with down --volumes --remove-orphans
assert zero project-labeled volumes exist
for cycle 2 only: rebuild with DOCKER_BUILD_NETWORK=none and no pull
up --detach --no-build --pull never --wait --wait-timeout 180
assert PostgreSQL/Redis/MinIO/API/Worker healthy and one-shots exited 0
run the targeted Vitest Compose suite with COMPOSE_CYCLE=1 or 2
send SIGTERM (not SIGKILL) to API and Worker
poll at most 30 seconds for both to stop
assert neither was OOM-killed and no forced SIGKILL was issued
assert no worker lease remains live and no owned DB/Redis client remains
down --volumes --remove-orphans
assert zero project-labeled volumes remain
```

The two invocations are mandatory. Cycle 2 must not reuse cycle 1’s PostgreSQL, Redis, or MinIO volume. Cycle 2 must run `DOCKER_BUILD_NETWORK=none docker compose build` and `docker compose up --pull never`; the build log must show the frozen dependency-fetch/install layers were cached. The stack must still migrate, provision logins, create the MinIO bucket, and pass the complete smoke test from empty volumes.

For graceful stop, use a direct SIGTERM with no automatic SIGKILL fallback (for example, `docker compose kill -s SIGTERM api worker`), then perform the bounded stopped-state poll. Cleanup may force removal only after the test has already failed. Record both cycles’ start/healthy/test/TERM/stopped/down milestones.

The script must exit nonzero if any cleanup, empty-volume assertion, health, test, offline build, graceful stop, or post-down volume assertion fails.

### 4.8 Root script and README

Add exactly:

```json
"test:compose": "sh infra/scripts/smoke.sh"
```

README must document this reproducible sequence:

```sh
corepack enable
corepack prepare pnpm@11.5.0 --activate
pnpm fetch --frozen-lockfile
pnpm install --offline --frozen-lockfile
pnpm test:compose
```

Also document manual `docker compose` commands using both `--env-file infra/.env` and `-f infra/compose.yaml`, the five loopback ports, the two health URLs, `down --volumes --remove-orphans`, and that `down --volumes` irreversibly deletes local disposable data.

## 5. TDD execution order and RED → GREEN evidence

### Step 1 — Freeze the approved base

```sh
git rev-parse HEAD
git status --short
```

Expected: exact controller-approved `TASK6_BASE_SHA`; no output from status. If not, stop.

### Step 2 — Add only the test harness first

Create the root script entry, `infra/.env.example`, `infra/scripts/smoke.sh`, and `tests/integration/compose-smoke.test.ts` with the assertions above. Do not create Compose/Docker implementation files yet.

### Step 3 — Capture RED

```sh
pnpm test:compose
```

Expected: nonzero because `infra/compose.yaml`/images/services do not exist. The failure must originate at the missing Compose implementation or the first real health/runtime assertion—not a TypeScript syntax error, missing test dependency, unbounded timeout, or skipped suite.

Also run the test directly against no stack:

```sh
COMPOSE_PROJECT_NAME=zhili-task6-red \
COMPOSE_ENV_FILE=infra/.env.example \
pnpm exec vitest run tests/integration/compose-smoke.test.ts \
  --no-file-parallelism --testTimeout=120000 --hookTimeout=120000
```

Expected: nonzero at the bounded “stack is not ready/containers absent” assertion. Record exact failed test names and counts in the report.

### Step 4 — Implement roles, migration, images, and Compose

Implement only the owned files and in this dependency order:

1. `.dockerignore` and the two Dockerfiles;
2. `00-roles.sql` and `migrate.mjs`;
3. `.env.example` and `compose.yaml`;
4. object-smoke service and health/resource/security configuration;
5. README documentation.

After each slice, run the narrowest static command:

```sh
docker compose --env-file infra/.env.example -f infra/compose.yaml config --quiet
docker compose --env-file infra/.env.example -f infra/compose.yaml build --check
pnpm exec eslint tests/integration/compose-smoke.test.ts
sh -n infra/scripts/smoke.sh
pnpm exec prettier --check package.json README.md infra/compose.yaml infra/scripts/migrate.mjs tests/integration/compose-smoke.test.ts
git diff --check
```

Expected: all exit `0`.

### Step 5 — Targeted GREEN, including two empty-volume cold starts

Prime the local caches explicitly:

```sh
pnpm fetch --frozen-lockfile
pnpm install --offline --frozen-lockfile
pnpm test:compose
```

Expected: exit `0`; the output must clearly identify **cycle 1 and cycle 2**, prove zero volumes before and after each cycle, show all real smoke assertions passing twice, and show graceful SIGTERM stop twice. Cycle 2 must show no-pull startup and a build network of `none`.

Re-run immediately to prove cleanup/idempotency:

```sh
pnpm test:compose
```

Expected: exit `0` again with a new unique Compose project and no resources leaked from the prior invocation.

### Step 6 — Full fresh foundation gates

```sh
pnpm install --offline --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @zhili/db test:integration
pnpm --filter @zhili/api test:integration
pnpm --filter @zhili/api test:e2e
pnpm --filter @zhili/worker test:integration
pnpm contracts:generate:check
pnpm contracts:lint
pnpm contracts:test
pnpm test:compose
git diff --check
git status --short
```

Expected: every command exits `0`. Before the report is written, status contains only the authorized Task 6 files. After the eventual controller-authorized implementation/report commits, the worktree must be clean.

### Step 7 — Required macOS Docker Desktop execution

Run and record on the current target Mac, not only in Linux CI:

```sh
sw_vers
uname -m
docker version
docker compose version
pnpm test:compose
```

The preparation host was macOS 26.5 arm64 with Docker Desktop 4.50.0, Engine 28.5.1, and Compose v2.40.3. Final evidence must record the actual execution host/version. Acceptance requires native arm64 images or multi-architecture manifests; an implicit QEMU-only `linux/amd64` stack is not accepted.

## 6. Acceptance matrix and report evidence

`.superpowers/sdd/task-6-report.md` must contain exact commands, exit codes, test file/test counts, the approved Task 5 base SHA, changed-file list, final commit SHA if the controller later authorizes a commit, and final `git status --short`.

It must include credential-free evidence for every row:

| Acceptance | Required evidence |
| --- | --- |
| Task 5 gate | Fresh review identifier, reviewed SHA, `0 Critical / 0 Important`, clean base. |
| Frozen offline install | `pnpm install --offline --frozen-lockfile` exit `0`; no fallback to online resolution. |
| Stack versions | PostgreSQL `17.x`, Redis `8.x`, pinned MinIO RELEASE, Node `22.22.x`, resolved image digests and architectures. |
| Cold start cycle 1 | Zero project volumes before; migration/login/bucket initialization; all health checks; full smoke pass; graceful TERM; zero project volumes after. |
| Cold start cycle 2 | The same evidence again from newly empty volumes, plus `DOCKER_BUILD_NETWORK=none`, cached frozen install layers, and `--pull never`. |
| API health | Live `200`; ready `200` with all three real checks up; MinIO outage causes ready `503` while live remains `200`; recovery to `200`. |
| Real object storage | Unique bucket/key, expected byte count or SHA-256, successful write/read/stat; no credentials. |
| RLS | Tenant A inserted/reads one; tenant B reads zero; no-context app login reads zero; roles remain non-bypass. |
| Real Outbox/Worker | Outbox ULID, `published_at` observed, BullMQ queue `imports`, matching `jobId`, exactly one normal job, zero dead jobs/duplicates. Payload evidence must be non-secret. |
| Container hardening | Runtime UID `10001`, read-only rootfs, ALL capabilities dropped, no-new-privileges, no privileged/socket/host mounts for API and Worker. |
| Resource limits | Runtime-inspected CPU, memory, and PID values for all long-running services. |
| Health-checked services | PostgreSQL, Redis, MinIO, API, Worker all `healthy`; migrate/minio-init exit `0`. |
| Graceful stop | SIGTERM sent, API and Worker stop within 30 seconds, not OOM-killed, no SIGKILL fallback, no live lease/owned DB or Redis client; recorded for both cycles. |
| Redaction | Known local secret labels all absent from API/Worker/migrate logs and health bodies. Never paste the secret values into the report. |
| Cleanup | Compose containers/network and all three named volumes removed after each cycle and after the full run. |
| macOS | `sw_vers`, arm64 architecture, Docker Desktop/Engine/Compose versions, native/multi-arch execution, `pnpm test:compose` exit `0`. |

Screenshots are optional and do not replace command output or assertions. Never include `.env` contents, connection URLs, passwords, access keys, session keys, envelope keys, raw exceptions, or business payloads in the report.

## 7. Forbidden shortcuts and failure conditions

- Starting Task 6 before the fresh Task 5 approval gate.
- Treating the current Task 5 remediation commit as approved merely because tests pass.
- Editing Task 5 implementation, database migrations/snapshots, contracts, generated files, or frontend code.
- Running API or Worker as PostgreSQL administrator, table owner, superuser, or any `BYPASSRLS` role.
- Granting Worker access to audit/idempotency tables or to Outbox tenant/payload identity mutation.
- Adding a smoke-only HTTP endpoint, fake queue, fake object store, SQLite/in-memory substitute, mocked health response, or direct Redis job insertion.
- Claiming an Outbox success from a seeded BullMQ job; the real Worker must create the job from the committed Outbox row.
- Checking only MinIO readiness instead of writing and reading a real object.
- Reusing volumes between the two cold-start cycles, omitting `down --volumes`, or running the cold start only once.
- Allowing the second cycle to pull images or execute dependency-fetch/install layers with network access.
- Using `pnpm install` without both `--offline` and `--frozen-lockfile` in the acceptance path.
- Using floating `latest` images, Redis 7, PostgreSQL 16/18, or an unversioned MinIO image.
- Forcing `linux/amd64`, requiring GNU host utilities, using `network_mode: host`, or assuming Linux host paths on macOS.
- Root API/Worker containers, writable root filesystems, `privileged: true`, Docker socket mounts, host source mounts, added capabilities, unbounded logs, or absent CPU/memory/PID limits.
- Installing curl or a shell toolchain into the final application image solely for health checks.
- Putting credentials in Docker build arguments, image layers/labels, committed `.env`, health output, logs, Vitest snapshots, or the report.
- Applying the foundation SQL directly from `docker-entrypoint-initdb.d`; migrations must go through the Drizzle migration journal.
- Using arbitrary sleeps as readiness; every wait must poll a real condition with a deadline.
- Accepting `docker compose stop` after a silent 30-second SIGKILL fallback as graceful shutdown.
- Leaving containers, networks, volumes, temporary credentials, or `/tmp` evidence outside the unique project cleanup.
- Updating `pnpm-lock.yaml`; this task uses already-installed dependencies.
- Committing from this draft-preparation task. A later Task 6 implementation commit requires explicit controller authorization after all gates and independent review.

## 8. Definition of done

Task 6 is done only when:

1. Task 5 was independently approved at the exact frozen base.
2. All owned files satisfy the interfaces above without outside-scope edits.
3. RED evidence was captured before implementation.
4. `pnpm test:compose` proves two independent empty-volume cold starts, two full real smoke passes, and two graceful shutdowns.
5. The second cycle succeeds with a frozen offline host install, Docker build network `none`, and `--pull never`.
6. Runtime inspection proves API/Worker non-root, read-only, all capabilities dropped, no-new-privileges, and resource-limited.
7. The full repository/foundation gate is green.
8. The same acceptance is green on macOS Docker Desktop arm64.
9. An independent Task 6 review reports zero Critical and zero Important findings.
10. Cleanup leaves no Compose resources, and the eventual authorized commit leaves a clean worktree.
