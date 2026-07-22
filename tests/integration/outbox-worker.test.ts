import { Writable } from 'node:stream';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Queue } from 'bullmq';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import IORedis from 'ioredis';
import postgres, { type Sql } from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLogger } from '../../packages/observability/src';
import { startRedisContainer } from '../../apps/worker/test/redis-container';
import {
  BullMqOutboxQueues,
  OutboxPublisher,
  PostgresOutboxStore,
  type ClaimedOutboxEvent,
  type DeadLetterJob,
  type NormalOutboxJob,
  type OutboxQueues,
  type OutboxStore,
  type QueueName,
} from '../../apps/worker/src/outbox.processor';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const migrationFolder = resolve(repositoryRoot, 'packages/db/migrations');
const queueNames = [
  'imports',
  'print',
  'notifications',
  'tracking',
  'connectors',
  'ai',
  'reports',
] as const satisfies readonly QueueName[];
const tenantId = ulid(30);

let postgresContainer: StartedPostgreSqlContainer;
let redisContainer: Awaited<ReturnType<typeof startRedisContainer>>;
let admin: Sql;
let redisInspector: IORedis;
let workerDatabaseUrl: string;
let redisUrl: string;
let redisConnection: { host: string; port: number };
let sequence = 0;
const publishers = new Set<OutboxPublisher>();

beforeAll(async () => {
  [postgresContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine').start(),
    startRedisContainer(),
  ]);
  const adminDatabaseUrl = postgresContainer.getConnectionUri();
  redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
  redisConnection = {
    host: redisContainer.getHost(),
    port: redisContainer.getMappedPort(6379),
  };
  admin = postgres(adminDatabaseUrl, { max: 4 });
  redisInspector = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
  await migrate(drizzle(admin), { migrationsFolder: migrationFolder });
  await admin.unsafe(
    `CREATE ROLE zhili_worker_integration LOGIN PASSWORD 'worker-integration-password'
     NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`
  );
  await admin`GRANT zhili_worker TO zhili_worker_integration`;
  workerDatabaseUrl = connectionUriFor('zhili_worker_integration', 'worker-integration-password');
});

beforeEach(async () => {
  sequence = 0;
  await Promise.all([admin`TRUNCATE outbox_events`, redisInspector.flushdb()]);
});

afterEach(async () => {
  await Promise.all([...publishers].map((publisher) => publisher.close()));
  publishers.clear();
});

afterAll(async () => {
  if (redisInspector) await redisInspector.quit();
  if (admin) await admin.end();
  await Promise.all([postgresContainer?.stop(), redisContainer?.stop()]);
});

