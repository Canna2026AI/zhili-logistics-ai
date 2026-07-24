# Zhili Outbox Worker

The worker polls PostgreSQL Outbox rows and publishes BullMQ jobs. Event types must follow
`<queue>.<lowercase-event-name>`, where `<queue>` is exactly one of `imports`, `print`,
`notifications`, `tracking`, `connectors`, `ai`, or `reports`. Unsupported event types use
the bounded retry policy and are quarantined to `reports.dead` after attempt five.

Each claim holds a 30-second owner-guarded lease. Queue I/O happens after the short
`FOR UPDATE SKIP LOCKED` claim transaction. Success and failure are persisted in separate
owner-guarded transactions. Retry delay is `1s * 2^(attempt - 1)`, capped at five minutes.
Attempt five transitions to durable pending dead-letter delivery. Dead publication has its
own leased attempt counter and is retried without invoking the normal queue again or
incrementing the business attempt above five; `dead_lettered_at` is written only after the
deterministic dead job is present in Redis.

Normal and dead-letter BullMQ jobs use the Outbox ULID as `jobId`. Normal jobs contain the
business payload and consumer metadata. Dead-letter jobs contain metadata only and never
contain the business payload or raw error text.

## Run

The worker uses the repository's validated environment variables, including the mandatory
`WORKER_DATABASE_URL`, `REDIS_URL`, object-storage settings, session/envelope keys, and
`LOG_LEVEL`. `WORKER_DATABASE_URL` must authenticate a `NOBYPASSRLS` login granted only
the `zhili_worker` role; it must not reuse the API application or database-administrator
URL.

```sh
pnpm --filter @zhili/worker dev
pnpm --filter @zhili/worker build
pnpm --filter @zhili/worker start
```

Shutdown signals stop future claims, drain the active tick, and then close every owned
BullMQ queue, Redis connection, and PostgreSQL pool.
