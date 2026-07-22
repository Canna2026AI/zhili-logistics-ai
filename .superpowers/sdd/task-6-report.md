# Backend Foundation Task 6 Report: Production-like Compose Cold Start

## Scope and revisions

- Frozen approved Task 5 SHA: `301ec59f33896e123f154b4b01f63ff211d1a05a`
- Approved Task 6 brief commit: `58abb59b4a3234c708226de7e86a76718939878a`
- Authorized Task 5 formatting-only cleanup: `2a234f69ed22b28a83b32a29920fc711c6eb30ba`
- Task 6 feature commit: `d0de68e6b7f6d74e43bc3b835021a69259840442`
- Task 6 review-hardening commit: `39e2f26a826a3435701d555e351749d5f12b2225`
- Task 6 final interface/signal fix: `6af4f18f2823cb1e00cfc7d32c5b96c00142bf2c`
- Branch: `codex/backend-foundation`

Task 6 stayed within its authorized files. The only other change is the separately
authorized, mechanical Prettier cleanup of two Task 5 observability files. The lockfile,
workspace manifest, application code, worker code, database migrations, contracts, and
frontend code are unchanged by the Task 6 feature commit.

## Approved prerequisite and RED evidence

The fresh Task 5 review `/tmp/zhili-backend-foundation-task5-rereview.md` reviewed
`301ec59f33896e123f154b4b01f63ff211d1a05a` and reported **0 Critical / 0 Important /
0 Minor**. It explicitly approved the dedicated `zhili_worker` NOBYPASSRLS access,
durable dead-letter publication, migration snapshot alignment, and Redis 8 coverage.
The clean-base prerequisite commands were rerun before Task 6 implementation:

```text
pnpm --filter @zhili/worker test
# 2 files passed; 42 tests passed; exit 0

pnpm --filter @zhili/worker lint
pnpm --filter @zhili/worker typecheck
pnpm --filter @zhili/worker build
# each exit 0

pnpm --filter @zhili/db test:integration
# 2 files passed; 12 tests passed; exit 0
```

The acceptance harness was added before the implementation files. Both required RED
states were captured:

```text
pnpm test:compose
# exit 1: infra/compose.yaml did not exist

COMPOSE_PROJECT_NAME=zhili-task6-red \
COMPOSE_ENV_FILE=infra/.env.example \
pnpm exec vitest run tests/integration/compose-smoke.test.ts \
  --no-file-parallelism --testTimeout=120000 --hookTimeout=120000
# 1 file failed; 1 test failed at the bounded STACK_NOT_READY assertion; exit 1
```

No TypeScript syntax, dependency, or timeout failure was used as RED evidence.

## Stack and hardening delivered

The Compose project defines exactly eight services: PostgreSQL 17, Redis 8, MinIO,
`minio-init`, `migrate`, API, Worker, and profiled `object-smoke`. It uses one project
bridge and exactly three named volumes. All host ports bind to `127.0.0.1`.

API and Worker images are multi-stage native arm64 Node 22.22 images built with
Corepack-pinned pnpm 11.5. Their production deployments contain no tested development
dependencies or pnpm store. Both run as `10001:10001`, have read-only roots, bounded
`tmpfs`, all capabilities dropped, no-new-privileges, JSON-array Node commands,
SIGTERM/30-second grace settings, log rotation, and CPU/memory/PID limits. No service
uses host networking, a Docker socket, a host bind mount, a privileged mode, an added
capability, or a writable source mount.

Every external image, including both Dockerfile `FROM` stages, uses its readable tag
plus a reviewed multi-architecture manifest digest. Each acceptance run ignores ambient
`COMPOSE_PROJECT_NAME`, generates a 96-bit random Task 6 identity, fails closed if any
resource or application-image collision exists, uses project-qualified image tags, and
removes those tags on exit. Docker assigns all five loopback ports atomically and the
test discovers the mappings only after startup.

Redis has separate API and Worker ACL users. Neither can run ACL administration or
`FLUSHALL`; the Worker is restricted to BullMQ keys. MinIO has separate API and Worker
users attached to a bucket-scoped policy. Neither application receives the Redis default
user password or MinIO root credentials, and the object probe proves root administration
and cross-bucket creation are denied.

The migration one-shot applies the existing Drizzle journal, normalizes the two fixed
NOLOGIN group roles, creates/normalizes the API and Worker login roles from parsed URLs,
removes cross-membership, and asserts role flags/memberships. Its error output is fixed
and redacted. Administrator credentials are available only to `migrate`; API and Worker
use their separate least-privilege logins.

## Cold-start evidence

After all review fixes were frozen, the exact acceptance was run twice consecutively with
independent random identities `zhili-task6-999c58da030c7ab4dec8c43f` and
`zhili-task6-00ad3d005a03b05223c141e9`. Each invocation performed two independent
empty-volume cycles and exited `0`; the second followed immediately after the first.

