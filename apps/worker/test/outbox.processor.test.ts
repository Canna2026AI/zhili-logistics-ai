import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import {
  OutboxPublisher,
  backoffDelayMs,
  queueForEventType,
  type ClaimedOutboxEvent,
  type OutboxQueues,
  type OutboxStore,
} from '../src/outbox.processor';
import { OUTBOX_PUBLISHER, WorkerModule } from '../src/worker.module';

const queueRoutes = [
  ['imports.received', 'imports'],
  ['print.label-requested', 'print'],
  ['notifications.sms-requested', 'notifications'],
  ['tracking.location-recorded', 'tracking'],
  ['connectors.erp-requested', 'connectors'],
  ['ai.summary-requested', 'ai'],
  ['reports.daily-requested', 'reports'],
] as const;

describe('outbox routing and retry policy', () => {
  it.each(queueRoutes)('routes %s to %s', (eventType, queue) => {
    expect(queueForEventType(eventType)).toBe(queue);
  });

  it.each([
    '',
    'imports',
    'imports.',
    'Imports.received',
    'unknown.received',
    'reports..requested',
  ])('rejects unsupported event type %j', (eventType) => {
    expect(queueForEventType(eventType)).toBeUndefined();
  });

  it.each([
    [1, 1_000],
    [2, 2_000],
    [3, 4_000],
    [4, 8_000],
    [5, 16_000],
    [10, 300_000],
  ])('uses deterministic capped backoff for attempt %i', (attempt, expected) => {
    expect(backoffDelayMs(attempt)).toBe(expected);
  });
});

describe('OutboxPublisher validation and lifecycle', () => {
  it.each([0, 101, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid limit %s before database access',
    async (limit) => {
      const store = new FakeStore();
      const publisher = new OutboxPublisher({
        store,
        queues: new FakeQueues(),
        ownerId: 'unit-publisher',
      });

      await expect(publisher.tick(limit)).rejects.toThrow('limit');
      expect(store.claimCalls).toBe(0);
      await publisher.close();
    }
  );

  it('defaults the claim batch size to 100', async () => {
    const store = new FakeStore();
    const publisher = new OutboxPublisher({
      store,
      queues: new FakeQueues(),
      ownerId: 'unit-publisher',
    });

    await publisher.tick();

    expect(store.lastLimit).toBe(100);
    await publisher.close();
  });

  it('drains an in-flight tick and refuses new claims after shutdown starts', async () => {
    const claimed = deferred<readonly ClaimedOutboxEvent[]>();
    const store = new FakeStore(claimed.promise);
    const queues = new FakeQueues();
    const publisher = new OutboxPublisher({ store, queues, ownerId: 'unit-publisher' });
    const tick = publisher.tick();
    const startOutcome = await Promise.race([
      store.claimStarted.promise.then(() => 'claim-started' as const),
      tick.then(
        () => 'tick-settled' as const,
        () => 'tick-settled' as const
      ),
    ]);
    expect(startOutcome).toBe('claim-started');

    const close = publisher.close();
    let closeSettled = false;
    void close.then(() => {
      closeSettled = true;
    });
    await Promise.resolve();
    expect(closeSettled).toBe(false);

    claimed.resolve([]);
    await expect(tick).resolves.toMatchObject({ claimed: 0 });
    await close;
    await expect(publisher.tick()).resolves.toMatchObject({ claimed: 0 });

    expect(store.claimCalls).toBe(1);
    expect(store.closed).toBe(true);
    expect(queues.closed).toBe(true);
  });

  it('declares production runtime dependencies and a node artifact start path', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8')
    ) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.build).toBe('node scripts/build.mjs');
    expect(packageJson.scripts?.start).toBe('node dist/main.js');
    expect(packageJson.dependencies).toMatchObject({
      '@nestjs/core': expect.any(String),
      '@zhili/config': expect.any(String),
      '@zhili/observability': expect.any(String),
      bullmq: expect.any(String),
      ioredis: expect.any(String),
      postgres: expect.any(String),
    });
  });

  it('uses the production Redis 8 integration image', async () => {
    const source = await readFile(resolve(import.meta.dirname, 'redis-container.ts'), 'utf8');

    expect(source).toContain('redis:8-alpine');
  });
});

describe('WorkerModule lifecycle', () => {
  it('starts polling on initialization and awaits publisher close on shutdown', async () => {
    const close = deferred<void>();
    const closeStarted = deferred<void>();
    const publisher = {
      startCalls: 0,
      closeCalls: 0,
      start() {
        this.startCalls += 1;
      },
      async close() {
        this.closeCalls += 1;
        closeStarted.resolve();
        await close.promise;
      },
    };
    const module = await Test.createTestingModule({ imports: [WorkerModule] })
      .overrideProvider(OUTBOX_PUBLISHER)
      .useValue(publisher)
      .compile();

    await module.init();
    expect(publisher.startCalls).toBe(1);
    const shutdown = module.close();
    await closeStarted.promise;
    expect(publisher.closeCalls).toBe(1);
    close.resolve();
    await shutdown;
  });
});

class FakeStore implements OutboxStore {
  claimCalls = 0;
  lastLimit: number | undefined;
  closed = false;
  readonly claimStarted = deferred<void>();

  constructor(
    private readonly claimResult: Promise<readonly ClaimedOutboxEvent[]> = Promise.resolve([])
  ) {}

  async claim(_owner: string, _now: Date, limit: number): Promise<readonly ClaimedOutboxEvent[]> {
    this.claimCalls += 1;
    this.lastLimit = limit;
    this.claimStarted.resolve();
    return this.claimResult;
  }

  async claimDeadLetters(): Promise<readonly ClaimedOutboxEvent[]> {
    return [];
  }

  async confirmPublished(): Promise<boolean> {
    return true;
  }

  async recordFailure(): Promise<'retry' | 'dead' | 'stale'> {
    return 'retry';
  }

  async confirmDeadLetter(): Promise<boolean> {
    return true;
  }

  async recordDeadLetterFailure(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeQueues implements OutboxQueues {
  closed = false;

  async publish(): Promise<void> {}
  async publishDead(): Promise<void> {}

  async close(): Promise<void> {
    this.closed = true;
  }
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
} {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