describe('Outbox durable lease schema', () => {
  it('installs lease, trace, retry, dead-letter fields and the partial pending access path', async () => {
    const columns = await admin<
      { column_name: string; is_nullable: string; column_default: string | null }[]
    >`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'outbox_events'
      ORDER BY ordinal_position
    `;
    const byName = new Map(columns.map((column) => [column.column_name, column]));

    expect(byName.get('trace_id')).toMatchObject({ is_nullable: 'YES' });
    expect(byName.get('lease_owner')).toMatchObject({ is_nullable: 'YES' });
    expect(byName.get('lease_expires_at')).toMatchObject({ is_nullable: 'YES' });
    expect(byName.get('next_attempt_at')).toMatchObject({
      is_nullable: 'NO',
      column_default: expect.stringContaining('now()'),
    });
    expect(byName.get('dead_lettered_at')).toMatchObject({ is_nullable: 'YES' });
    expect(byName.get('dead_letter_attempts')).toMatchObject({
      is_nullable: 'NO',
      column_default: '0',
    });

    const indexes = await admin<{ indexdef: string }[]>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'outbox_events'
    `;
    expect(indexes.map(({ indexdef }) => indexdef).join('\n')).toMatch(
      /\(next_attempt_at, occurred_at\).*WHERE.*published_at IS NULL.*dead_lettered_at IS NULL/i
    );
  });
});

describe('least-privilege worker database role', () => {
  it('is NOBYPASSRLS, consumes Outbox rows, and cannot access or mutate unrelated data', async () => {
    const roles = await admin<
      {
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreaterole: boolean;
        rolcreatedb: boolean;
      }[]
    >`
      SELECT rolname, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
      FROM pg_roles
      WHERE rolname = 'zhili_worker'
    `;
    expect(roles).toEqual([
      {
        rolname: 'zhili_worker',
        rolsuper: false,
        rolbypassrls: false,
        rolcreaterole: false,
        rolcreatedb: false,
      },
    ]);

    const worker = postgres(workerDatabaseUrl, { max: 1 });
    try {
      const event = await insertEvent({ eventType: 'imports.worker-role-tested' });
      const store = new PostgresOutboxStore(workerDatabaseUrl);
      try {
        await expect(
          store.claim('least-privilege-worker', new Date('2026-07-22T00:00:00.000Z'), 1)
        ).resolves.toMatchObject([{ id: event.id, tenantId, attempt: 1 }]);
      } finally {
        await store.close();
      }

      await expect(worker`SELECT * FROM audit_events`).rejects.toThrow(/permission denied/i);
      await expect(
        worker`UPDATE outbox_events SET tenant_id = ${ulid(29)} WHERE id = ${event.id}`
      ).rejects.toThrow(/permission denied/i);
      await expect(
        worker`UPDATE outbox_events SET payload = '{}'::jsonb WHERE id = ${event.id}`
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await worker.end();
    }
  });
});

describe('real PostgreSQL lease claims and real BullMQ delivery', () => {
  it('lets two simultaneous publishers create exactly one BullMQ job for one row', async () => {
    const event = await insertEvent({ eventType: 'imports.received', traceId: 'trace-concurrent' });
    const first = ownedPublisher({ ownerId: 'concurrent-a' });
    const second = ownedPublisher({ ownerId: 'concurrent-b' });

    const results = await Promise.all([first.tick(), second.tick()]);

    expect(results.reduce((total, result) => total + result.claimed, 0)).toBe(1);
    expect(results.reduce((total, result) => total + result.published, 0)).toBe(1);
    expect(await jobCount('imports')).toBe(1);
    const job = await getJob<NormalOutboxJob>('imports', event.id);
    expect(job?.id).toBe(event.id);
    const [row] = await outboxRow(event.id);
    expect(row).toMatchObject({ attempts: 1, lease_owner: null, lease_expires_at: null });
    expect(row?.published_at).toBeInstanceOf(Date);
  });

  it('does not steal a live lease and recovers it exactly once after expiry', async () => {
    const clock = manualClock('2026-07-22T00:00:00.000Z');
    const event = await insertEvent({
      eventType: 'tracking.location-recorded',
      leaseOwner: 'crashed-publisher',
      leaseExpiresAt: new Date('2026-07-22T00:00:30.000Z'),
    });
    const publisher = ownedPublisher({ ownerId: 'lease-recovery', clock: clock.read });

    await expect(publisher.tick()).resolves.toMatchObject({ claimed: 0 });
    clock.set('2026-07-22T00:00:30.001Z');
    await expect(publisher.tick()).resolves.toMatchObject({ claimed: 1, published: 1 });
    await expect(publisher.tick()).resolves.toMatchObject({ claimed: 0 });

    expect(await jobCount('tracking')).toBe(1);
    const [row] = await outboxRow(event.id);
    expect(row).toMatchObject({ attempts: 1, lease_owner: null });
    expect(row?.published_at).toEqual(new Date('2026-07-22T00:00:30.001Z'));
  });

  it('prevents a stale publisher from acknowledging a lease recovered by a newer publisher', async () => {
    const clock = manualClock('2026-07-22T01:00:00.000Z');
    const event = await insertEvent({ eventType: 'print.label-requested' });
    const blockedQueues = new BlockingQueues('success');
    const stale = publisherWithDependencies(
      new PostgresOutboxStore(workerDatabaseUrl, { applicationName: 'stale-ack-store' }),
      blockedQueues,
      { ownerId: 'stale-ack', clock: clock.read }
    );

    const staleTick = stale.tick();
    await blockedQueues.publishStarted.promise;
    clock.set('2026-07-22T01:00:30.001Z');
    const current = ownedPublisher({ ownerId: 'current-ack', clock: clock.read });
    await expect(current.tick()).resolves.toMatchObject({ claimed: 1, published: 1 });

    blockedQueues.release.resolve();
    await expect(staleTick).resolves.toMatchObject({ claimed: 1, published: 0 });
    const [row] = await outboxRow(event.id);
    expect(row).toMatchObject({ attempts: 2, lease_owner: null, last_error: null });
    expect(row?.published_at).toEqual(new Date('2026-07-22T01:00:30.001Z'));
  });

  it('prevents a stale publisher from recording failure over a newer acknowledgement', async () => {
    const clock = manualClock('2026-07-22T02:00:00.000Z');
    const event = await insertEvent({ eventType: 'connectors.erp-requested' });
    const blockedQueues = new BlockingQueues('failure');
    const stale = publisherWithDependencies(
      new PostgresOutboxStore(workerDatabaseUrl, { applicationName: 'stale-fail-store' }),
      blockedQueues,
      { ownerId: 'stale-fail', clock: clock.read }
    );

    const staleTick = stale.tick();
    await blockedQueues.publishStarted.promise;
    clock.set('2026-07-22T02:00:30.001Z');
    const current = ownedPublisher({ ownerId: 'current-fail', clock: clock.read });
    await expect(current.tick()).resolves.toMatchObject({ claimed: 1, published: 1 });

    blockedQueues.release.resolve();
    await expect(staleTick).resolves.toMatchObject({ claimed: 1, failed: 0 });
    const [row] = await outboxRow(event.id);
    expect(row).toMatchObject({ attempts: 2, lease_owner: null, last_error: null });
    expect(row?.published_at).toEqual(new Date('2026-07-22T02:00:30.001Z'));
  });

  it('increments once per failed claim and schedules exact deterministic backoff', async () => {
    const clock = manualClock('2026-07-22T03:00:00.000Z');
    const event = await insertEvent({ eventType: 'ai.summary-requested' });
    const queues = new FailingQueues();
    const publisher = publisherWithDependencies(
      new PostgresOutboxStore(workerDatabaseUrl, { applicationName: 'backoff-store' }),
      queues,
      { ownerId: 'backoff', clock: clock.read }
    );

    await expect(publisher.tick()).resolves.toMatchObject({ claimed: 1, failed: 1 });
    let [row] = await outboxRow(event.id);
    expect(row).toMatchObject({ attempts: 1, last_error: 'QUEUE_PUBLISH_FAILED' });
    expect(row?.next_attempt_at).toEqual(new Date('2026-07-22T03:00:01.000Z'));
    expect(row?.lease_owner).toBeNull();

    clock.set('2026-07-22T03:00:00.999Z');
    await expect(publisher.tick()).resolves.toMatchObject({ claimed: 0 });
    clock.set('2026-07-22T03:00:01.000Z');
    await expect(publisher.tick()).resolves.toMatchObject({ claimed: 1, failed: 1 });
    [row] = await outboxRow(event.id);
    expect(row).toMatchObject({ attempts: 2, last_error: 'QUEUE_PUBLISH_FAILED' });
    expect(row?.next_attempt_at).toEqual(new Date('2026-07-22T03:00:03.000Z'));
    expect(queues.publishCalls).toBe(2);
  });

  it('terminally dead-letters attempt five once without payload or secret leakage', async () => {
    const clock = manualClock('2026-07-22T04:00:00.000Z');
    const event = await insertEvent({
      eventType: 'unknown.Authorization=Bearer terminal-secret',
      traceId: 'trace-terminal',
      payload: {
        authorization: 'Bearer payload-secret',
        cookie: 'sid=cookie-secret',
        password: 'password-secret',
        token: 'token-secret',
        apiKey: 'api-key-secret',
        phone: '13926548800',
        address: '北京市朝阳区完整地址 88 号',
      },
    });
    const logChunks: string[] = [];
    const logDestination = new Writable({
      write(chunk, _encoding, callback) {
        logChunks.push(chunk.toString());
        callback();
      },
    });
    const publisher = ownedPublisher({
      ownerId: 'terminal',
      clock: clock.read,
      logger: createLogger({ name: 'terminal-test', level: 'warn' }, logDestination),
    });

    for (const instant of [
      '2026-07-22T04:00:00.000Z',
      '2026-07-22T04:00:01.000Z',
      '2026-07-22T04:00:03.000Z',
      '2026-07-22T04:00:07.000Z',
      '2026-07-22T04:00:15.000Z',
    ]) {
      clock.set(instant);
      await publisher.tick();
    }

    const [row] = await outboxRow(event.id);
    expect(row).toMatchObject({
      attempts: 5,
      published_at: null,
      lease_owner: null,
      last_error: 'UNSUPPORTED_EVENT_TYPE',
    });
    expect(row?.dead_lettered_at).toEqual(new Date('2026-07-22T04:00:15.000Z'));
    expect(row?.next_attempt_at).toEqual(new Date('2026-07-22T04:00:31.000Z'));

    const deadJob = await getJob<DeadLetterJob>('reports.dead', event.id);
    expect(deadJob?.id).toBe(event.id);
    expect(deadJob?.data).toMatchObject({
      outboxId: event.id,
      tenantId,
      attempt: 5,
      reason: 'UNSUPPORTED_EVENT_TYPE',
      traceId: 'trace-terminal',
    });
    expect(deadJob?.data).not.toHaveProperty('payload');
    expect(await jobCount('reports.dead')).toBe(1);
    expect(deadJob?.opts).toMatchObject({
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: { age: 86_400, count: 10_000 },
      removeOnFail: { age: 604_800, count: 50_000 },
    });

    clock.set('2026-07-22T05:00:00.000Z');
    await expect(publisher.tick()).resolves.toMatchObject({ claimed: 0 });
    expect(await jobCount('reports.dead')).toBe(1);

    const nonSecretText = JSON.stringify({
      lastError: row?.last_error,
      deadLetter: deadJob?.data,
      logs: logChunks.join(''),
    });
    for (const forbidden of [
      'terminal-secret',
      'payload-secret',
      'cookie-secret',
      'password-secret',
      'token-secret',
      'api-key-secret',
      '13926548800',
      '北京市朝阳区完整地址 88 号',
    ]) {
      expect(nonSecretText).not.toContain(forbidden);
    }
  });

  it('retries durable dead-job delivery after a temporary failure without rerunning normal work', async () => {
    const clock = manualClock('2026-07-22T05:30:00.000Z');
    const event = await insertEvent({
      eventType: 'notifications.dead-delivery-tested',
      attempts: 4,
    });
    await redisInspector.call(
      'ACL',
      'SETUSER',
      'dead_recovery_worker',
      'on',
      '>dead-recovery-password',
      '~*',
      '+@all'
    );
    const queues = new RecoveringDeadQueues(
      new BullMqOutboxQueues(redisUriFor('dead_recovery_worker', 'dead-recovery-password'), {
        connectionName: 'dead-recovery-redis',
      })
    );
    const publisher = publisherWithDependencies(
      new PostgresOutboxStore(workerDatabaseUrl, { applicationName: 'dead-recovery-store' }),
      queues,
      { ownerId: 'dead-recovery', clock: clock.read }
    );

    await redisInspector.call(
      'ACL',
      'SETUSER',
      'dead_recovery_worker',
      '-@all',
      '+info',
      '+client'
    );
    await expect(publisher.tick()).resolves.toMatchObject({
      claimed: 2,
      failed: 1,
      deadLettered: 0,
    });
    let [row] = await outboxRow(event.id);
    expect(row).toMatchObject({ attempts: 5, dead_letter_attempts: 1 });
    expect(row?.dead_lettered_at).toBeNull();
    expect(queues.publishCalls).toBe(1);
    expect(queues.deadPublishCalls).toBe(1);
    expect(await jobCount('notifications.dead')).toBe(0);

    await redisInspector.call('ACL', 'SETUSER', 'dead_recovery_worker', '+@all');
    await publisher.close();
    const recoveredQueues = new RecoveringDeadQueues(
      new BullMqOutboxQueues(redisUriFor('dead_recovery_worker', 'dead-recovery-password'), {
        connectionName: 'dead-recovery-restored-redis',
      })
    );
    const recovered = publisherWithDependencies(
      new PostgresOutboxStore(workerDatabaseUrl, {
        applicationName: 'dead-recovery-restored-store',
      }),
      recoveredQueues,
      { ownerId: 'dead-recovery-restored', clock: clock.read }
    );
    clock.set('2026-07-22T05:30:01.000Z');
    await expect(recovered.tick()).resolves.toMatchObject({
      claimed: 1,
      published: 0,
      failed: 0,
      deadLettered: 1,
    });
    [row] = await outboxRow(event.id);
    expect(row).toMatchObject({ attempts: 5, dead_letter_attempts: 2 });
    expect(row?.dead_lettered_at).toEqual(new Date('2026-07-22T05:30:01.000Z'));
    expect(queues.publishCalls).toBe(1);
    expect(queues.deadPublishCalls).toBe(1);
    expect(recoveredQueues.publishCalls).toBe(0);
    expect(recoveredQueues.deadPublishCalls).toBe(1);

    const deadJob = await getJob<DeadLetterJob>('notifications.dead', event.id);
    expect(deadJob?.data).toMatchObject({
      outboxId: event.id,
      tenantId,
      attempt: 5,
      reason: 'QUEUE_PUBLISH_FAILED',
    });
  });

  it('routes all seven prefixes and propagates trace metadata with ULID job IDs', async () => {
    const events = await Promise.all(
      queueNames.map((queue) =>
        insertEvent({ eventType: `${queue}.route-tested`, traceId: `trace-${queue}` })
      )
    );
    const publisher = ownedPublisher({ ownerId: 'routing' });

    await expect(publisher.tick(7)).resolves.toMatchObject({ claimed: 7, published: 7 });

    for (const [index, queue] of queueNames.entries()) {
      const event = events[index]!;
      const job = await getJob<NormalOutboxJob>(queue, event.id);
      expect(job?.id).toBe(event.id);
      expect(job?.data).toMatchObject({
        outboxId: event.id,
        eventType: `${queue}.route-tested`,
        tenantId,
        traceId: `trace-${queue}`,
        attempt: 1,
        aggregate: {
          type: 'integration-event',
          id: event.aggregateId,
          version: '1',
        },
        payload: { accepted: true },
      });
      expect(job?.opts).toMatchObject({
        attempts: 5,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { age: 86_400, count: 10_000 },
        removeOnFail: { age: 604_800, count: 50_000 },
      });
      expect(await jobCount(queue)).toBe(1);
    }
  });

  it('uses deterministic job IDs so recovery after a lost acknowledgement cannot duplicate jobs', async () => {
    const clock = manualClock('2026-07-22T06:00:00.000Z');
    const event = await insertEvent({ eventType: 'notifications.sms-requested' });
    const underlyingStore = new PostgresOutboxStore(workerDatabaseUrl, {
      applicationName: 'lost-ack-store',
    });
    const first = publisherWithDependencies(
      new IgnoreAcknowledgementStore(underlyingStore),
      new BullMqOutboxQueues(redisUrl, { connectionName: 'lost-ack-redis' }),
      { ownerId: 'lost-ack', clock: clock.read }
    );

    await expect(first.tick()).resolves.toMatchObject({ claimed: 1, published: 0 });
    expect(await jobCount('notifications')).toBe(1);
    clock.set('2026-07-22T06:00:30.001Z');
    const recovered = ownedPublisher({ ownerId: 'lost-ack-recovered', clock: clock.read });
    await expect(recovered.tick()).resolves.toMatchObject({ claimed: 1, published: 1 });

    expect(await jobCount('notifications')).toBe(1);
    expect((await getJob('notifications', event.id))?.id).toBe(event.id);
    const [row] = await outboxRow(event.id);
    expect(row).toMatchObject({ attempts: 2, lease_owner: null });
    expect(row?.published_at).toEqual(new Date('2026-07-22T06:00:30.001Z'));
  });

  it('shutdown drains the active tick, closes owned clients, and starts no later claim', async () => {
    const firstEvent = await insertEvent({ eventType: 'reports.daily-requested' });
    const secondEvent = await insertEvent({ eventType: 'imports.received' });
    const applicationName = `shutdown-pg-${Date.now()}`;
    const connectionName = `shutdown-redis-${Date.now()}`;
    const store = new PostgresOutboxStore(workerDatabaseUrl, { applicationName });
    const queues = new BlockingDelegatingQueues(
      new BullMqOutboxQueues(redisUrl, { connectionName })
    );
    const publisher = publisherWithDependencies(store, queues, {
      ownerId: 'shutdown',
      batchSize: 1,
    });

    const tick = publisher.tick(1);
    await queues.publishStarted.promise;
    const close = publisher.close();
    let closeSettled = false;
    void close.then(() => {
      closeSettled = true;
    });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    expect(closeSettled).toBe(false);

    queues.release.resolve();
    await expect(tick).resolves.toMatchObject({ claimed: 1, published: 1 });
    await close;
    expect(queues.closed).toBe(true);
    await expect(publisher.tick()).resolves.toMatchObject({ claimed: 0 });

    const [firstRow] = await outboxRow(firstEvent.id);
    const [secondRow] = await outboxRow(secondEvent.id);
    expect(firstRow?.published_at).toBeInstanceOf(Date);
    expect(secondRow).toMatchObject({ attempts: 0, published_at: null, lease_owner: null });
    const [databaseConnections] = await admin<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM pg_stat_activity
      WHERE application_name = ${applicationName}
    `;
    expect(databaseConnections?.count).toBe(0);
    const redisClients = (await redisInspector.client('LIST')) as string;
    expect(redisClients).not.toContain(connectionName);
  });
});

