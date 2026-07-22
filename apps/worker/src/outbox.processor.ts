import { randomUUID } from 'node:crypto';
import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import postgres, { type Sql } from 'postgres';
import { createLogger, redact, type Logger } from '@zhili/observability';

export const OUTBOX_QUEUE_NAMES = [
  'imports',
  'print',
  'notifications',
  'tracking',
  'connectors',
  'ai',
  'reports',
] as const;

export type QueueName = (typeof OUTBOX_QUEUE_NAMES)[number];

export interface ClaimedOutboxEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly traceId?: string;
  readonly attempt: number;
}

export interface NormalOutboxJob {
  readonly outboxId: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly aggregate: {
    readonly type: string;
    readonly id: string;
    readonly version: string;
  };
  readonly payload: unknown;
  readonly attempt: number;
  readonly traceId?: string;
}

export interface DeadLetterJob {
  readonly outboxId: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly attempt: number;
  readonly reason: FailureReason;
  readonly traceId?: string;
}

export interface OutboxStore {
  claim(owner: string, now: Date, limit: number): Promise<readonly ClaimedOutboxEvent[]>;
  confirmPublished(event: ClaimedOutboxEvent, owner: string, now: Date): Promise<boolean>;
  recordFailure(
    event: ClaimedOutboxEvent,
    owner: string,
    now: Date,
    reason: string
  ): Promise<'retry' | 'dead' | 'stale'>;
  close(): Promise<void>;
}

export interface OutboxQueues {
  publish(queue: QueueName, data: NormalOutboxJob): Promise<void>;
  publishDead(queue: QueueName, data: DeadLetterJob): Promise<void>;
  close(): Promise<void>;
}

export interface TickResult {
  readonly claimed: number;
  readonly published: number;
  readonly failed: number;
  readonly deadLettered: number;
}

export interface OutboxPublisherOptions {
  readonly databaseUrl?: string;
  readonly redisUrl?: string;
  readonly store?: OutboxStore;
  readonly queues?: OutboxQueues;
  readonly ownerId?: string;
  readonly batchSize?: number;
  readonly clock?: () => Date;
  readonly logger?: Logger;
}

type FailureReason = 'QUEUE_PUBLISH_FAILED' | 'UNSUPPORTED_EVENT_TYPE';

interface DatabaseOutboxEvent {
  id: string;
  tenant_id: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: string | bigint;
  event_type: string;
  payload: unknown;
  trace_id: string | null;
  attempts: number;
}

const DEFAULT_BATCH_SIZE = 100;
const LEASE_DURATION_MS = 30_000;
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 5 * 60 * 1_000;
const EMPTY_TICK_RESULT: TickResult = {
  claimed: 0,
  published: 0,
  failed: 0,
  deadLettered: 0,
};
const QUEUE_NAME_SET = new Set<string>(OUTBOX_QUEUE_NAMES);
const EVENT_TYPE_PATTERN = /^([a-z]+)\.([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*)$/;
const SAFE_TRACE_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const JOB_DEFAULTS: JobsOptions = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 50_000 },
};

/** Event types use `<queue>.<lowercase-event-name>`; unsupported prefixes are quarantined. */
export function queueForEventType(eventType: string): QueueName | undefined {
  const match = EVENT_TYPE_PATTERN.exec(eventType);
  if (!match || !QUEUE_NAME_SET.has(match[1]!)) return undefined;
  return match[1] as QueueName;
}

export function backoffDelayMs(attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new RangeError('attempt must be a positive integer');
  }
  return Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** (attempt - 1));
}

export class PostgresOutboxStore implements OutboxStore {
  private readonly sql: Sql;
  private closePromise: Promise<void> | undefined;

  constructor(databaseUrl: string, options: { readonly applicationName?: string } = {}) {
    const applicationName = options.applicationName ?? 'zhili-outbox-worker';
    this.sql = postgres(databaseUrl, {
      max: 4,
      connection: { application_name: applicationName },
    });
  }

