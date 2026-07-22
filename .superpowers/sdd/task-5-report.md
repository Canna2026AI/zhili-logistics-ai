# Task 5 Report: Outbox Worker, Leases, Retry, and Dead Letters

## Scope and revisions

- Frozen base: `445c95789dae89a896a28b859bb2e894525f135e`
- Original Task 5 implementation: `c3787106a7b4af3af612a9a8ae3ebfa860ea37c9`
- Review baseline/report commit: `dad769ffc618b88b2bd4aa4898c845e15e7d9dd9`
- Review hardening commit: `4823ffae49827a2e9e24de36ec7a7aa6e22ffae8`
- Branch: `codex/backend-foundation`

The hardening pass addresses every Critical, Important, and Minor item in
`/tmp/zhili-backend-foundation-task5-review.md`. Scope remained within the worker,
worker configuration, Outbox schema/migration/snapshot, Task 5 tests, and this report.
No Task 6 work was started.

## Review findings resolved

### Dedicated least-privilege worker database identity

- The migration creates the group role `zhili_worker` with `NOLOGIN`, `NOSUPERUSER`,
  `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOREPLICATION`, and `NOBYPASSRLS`.
- The role receives schema usage, Outbox-only RLS policies, a column-level `SELECT`
  allowlist for fields needed to construct jobs, and a column-level `UPDATE` allowlist
  limited to delivery state. It receives no insert/delete privilege and cannot update
  tenant, payload, event, aggregate, trace, or dedupe data.
- The worker now requires `WORKER_DATABASE_URL`; its environment schema deliberately
  omits `DATABASE_URL`, so the API/admin connection is neither required nor accepted as
  the worker's database configuration.
- PostgreSQL 17 integration tests migrate through an admin connection only for setup,
  then construct every real store/publisher with a login granted `zhili_worker`. Through
  that login they prove the worker can claim Outbox rows, is not a superuser and cannot
  bypass RLS, cannot select `audit_events`, and cannot mutate `tenant_id` or `payload`.

### Durable dead-letter delivery

- Reaching normal attempt five no longer writes `dead_lettered_at`. It records the safe
  reason and leaves a durable pending-dead state.
- Dead-letter claims have their own fenced lease and `dead_letter_attempts` counter.
  They never increment or repeat the normal business attempt, which remains capped at 5.
- `dead_lettered_at` is committed only after BullMQ accepts the deterministic dead job.
  A Redis failure clears the lease and schedules dead delivery with exponential backoff;
  an expired lease or stale owner cannot acknowledge or overwrite a newer claim.
- The recovery integration test uses Redis ACLs to cause a real BullMQ command failure,
  verifies no dead job and no terminal timestamp, restores Redis, reconstructs the queue
  connection, and verifies a later tick publishes exactly one dead job and commits the
  timestamp. The normal publish side effect is observed once before the outage and zero
  times during dead-delivery recovery; normal attempts remain exactly 5.

### Snapshot, Redis, and queue options

- `0000_snapshot.json` now matches the checked-in SQL/Drizzle Outbox definition,
  including trace, lease, retry, dead-letter fields, the partial claim index, worker RLS
  policies, and the dead-attempt check.
- The migration-chain test now generates into an actual temporary output directory and
  fails if Drizzle proposes a follow-up migration. This test was red with the stale
  snapshot and green only after alignment. `drizzle-kit check` also passes.
- Task 5 integration tests run Redis 8 (`redis:8-alpine`). Real normal and dead BullMQ
  jobs assert five attempts, exponential 1000 ms backoff, 24-hour/10000 completed
  retention, and seven-day/50000 failed retention.

## RED to GREEN evidence

The hardening changes were test-driven. Focused RED states included:

- `loadWorkerEnv` was missing, then still required `DATABASE_URL` after the first pass.
- the worker role query returned no role and worker-role isolation assertions failed;
- Redis image inspection found `redis:7.4-alpine` instead of Redis 8;
- a real dead-queue Redis failure still reported a terminal dead letter, proving the
  state transition occurred before delivery and was lost on failure;
