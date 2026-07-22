import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const postgresFactory = vi.hoisted(() => vi.fn());

vi.mock('postgres', () => ({ default: postgresFactory }));

interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason: unknown) => void;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function fakeSqlClient(end: () => Promise<void>) {
  return Object.assign(vi.fn(), {
    end: vi.fn(end),
    options: { parsers: {}, serializers: {} },
  });
}

beforeEach(() => {
  vi.resetModules();
  postgresFactory.mockReset();
  process.env.DATABASE_URL = 'postgresql://zhili_app@localhost:5432/zhili_test';
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe('database client lifecycle', () => {
  it('fails closed while one shared close promise drains the active pool', async () => {
    const end = deferred<void>();
    const firstSqlClient = fakeSqlClient(() => end.promise);
    postgresFactory.mockReturnValueOnce(firstSqlClient);
    const databaseClient = await import('../src/client');

    const firstDatabase = databaseClient.getDatabaseClient();
    const firstClose = databaseClient.closeDatabaseClient();
    const concurrentClose = databaseClient.closeDatabaseClient();

    try {
      expect(concurrentClose).toBe(firstClose);
      expect(firstSqlClient.end).toHaveBeenCalledTimes(1);
      expect(() => databaseClient.getDatabaseClient()).toThrow(/closing/i);
    } finally {
      end.resolve();
      await Promise.allSettled([firstClose, concurrentClose]);
    }

    const secondSqlClient = fakeSqlClient(async () => undefined);
    postgresFactory.mockReturnValueOnce(secondSqlClient);
    expect(databaseClient.getDatabaseClient()).not.toBe(firstDatabase);
    expect(postgresFactory).toHaveBeenCalledTimes(2);
  });

  it('clears lifecycle state after close rejects so a new pool can be created', async () => {
    const closeFailure = new Error('pool close failed');
    const firstSqlClient = fakeSqlClient(async () => {
      throw closeFailure;
    });
    postgresFactory.mockReturnValueOnce(firstSqlClient);
    const databaseClient = await import('../src/client');
    const firstDatabase = databaseClient.getDatabaseClient();

    await expect(databaseClient.closeDatabaseClient()).rejects.toBe(closeFailure);

    const secondSqlClient = fakeSqlClient(async () => undefined);
    postgresFactory.mockReturnValueOnce(secondSqlClient);
    expect(databaseClient.getDatabaseClient()).not.toBe(firstDatabase);
    expect(postgresFactory).toHaveBeenCalledTimes(2);
  });
});