  async claim(owner: string, now: Date, limit: number): Promise<readonly ClaimedOutboxEvent[]> {
    const nowIso = now.toISOString();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS).toISOString();
    const rows = await this.sql.begin(async (tx) => {
      return tx<DatabaseOutboxEvent[]>`
        WITH claimable AS (
          SELECT id
          FROM outbox_events
          WHERE published_at IS NULL
            AND dead_lettered_at IS NULL
            AND attempts < ${MAX_ATTEMPTS}
            AND next_attempt_at <= ${nowIso}
            AND (lease_owner IS NULL OR lease_expires_at <= ${nowIso})
          ORDER BY next_attempt_at, occurred_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        UPDATE outbox_events AS event
        SET lease_owner = ${owner},
            lease_expires_at = ${leaseExpiresAt},
            attempts = event.attempts + 1
        FROM claimable
        WHERE event.id = claimable.id
        RETURNING event.id, event.tenant_id, event.aggregate_type, event.aggregate_id,
                  event.aggregate_version, event.event_type, event.payload,
                  event.trace_id, event.attempts
      `;
    });

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      aggregateVersion: String(row.aggregate_version),
      eventType: row.event_type,
      payload: row.payload,
      ...(row.trace_id === null ? {} : { traceId: row.trace_id }),
      attempt: row.attempts,
    }));
  }

  async confirmPublished(event: ClaimedOutboxEvent, owner: string, now: Date): Promise<boolean> {
    const nowIso = now.toISOString();
    const rows = await this.sql.begin(async (tx) => {
      return tx<{ id: string }[]>`
        UPDATE outbox_events
        SET published_at = ${nowIso},
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error = NULL
        WHERE id = ${event.id}
          AND lease_owner = ${owner}
          AND attempts = ${event.attempt}
          AND published_at IS NULL
          AND dead_lettered_at IS NULL
        RETURNING id
      `;
    });
    return rows.length === 1;
  }

  async recordFailure(
    event: ClaimedOutboxEvent,
    owner: string,
    now: Date,
    reason: string
  ): Promise<'retry' | 'dead' | 'stale'> {
    const safeReason = normalizeFailureReason(reason);
    const terminal = event.attempt >= MAX_ATTEMPTS;
    const nowIso = now.toISOString();
    const nextAttemptAt = new Date(now.getTime() + backoffDelayMs(event.attempt)).toISOString();
    const rows = await this.sql.begin(async (tx) => {
      return tx<{ dead_lettered_at: Date | null }[]>`
        UPDATE outbox_events
        SET lease_owner = NULL,
            lease_expires_at = NULL,
            last_error = ${safeReason},
            next_attempt_at = ${nextAttemptAt},
            dead_lettered_at = ${terminal ? nowIso : null}
        WHERE id = ${event.id}
          AND lease_owner = ${owner}
          AND attempts = ${event.attempt}
          AND published_at IS NULL
          AND dead_lettered_at IS NULL
        RETURNING dead_lettered_at
      `;
    });
    if (rows.length === 0) return 'stale';
    return rows[0]!.dead_lettered_at === null ? 'retry' : 'dead';
  }

  close(): Promise<void> {
    this.closePromise ??= this.sql.end();
    return this.closePromise;
  }
}

export class BullMqOutboxQueues implements OutboxQueues {
  private readonly redis: IORedis;
  private readonly queues = new Map<string, Queue>();
  private closePromise: Promise<void> | undefined;

  constructor(redisUrl: string, options: { readonly connectionName?: string } = {}) {
    this.redis = new IORedis(redisUrl, {
      connectionName: options.connectionName ?? 'zhili-outbox-worker',
      maxRetriesPerRequest: 1,
    });
  }

  async publish(queue: QueueName, data: NormalOutboxJob): Promise<void> {
    await this.getQueue(queue).add('outbox-event', data, { jobId: data.outboxId });
  }

  async publishDead(queue: QueueName, data: DeadLetterJob): Promise<void> {
    await this.getQueue(`${queue}.dead`).add('outbox-dead-letter', data, {
      jobId: data.outboxId,
    });
  }