```text
DOCKER_HOST=unix:///Users/canna/Library/Containers/com.docker.docker/Data/docker.raw.sock \
  pnpm test:compose
# project zhili-task6-999c58da030c7ab4dec8c43f; exit 0
# cycle 1: 1 file passed; 2 tests passed; 5.95 s
# cycle 2: 1 file passed; 2 tests passed; 6.03 s

DOCKER_HOST=unix:///Users/canna/Library/Containers/com.docker.docker/Data/docker.raw.sock \
  pnpm test:compose
# project zhili-task6-00ad3d005a03b05223c141e9; exit 0
# cycle 1: 1 file passed; 2 tests passed; 5.74 s
# cycle 2: 1 file passed; 2 tests passed; 5.69 s
```

For both final cycles, the output recorded:

- zero project containers/networks/volumes before startup;
- fresh PostgreSQL data, Redis data, and MinIO data volumes;
- successful migration/login initialization and bucket initialization;
- PostgreSQL, Redis, MinIO, API, and Worker `healthy`, with both one-shots exited `0`;
- the complete real Vitest smoke assertion passing;
- direct SIGTERM to API and Worker, both stopped inside the 30-second poll;
- no OOM kill, no SIGKILL fallback, no live Outbox lease, and no owned PostgreSQL or
  Redis client after shutdown;
- `down --volumes --remove-orphans`, followed by zero project resources.

Cycle 2 rebuilt API and Worker with `DOCKER_BUILD_NETWORK=none`. The build log contained
the frozen `pnpm fetch --frozen-lockfile` and
`pnpm install --offline --frozen-lockfile` layers as `CACHED`, then startup used
`--no-build --pull never`. It did not reuse any cycle-1 data volume.

The host preflight ran `CI=true pnpm install --offline --frozen-lockfile
--trust-lockfile` and exited `0`; no online fallback was attempted. `--trust-lockfile`
prevents pnpm 11 supply-chain metadata refresh while retaining the frozen lockfile and
offline-only contract.

## Real behavior proved in each cycle

- API liveness returned `200`; readiness returned `200` with PostgreSQL, Redis, and
  object storage all `up`, and request IDs were propagated in the response envelope.
- Stopping only MinIO kept liveness at `200`, changed readiness to `503` with safe
  dependency detail, then recovered API Docker health and readiness to `200` after
  MinIO restarted.
- Real object keys `compose/cycle-1/object-smoke.txt` and
  `compose/cycle-2/object-smoke.txt` were written, read, byte-compared, and statted by
  `mc`. Each body was 28 bytes; SHA-256 values were respectively
  `9091cc21ca9fe1c880229b0d62289b7f736e079c88dd636e29352becac70e177` and
  `5ff688c29dd85a0a48a67104ea060a9501198b3ecba7ad3a62614d13cb91bae9`.
- Tenant A inserted/read one Outbox row; tenant B read zero; the API login without
  tenant context read zero. The deterministic Outbox IDs ended in `N` for cycle 1 and
  `P` for cycle 2; each was observed with `published_at` set.
- The production Worker created exactly one `imports` BullMQ job with the same Outbox
  ULID, event type `imports.compose-smoke`, trace/aggregate metadata, and the expected
  non-secret cycle marker. There was no duplicate and `imports.dead` remained empty.
- API/Worker login roles and group roles were non-superuser and NOBYPASSRLS. The Worker
  had only the worker membership, could not select `audit_events`, and could not update
  Outbox tenant or payload identity columns.
- Runtime inspection matched UID, read-only root, capability, no-new-privileges,
  health, CPU, memory, and PID contracts. Logs and health bodies contained none of the
  known local secret labels; secret values were never printed by the test.
- API/Worker database and Redis credentials contained URL-reserved characters. The
  migration service retained its frozen four-variable interface and decoded each login
  password only from its corresponding URL; real API, Worker, host test, PostgreSQL, and
  Redis authentication all succeeded.
- Redis API/Worker identities could perform their required health/BullMQ work but both
  received `NOPERM` for ACL administration and `FLUSHALL`. MinIO's API identity performed
  the real object operations while administration and creation outside its bucket policy
  were denied.

## Images, versions, and native target execution

The final preflight resolved these source image digests as native arm64:

```text
postgres@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193
redis@sha256:9d317178eceac8454a2284a9e6df2466b93c745529947f0cd42a0fa9609d7005
minio/minio@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e
minio/mc@sha256:aead63c77f9db9107f1696fb08ecb0faeda23729cde94b0f663edf4fe09728e3
node@sha256:dd9d21971ec4395903fa6143c2b9267d048ae01ca6d3ea96f16cb30df6187d94
```