function ownedPublisher(
  options: Partial<ConstructorParameters<typeof OutboxPublisher>[0]> & { ownerId: string }
): OutboxPublisher {
  const publisher = new OutboxPublisher({
    databaseUrl: workerDatabaseUrl,
    redisUrl,
    logger: createLogger({ level: 'silent' }),
    ...options,
  });
  publishers.add(publisher);
  return publisher;
}

function publisherWithDependencies(
  store: OutboxStore,
  queues: OutboxQueues,
  options: Partial<ConstructorParameters<typeof OutboxPublisher>[0]> & { ownerId: string }
): OutboxPublisher {
  const publisher = new OutboxPublisher({
    store,
    queues,
    logger: createLogger({ level: 'silent' }),
    ...options,
  });
  publishers.add(publisher);
  return publisher;
}

async function insertEvent(options: {
  eventType: string;
  traceId?: string;
  payload?: Record<string, unknown>;
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  attempts?: number;
}): Promise<{ id: string; aggregateId: string }> {
  sequence += 1;
  const id = ulid(sequence);
  const aggregateId = `aggregate-${sequence}`;
  await admin`
    INSERT INTO outbox_events (
      id, tenant_id, aggregate_type, aggregate_id, aggregate_version,
      event_type, payload, dedupe_key, trace_id, lease_owner, lease_expires_at,
      next_attempt_at, attempts
    ) VALUES (
      ${id}, ${tenantId}, 'integration-event', ${aggregateId}, 1,
      ${options.eventType}, ${JSON.stringify(options.payload ?? { accepted: true })}::jsonb,
      ${`dedupe-${sequence}`}, ${options.traceId ?? null}, ${options.leaseOwner ?? null},
      ${options.leaseExpiresAt?.toISOString() ?? null}, '2026-01-01T00:00:00.000Z',
      ${options.attempts ?? 0}
    )
  `;
  return { id, aggregateId };
}