  close(): Promise<void> {
    this.closePromise ??= (async () => {
      await Promise.all([...this.queues.values()].map((queue) => queue.close()));
      if (this.redis.status !== 'end') await this.redis.quit();
    })();
    return this.closePromise;
  }

  private getQueue(name: string): Queue {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection: this.redis,
        defaultJobOptions: JOB_DEFAULTS,
      });
      this.queues.set(name, queue);
    }
    return queue;
  }
}

export class OutboxPublisher {
  private readonly store: OutboxStore;
  private readonly queues: OutboxQueues;
  private readonly ownerId: string;
  private readonly batchSize: number;
  private readonly clock: () => Date;
  private readonly logger: Logger;
  private readonly activeTicks = new Set<Promise<TickResult>>();
  private stopping = false;
  private polling = false;
  private pollTimer: NodeJS.Timeout | undefined;
  private closePromise: Promise<void> | undefined;

  constructor(options: OutboxPublisherOptions) {
    this.ownerId = options.ownerId?.trim() || randomUUID();
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    validateLimit(this.batchSize);
    this.clock = options.clock ?? (() => new Date());
    this.logger = options.logger ?? createLogger({ name: 'zhili-outbox-worker' });

    const hasInjectedDependencies = options.store !== undefined || options.queues !== undefined;
    if (hasInjectedDependencies) {
      if (!options.store || !options.queues) {
        throw new Error('store and queues must be supplied together');
      }
      this.store = options.store;
      this.queues = options.queues;
      return;
    }

    if (!options.databaseUrl || !options.redisUrl) {
      throw new Error('databaseUrl and redisUrl are required');
    }
    this.store = new PostgresOutboxStore(options.databaseUrl, {
      applicationName: `zhili-outbox-${this.ownerId.slice(0, 32)}`,
    });
    this.queues = new BullMqOutboxQueues(options.redisUrl, {
      connectionName: `zhili-outbox-${this.ownerId.slice(0, 32)}`,
    });
  }

  tick(limit = this.batchSize): Promise<TickResult> {
    try {
      validateLimit(limit);
    } catch (error) {
      return Promise.reject(error);
    }
    if (this.stopping) return Promise.resolve(EMPTY_TICK_RESULT);

    const operation = this.runTick(limit);
    this.activeTicks.add(operation);
    void operation.then(
      () => this.activeTicks.delete(operation),
      () => this.activeTicks.delete(operation)
    );
    return operation;
  }