- `dead_letter_attempts` was absent from the real PostgreSQL schema;
- after correcting the test harness output path, Drizzle generated
  `0001_chain_probe.sql`, proving the checked-in snapshot was stale.

Targeted GREEN results:

```text
pnpm --filter @zhili/config test
# 1 file passed; 9 tests passed

pnpm --filter @zhili/worker test
# 2 files passed; 42 tests passed

pnpm --filter @zhili/db test
# 2 files passed; 3 tests passed

pnpm --filter @zhili/db test:integration
# PostgreSQL 17 + Redis 8; 2 files passed; 12 tests passed

pnpm --filter @zhili/db exec drizzle-kit check
# Everything's fine; exit 0
```

## Fresh full verification

```text
pnpm install --frozen-lockfile
# Already up to date; exit 0

pnpm lint
# 24 successful / 24; markdownlint 0 errors

pnpm typecheck
# 24 successful / 24

pnpm test
# 33 successful / 33; worker 42 passed; config 9 passed

pnpm build
# 20 successful / 20; worker and API rebuilt from the hardening sources

pnpm --filter @zhili/db test:integration
# 2 files passed; 12 tests passed

pnpm --filter @zhili/api test:integration
# 1 file passed; 21 tests passed

pnpm --filter @zhili/api test:e2e
# 3 files passed; 19 tests passed

pnpm contracts:generate:check
# generated contract diff check exited 0

pnpm contracts:lint
# OpenAPI valid; exit 0

pnpm contracts:test
# 1 file passed; 13 tests passed

pnpm --filter @zhili/db exec drizzle-kit check
# Everything's fine; exit 0

pnpm exec prettier --check <all changed Markdown/TypeScript/JSON files>
# All matched files use Prettier code style

git diff --check
# exit 0
```

The freshly built production artifact was additionally started against an independently
migrated PostgreSQL 17 container through a dedicated login granted only `zhili_worker`,
plus a Redis 8 container. `node dist/main.js` emitted `Outbox worker started`, accepted
`SIGINT`, drained its Nest lifecycle, and terminated.

## Durable state, safety, and lifecycle decisions

- Normal claims remain one short `FOR UPDATE SKIP LOCKED` transaction. BullMQ I/O occurs
  outside the transaction; success/failure updates are fenced by row ID, lease owner,
  attempt, unpublished state, and non-terminal state.
- Normal retry delay remains `1000ms * 2^(attempt - 1)`, capped at five minutes. Dead
  delivery uses the same bounded backoff calculation but a separate attempt counter.
- Normal and dead jobs use the Outbox ULID as BullMQ `jobId`, so a Redis success followed
  by a database acknowledgement failure is safely replayable without creating another
  job.
- Normal jobs contain the allowed business payload. Dead jobs contain metadata only and
  never include the payload, raw exceptions, credentials, complete phone numbers, or
  complete addresses. Logs use fixed reason codes and the repository redacted logger.
- Unsupported event types follow the normal five-attempt policy and use `reports.dead`
  for metadata-only quarantine.
- Shutdown still stops polling before waiting for active ticks, then closes all BullMQ
  queues, Redis, and PostgreSQL. `tick(limit)` still enforces integer bounds `1..100` and
  defaults to 100.

## Changed files in the review hardening commit

- `apps/worker/README.md`
- `apps/worker/src/main.ts`
- `apps/worker/src/outbox.processor.ts`
- `apps/worker/src/worker.module.ts`
- `apps/worker/test/outbox.processor.test.ts`
- `apps/worker/test/redis-container.ts`
- `packages/config/src/env.ts`
- `packages/config/src/index.ts`
- `packages/config/test/env.test.ts`
- `packages/db/migrations/0000_foundation.sql`
- `packages/db/migrations/meta/0000_snapshot.json`
- `packages/db/src/rls.ts`
- `packages/db/src/schema/outbox.ts`
- `packages/db/test/migration-chain.test.ts`
- `tests/integration/outbox-worker.test.ts`

## Final status

The review hardening implementation is committed at
`4823ffae49827a2e9e24de36ec7a7aa6e22ffae8`. After committing this report,
`git status --short` must be empty. Task 6 remains blocked only on the parent workflow's
acceptance of this completed Task 5 revision.