async function outboxRow(id: string): Promise<
  {
    attempts: number;
    published_at: Date | null;
    lease_owner: string | null;
    lease_expires_at: Date | null;
    next_attempt_at: Date;
    dead_lettered_at: Date | null;
    dead_letter_attempts: number;
    last_error: string | null;
  }[]
> {
  const rows = await admin<
    {
      attempts: number;
      published_at: string | null;
      lease_owner: string | null;
      lease_expires_at: string | null;
      next_attempt_at: string;
      dead_lettered_at: string | null;
      dead_letter_attempts: number;
      last_error: string | null;
    }[]
  >`
    SELECT attempts, published_at, lease_owner, lease_expires_at,
           next_attempt_at, dead_lettered_at, dead_letter_attempts, last_error
    FROM outbox_events
    WHERE id = ${id}
  `;
  return rows.map((row) => ({
    ...row,
    published_at: row.published_at === null ? null : new Date(row.published_at),
    lease_expires_at: row.lease_expires_at === null ? null : new Date(row.lease_expires_at),
    next_attempt_at: new Date(row.next_attempt_at),
    dead_lettered_at: row.dead_lettered_at === null ? null : new Date(row.dead_lettered_at),
  }));
}

async function getJob<T = unknown>(queueName: string, jobId: string) {
  const queue = new Queue<T>(queueName, { connection: redisConnection });
  try {
    return await queue.getJob(jobId);
  } finally {
    await queue.close();
  }
}