  start(pollIntervalMs = 1_000): void {
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1) {
      throw new RangeError('pollIntervalMs must be a positive integer');
    }
    if (this.polling || this.stopping) return;
    this.polling = true;
    this.schedulePoll(0, pollIntervalMs);
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.stopping = true;
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);

    this.closePromise = (async () => {
      await Promise.allSettled([...this.activeTicks]);
      try {
        await this.queues.close();
      } finally {
        await this.store.close();
      }
    })();
    return this.closePromise;
  }

  private async runTick(limit: number): Promise<TickResult> {
    const leaseOwner = `${this.ownerId}:${randomUUID()}`;
    const claimed = await this.store.claim(leaseOwner, currentTime(this.clock), limit);
    const result = { claimed: claimed.length, published: 0, failed: 0, deadLettered: 0 };

    for (const event of claimed) {
      const outcome = await this.publishEvent(event, leaseOwner);
      result.published += outcome.published;
      result.failed += outcome.failed;
      result.deadLettered += outcome.deadLettered;
    }
    return result;
  }

  private async publishEvent(
    event: ClaimedOutboxEvent,
    leaseOwner: string
  ): Promise<Omit<TickResult, 'claimed'>> {
    const queue = queueForEventType(event.eventType);
    if (!queue) {
      return this.persistFailure(event, leaseOwner, 'UNSUPPORTED_EVENT_TYPE', undefined);
    }

    try {
      await this.queues.publish(queue, normalJob(event));
    } catch {
      return this.persistFailure(event, leaseOwner, 'QUEUE_PUBLISH_FAILED', queue);
    }

    const acknowledged = await this.store.confirmPublished(
      event,
      leaseOwner,
      currentTime(this.clock)
    );
    if (!acknowledged) {
      this.logger.warn(
        { outboxId: event.id, attempt: event.attempt, reason: 'STALE_LEASE' },
        'Outbox acknowledgement ignored'
      );
    }
    return { published: acknowledged ? 1 : 0, failed: 0, deadLettered: 0 };
  }

  private async persistFailure(
    event: ClaimedOutboxEvent,
    leaseOwner: string,
    reason: FailureReason,
    queue: QueueName | undefined
  ): Promise<Omit<TickResult, 'claimed'>> {
    const persistence = await this.store.recordFailure(
      event,
      leaseOwner,
      currentTime(this.clock),
      reason
    );
    if (persistence === 'stale') {
      this.logger.warn(
        { outboxId: event.id, attempt: event.attempt, reason: 'STALE_LEASE' },
        'Outbox failure ignored'
      );
      return { published: 0, failed: 0, deadLettered: 0 };
    }

    this.logger.warn(
      { outboxId: event.id, attempt: event.attempt, reason },
      persistence === 'dead' ? 'Outbox event dead-lettered' : 'Outbox event scheduled for retry'
    );
    if (persistence === 'retry') {
      return { published: 0, failed: 1, deadLettered: 0 };
    }

    const deadQueue = queue ?? 'reports';
    try {
      await this.queues.publishDead(deadQueue, deadLetterJob(event, reason, queue !== undefined));
    } catch {
      this.logger.error(
        { outboxId: event.id, attempt: event.attempt, reason: 'DEAD_QUEUE_PUBLISH_FAILED' },
        'Dead-letter queue publication failed'
      );
    }
    return { published: 0, failed: 1, deadLettered: 1 };
  }

  private schedulePoll(delayMs: number, intervalMs: number): void {
    this.pollTimer = setTimeout(() => {
      if (this.stopping) return;
      void this.tick().then(
        () => {
          if (!this.stopping) this.schedulePoll(intervalMs, intervalMs);
        },
        () => {
          this.logger.error({ reason: 'OUTBOX_TICK_FAILED' }, 'Outbox polling tick failed');
          if (!this.stopping) this.schedulePoll(intervalMs, intervalMs);
        }
      );
    }, delayMs);
  }
}

function normalJob(event: ClaimedOutboxEvent): NormalOutboxJob {
  return {
    outboxId: event.id,
    tenantId: event.tenantId,
    eventType: event.eventType,
    aggregate: {
      type: event.aggregateType,
      id: event.aggregateId,
      version: event.aggregateVersion,
    },
    payload: event.payload,
    attempt: event.attempt,
    ...(safeTraceId(event.traceId) === undefined ? {} : { traceId: safeTraceId(event.traceId) }),
  };
}

function deadLetterJob(
  event: ClaimedOutboxEvent,
  reason: FailureReason,
  eventTypeIsSupported: boolean
): DeadLetterJob {
  const traceId = safeTraceId(event.traceId);
  return {
    outboxId: event.id,
    tenantId: event.tenantId,
    eventType: eventTypeIsSupported ? safeMetadata(event.eventType) : 'UNSUPPORTED_EVENT_TYPE',
    attempt: event.attempt,
    reason,
    ...(traceId === undefined ? {} : { traceId }),
  };
}

function safeTraceId(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return SAFE_TRACE_PATTERN.test(value) ? value : '[REDACTED]';
}

function safeMetadata(value: string): string {
  return redact(value).slice(0, 256);
}

function normalizeFailureReason(value: string): FailureReason {
  return value === 'UNSUPPORTED_EVENT_TYPE' ? value : 'QUEUE_PUBLISH_FAILED';
}

function currentTime(clock: () => Date): Date {
  const value = clock();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('clock must return a valid Date');
  }
  return new Date(value);
}

function validateLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('limit must be an integer between 1 and 100');
  }
}
