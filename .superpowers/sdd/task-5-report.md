# Task 5 Report: Outbox Worker, Leases, Retry, and Dead Letters

## Scope and revision

- Frozen base: `445c95789dae89a896a28b859bb2e894525f135e`
- Final implementation commit: `c3787106a7b4af3af612a9a8ae3ebfa860ea37c9`
- Commit subject: `feat: add outbox worker and dead letters`
- Branch: `codex/backend-foundation`
- Scope stayed within `apps/worker`, the Task 5 integration test, the explicitly
  authorized Outbox schema/migration files, and directly required root dependency policy.
  No contract, generated, frontend, other migration, feature package, or Task 6 file changed.

## TDD evidence

### Initial RED

Tests and loadable interface stubs were written before the implementation. The required
command was run against real PostgreSQL 17 and Redis 7.4 containers:

```text
pnpm --filter @zhili/worker test

Test Files  2 failed (2)
Tests       31 failed | 7 passed (38)
exit 1
```

The failures reached the intended missing behavior:

- Outbox schema introspection could not find `trace_id`, lease, retry, or dead-letter fields.
- Inserts failed with `column "trace_id" of relation "outbox_events" does not exist`.
- All seven supported routing assertions received `undefined`.
- Backoff assertions received `0` instead of `1000`, `2000`, `4000`, `8000`, `16000`,
  and the five-minute cap.
- Limit validation received `Not implemented: tick`, and the default-batch/lifecycle
  assertions proved the publisher had not begun claims or draining.

The Nest lifecycle behavior had its own RED before composition was implemented:

```text
pnpm --filter @zhili/worker exec vitest run --root ../.. \
  apps/worker/test/outbox.processor.test.ts -t 'starts polling'

Test Files  1 failed (1)
Tests       1 failed | 28 skipped (29)
exit 1
```

The lifecycle test observed zero polling starts instead of one.

### Targeted GREEN

```text
pnpm --filter @zhili/worker test

Test Files  2 passed (2)
Tests       39 passed (39)
exit 0
```

The 10 real integration tests use PostgreSQL 17 Testcontainers plus a real Redis 7.4
container and BullMQ. They prove simultaneous `SKIP LOCKED` claims, live/expired leases,
stale owner guards for acknowledgement and failure, exact backoff, attempt-five terminal
dead lettering, seven queue routes, deterministic ULID job IDs, trace propagation,
unsupported-event quarantine, metadata/log redaction, and draining resource shutdown.

Focused package gates:

```text
pnpm --filter @zhili/worker lint
pnpm --filter @zhili/worker typecheck
pnpm --filter @zhili/worker build

all exited 0
```

The production artifact was also started against an independently migrated temporary
PostgreSQL container and real Redis container with:

```text
node apps/worker/dist/main.js
```

It emitted `Outbox worker started`, accepted `SIGINT`, drained, and exited cleanly. The
runtime entrypoint is Node, not `tsx`.

## Fresh full verification

```text
pnpm install --frozen-lockfile
# Already up to date; exit 0

pnpm lint
# 24 successful / 24; markdownlint 0 errors

pnpm typecheck
# 24 successful / 24

pnpm test
# 33 successful / 33; worker 39 passed

pnpm build
# 20 successful / 20; worker production artifact built

pnpm --filter @zhili/db test:integration
# 2 files passed; 12 tests passed

pnpm --filter @zhili/api test:integration
# 1 file passed; 21 tests passed

pnpm --filter @zhili/api test:e2e
# 3 files passed; 19 tests passed

pnpm contracts:generate:check
# generated diff check exited 0

pnpm contracts:lint
# OpenAPI valid; exit 0

pnpm contracts:test
# 1 file passed; 13 tests passed

pnpm exec prettier --check apps/worker package.json \
  packages/db/src/schema/outbox.ts pnpm-lock.yaml pnpm-workspace.yaml \
  tests/integration/outbox-worker.test.ts
# All matched files use Prettier code style

git diff --check
# exit 0
```

## Durable state and transaction decisions

- Added nullable `trace_id`, `lease_owner`, `lease_expires_at`, and
  `dead_lettered_at`, plus non-null `next_attempt_at DEFAULT now()` in matching Drizzle
  and SQL definitions.
- Replaced the broad pending index with a partial `(next_attempt_at, occurred_at)` claim
  index for unpublished, non-dead rows. Existing RLS, tenant ULID checks, aggregate index,
  and tenant/dedupe uniqueness remain intact.
- Claims are one short transaction using `FOR UPDATE SKIP LOCKED`. The transaction sets a
  per-tick owner token, a clock-derived 30-second lease, and increments `attempts` once.
- BullMQ I/O occurs after the claim transaction. Success and failure each use a new
  transaction guarded by Outbox ID, lease owner, attempt, unpublished state, and non-dead
  state, so an expired/stale publisher cannot overwrite a newer result.
- Failure stores only a fixed bounded reason code and schedules
  `1000ms * 2^(attempt - 1)`, capped at 300000ms. Attempt five sets
  `dead_lettered_at`, keeps `published_at` null, and cannot be reclaimed.

## Queue, security, and lifecycle decisions

- The documented event convention is `<queue>.<lowercase-event-name>` for exactly
  `imports`, `print`, `notifications`, `tracking`, `connectors`, `ai`, and `reports`.
  Unsupported event types follow the same five-attempt policy and use `reports.dead` as
  the metadata-only quarantine queue.
- Normal and dead jobs use the Outbox ULID as BullMQ `jobId`. Queue defaults have five
  attempts, deterministic exponential retry, 24-hour/10000 completed retention, and
  seven-day/50000 failed retention.
- Normal jobs carry the explicitly permitted business payload and consumer metadata.
  Dead jobs contain only Outbox/tenant IDs, safe event/reason/attempt metadata, and a safe
  trace ID. They never contain payloads, raw exceptions, credentials, complete phone
  numbers, or complete addresses.
- Raw queue exceptions and payloads are never logged. Logs contain allowlisted Outbox ID,
  attempt, and fixed reason codes and flow through the repository redacted logger.
- Shutdown flips the stop flag before draining, clears the polling timer, waits for every
  active tick, then closes every BullMQ queue, the shared Redis connection, and the owned
  PostgreSQL pool. Calls to `tick` after shutdown do not claim.
- `tick(limit)` validates integer bounds `1..100` before `OutboxStore.claim`; its default
  is 100.
- `apps/worker` owns real production runtime dependencies, a Node 22 ESM bundle, Nest
  application-context lifecycle hooks, and `node dist/main.js` startup.

## Changed files

- `apps/worker/README.md`
- `apps/worker/package.json`
- `apps/worker/scripts/build.mjs`
- `apps/worker/src/main.ts`
- `apps/worker/src/outbox.processor.ts`
- `apps/worker/src/worker.module.ts`
- `apps/worker/test/outbox.processor.test.ts`
- `apps/worker/test/redis-container.ts`
- `apps/worker/tsconfig.build.json`
- `apps/worker/tsconfig.json`
- `package.json`
- `packages/db/migrations/0000_foundation.sql`
- `packages/db/src/schema/outbox.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tests/integration/outbox-worker.test.ts`
- `.superpowers/sdd/task-5-report.md`

## Final status

Immediately before this report was written, `git status --short` was empty at the final
implementation commit. After committing this report, the same command is required to be
empty again. No Task 6 work was started.