async function jobCount(queueName: string): Promise<number> {
  const queue = new Queue(queueName, { connection: redisConnection });
  try {
    return await queue.count();
  } finally {
    await queue.close();
  }
}

function ulid(index: number): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  return `01J${'0'.repeat(22)}${alphabet[index]}`;
}

function manualClock(initial: string) {
  let now = new Date(initial);
  return {
    read: () => new Date(now),
    set: (instant: string) => {
      now = new Date(instant);
    },
  };
}

class BlockingQueues implements OutboxQueues {
  readonly publishStarted = deferred<void>();
  readonly release = deferred<void>();

  constructor(private readonly outcome: 'success' | 'failure') {}

  async publish(): Promise<void> {
    this.publishStarted.resolve();
    await this.release.promise;
    if (this.outcome === 'failure') {
      throw new Error('Authorization: Bearer stale-secret');
    }
  }

  async publishDead(): Promise<void> {}
  async close(): Promise<void> {}
}

class FailingQueues implements OutboxQueues {
  publishCalls = 0;

  async publish(): Promise<void> {
    this.publishCalls += 1;
    throw new Error('Cookie: session=secret; phone=13926548800; address=完整地址');
  }

  async publishDead(): Promise<void> {}
  async close(): Promise<void> {}
}

class RecoveringDeadQueues implements OutboxQueues {
  publishCalls = 0;
  deadPublishCalls = 0;