Runtime tests additionally asserted PostgreSQL `17.x`, Redis `8.x`, the pinned MinIO
release, and Node `v22.22.x`. A final direct image inspection reported both application
images as `architecture=arm64`, `user=10001:10001`, command `node dist/main.js`;
runtime probes returned Node `v22.22.0` and UID `10001`. Application image tags were
unique to each random run and removed after acceptance; all project containers, networks,
volumes, and application tags were absent after both invocations.

```text
sw_vers
# macOS 26.5 (25F71)

uname -m
# arm64

defaults read /Applications/Docker.app/Contents/Info CFBundleShortVersionString
# 4.50.0

docker version
# client 28.5.1; server 28.5.1

docker compose version
# v2.40.3-desktop.1

docker info
# Docker Desktop; aarch64; LinuxKit 6.11.11
```

Docker Desktop's normal API proxy was unresponsive for newly created bind-mounted
diagnostic containers during development. The final stack contains no host bind mounts,
and final acceptance used Docker Desktop's own raw engine socket shown above. Docker
Desktop was not restarted and unrelated user containers were not stopped, changed, or
removed. Ambient Compose project names were ignored, deletion remained label-scoped to
the generated random identity, and all Task 6 diagnostic/acceptance resources were absent
after cleanup.

## Fresh full verification

```text
pnpm install --offline --frozen-lockfile
# exit 0

pnpm format:check
# all matched files use Prettier style; exit 0

pnpm lint
# 24 successful / 24; markdownlint checked 51 files with 0 errors; exit 0

pnpm typecheck
# 24 successful / 24; exit 0

pnpm test
# 33 successful / 33; API 55, Worker 42, Observability 12; exit 0

pnpm build
# 20 successful / 20; exit 0

pnpm --filter @zhili/db test:integration
# 2 files passed; 12 tests passed; exit 0

pnpm --filter @zhili/api test:integration
# 1 file passed; 21 tests passed; exit 0

pnpm --filter @zhili/api test:e2e
# 3 files passed; 19 tests passed; exit 0

pnpm --filter @zhili/worker test:integration
# 1 file passed; 12 tests passed; exit 0

pnpm contracts:generate:check
# generated type diff check; exit 0

pnpm contracts:lint
# OpenAPI valid; exit 0

pnpm contracts:test
# 1 file passed; 13 tests passed; exit 0

docker compose --env-file infra/.env.example -f infra/compose.yaml --profile smoke config --quiet
docker compose --env-file infra/.env.example -f infra/compose.yaml --profile smoke build --check
node --check infra/scripts/migrate.mjs
sh -n infra/scripts/smoke.sh
pnpm exec eslint tests/integration/compose-smoke.test.ts
git diff --check
# each exit 0
```

## Changed files

Task 6 feature commit:

- `.dockerignore`
- `README.md`
- `infra/.env.example`
- `infra/compose.yaml`
- `infra/docker/api.Dockerfile`
- `infra/docker/worker.Dockerfile`
- `infra/postgres/init/00-roles.sql`
- `infra/scripts/migrate.mjs`
- `infra/scripts/smoke.sh` (mode `100755`, LF, `/bin/sh`)
- `package.json`
- `tests/integration/compose-smoke.test.ts`

Separately authorized Task 5 baseline cleanup:

- `packages/observability/src/logger.ts`
- `packages/observability/src/redaction.ts`

## Independent review and final status

The same independent reviewer audited each remediation rather than relying on the
implementation author's assessment. The first review reported **1 Critical / 3 Important /
2 Minor**: ambient project collision and deletion risk, incorrect URL-password handling,
mutable source images, application access to Redis/MinIO administrator credentials,
global application-image tags, and a host-port allocation race. Commit `39e2f26` closed
all six findings and added regression coverage.

The second review reported **0 Critical / 1 Important / 1 Minor**. It found that the
migration one-shot still received redundant raw login-password variables alongside its
URLs, and that signal traps cleaned resources without explicitly terminating the harness.
Commit `6af4f18` removed the raw password inputs, made each login password derive only
from its parsed URL, and made HUP/INT/TERM clean once and exit 129/130/143.

The final review of `58abb59..6af4f18` is recorded at
`/tmp/zhili-backend-foundation-task6-review.md`. It independently reran the canonical
Compose configuration, Node/shell syntax, diff, ESLint, and Prettier checks; inspected
raw-engine resources read-only; and exercised the exact signal-handler control flow in a
standalone `/bin/sh` probe. The probe printed `CLEANUP_ONCE`, returned `143`, and never
reached its continuation sentinel. The final verdict is **0 Critical / 0 Important /
0 Minor — APPROVED**. All original findings remain closed, and the Foundation C0/I0
exit gate is met.