  constructor(private readonly delegate: OutboxQueues) {}

  async publish(): Promise<void> {
    this.publishCalls += 1;
    throw new Error('temporary normal queue failure');
  }

  async publishDead(queue: QueueName, data: DeadLetterJob): Promise<void> {
    this.deadPublishCalls += 1;
    await this.delegate.publishDead(queue, data);
  }

  close(): Promise<void> {
    return this.delegate.close();
  }
}

class IgnoreAcknowledgementStore implements OutboxStore {
  constructor(private readonly delegate: OutboxStore) {}

  claim(owner: string, now: Date, limit: number): Promise<readonly ClaimedOutboxEvent[]> {
    return this.delegate.claim(owner, now, limit);
  }

  claimDeadLetters(
    owner: string,
    now: Date,
    limit: number
  ): Promise<readonly ClaimedOutboxEvent[]> {
    return this.delegate.claimDeadLetters(owner, now, limit);
  }

  async confirmPublished(): Promise<boolean> {
    return false;
  }

  recordFailure(
    event: ClaimedOutboxEvent,
    owner: string,
    now: Date,
    reason: string
  ): Promise<'retry' | 'dead' | 'stale'> {
    return this.delegate.recordFailure(event, owner, now, reason);
  }

  confirmDeadLetter(event: ClaimedOutboxEvent, owner: string, now: Date): Promise<boolean> {
    return this.delegate.confirmDeadLetter(event, owner, now);
  }

  recordDeadLetterFailure(event: ClaimedOutboxEvent, owner: string, now: Date): Promise<boolean> {
    return this.delegate.recordDeadLetterFailure(event, owner, now);
  }

  close(): Promise<void> {
    return this.delegate.close();
  }
}

class BlockingDelegatingQueues implements OutboxQueues {
  readonly publishStarted = deferred<void>();
  readonly release = deferred<void>();
  closed = false;

  constructor(private readonly delegate: OutboxQueues) {}

  async publish(queue: QueueName, data: NormalOutboxJob): Promise<void> {
    this.publishStarted.resolve();
    await this.release.promise;
    await this.delegate.publish(queue, data);
  }

  publishDead(queue: QueueName, data: DeadLetterJob): Promise<void> {
    return this.delegate.publishDead(queue, data);
  }

  async close(): Promise<void> {
    await this.delegate.close();
    this.closed = true;
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value?: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
} {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve: resolvePromise as (value?: T | PromiseLike<T>) => void,
    reject: rejectPromise,
  };
}

function connectionUriFor(username: string, password: string): string {
  const url = new URL(postgresContainer.getConnectionUri());
  url.username = username;
  url.password = password;
  return url.toString();
}

function redisUriFor(username: string, password: string): string {
  const url = new URL(redisUrl);
  url.username = username;
  url.password = password;
  return url.toString();
}
