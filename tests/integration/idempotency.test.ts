import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { ConflictException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { defer, lastValueFrom } from 'rxjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuthenticatedPrincipal } from '@zhili/auth';
import { IdempotencyInterceptor } from '../../apps/api/src/platform/idempotency';
import {
  buildRequestContext,
  type PrincipalRequest,
} from '../../apps/api/src/platform/request-context';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const migrationsFolder = resolve(repositoryRoot, 'packages/db/migrations');
const appRole = 'zhili_app';
const appPassword = 'integration-only-password';
const tenantId = '01J0000000000000000000000A';
const subjectId = '01J0000000000000000000001A';
const tenantB = '01J0000000000000000000000B';
const subjectB = '01J0000000000000000000001B';
const idempotentHandlerMetadataKey = 'zhili:idempotent-command';

let container: StartedPostgreSqlContainer;
let admin: Sql;
let app: Sql;
let database: typeof import('@zhili/db');

class TestReply {
  statusCode = 200;
  readonly headers: Record<string, string | readonly string[]> = {};

  status(statusCode: number): this {
    this.statusCode = statusCode;
    return this;
  }

  header(name: string, value: string | readonly string[]): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  getHeaders(): Record<string, string | readonly string[]> {
    return { ...this.headers };
  }

  removeHeader(name: string): this {
    delete this.headers[name.toLowerCase()];
    return this;
  }
}

function connectionUriFor(username: string, password: string): string {
  const uri = new URL(container.getConnectionUri());
  uri.username = username;
  uri.password = password;
  return uri.toString();
}

function executionContext(request: Record<string, unknown>, reply: TestReply): ExecutionContext {
  class TestController {}
  const handler = () => undefined;
  Reflect.defineMetadata(idempotentHandlerMetadataKey, true, handler);

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
      getNext: () => undefined,
    }),
    getClass: () => TestController,
    getHandler: () => handler,
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

async function invoke(
  interceptor: IdempotencyInterceptor,
  options: {
    body: unknown;
    key: string;
    requestId: string;
    handler: (reply: TestReply) => Promise<unknown>;
    subjectId?: string;
    tenantId?: string;
  }
): Promise<{ body: unknown; headers: Record<string, string | readonly string[]>; status: number }> {
  const invokingTenant = options.tenantId ?? tenantId;
  const invokingSubject = options.subjectId ?? subjectId;
  const principal = createAuthenticatedPrincipal({
    tenantId: invokingTenant,
    subjectId: invokingSubject,
    permissions: ['waybill:write'],
  });
  const request: Record<string, unknown> = {
    body: options.body,
    headers: { 'idempotency-key': options.key, 'x-request-id': options.requestId },
    principal,
  };
  request.requestContext = buildRequestContext(request as unknown as PrincipalRequest);
  const reply = new TestReply();
  const next: CallHandler = {
    handle: () => defer(() => options.handler(reply)),
  };

  const body = await lastValueFrom(interceptor.intercept(executionContext(request, reply), next));
  return { body, headers: reply.getHeaders(), status: reply.statusCode };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  admin = postgres(container.getConnectionUri(), { max: 1 });
  await migrate(drizzle(admin), { migrationsFolder });
  await admin.unsafe(`ALTER ROLE ${appRole} WITH LOGIN PASSWORD '${appPassword}'`);

  const appUrl = connectionUriFor(appRole, appPassword);
  process.env.DATABASE_URL = appUrl;
  app = postgres(appUrl, { max: 1 });
  database = await import('@zhili/db');
});

beforeEach(async () => {
  await admin`TRUNCATE idempotency_records, outbox_events`;
});

afterAll(async () => {
  if (database) await database.closeDatabaseClient();
  if (app) await app.end();
  if (admin) await admin.end();
  if (container) await container.stop();
  delete process.env.DATABASE_URL;
});

describe('PostgreSQL idempotency pipeline', () => {
  it('replays the exact status, headers and body for the same canonical body', async () => {
    const interceptor = new IdempotencyInterceptor();
    let executions = 0;
    const handler = async (reply: TestReply) => {
      executions += 1;
      reply.status(201).header('etag', '"7"').header('location', '/api/v1/waybills/7');
      return { data: { id: 'waybill-7', version: 7 } };
    };

    const first = await invoke(interceptor, {
      key: 'same-command-key-0001',
      body: { nested: { b: 2, a: 1 }, action: 'create' },
      requestId: 'request-first',
      handler,
    });
    const replay = await invoke(interceptor, {
      key: 'same-command-key-0001',
      body: { action: 'create', nested: { a: 1, b: 2 } },
      requestId: 'request-replay',
      handler,
    });

    expect(executions).toBe(1);
    expect(replay).toEqual(first);
    expect(replay).toEqual({
      body: { data: { id: 'waybill-7', version: 7 } },
      headers: {
        etag: '"7"',
        location: '/api/v1/waybills/7',
        'x-request-id': 'request-first',
      },
      status: 201,
    });
  });

  it('returns 409 when a tenant reuses a key with a different body', async () => {
    const interceptor = new IdempotencyInterceptor();
    const handler = async () => ({ accepted: true });

    await invoke(interceptor, {
      key: 'conflicting-key-0001',
      body: { command: 'first' },
      requestId: 'request-conflict-first',
      handler,
    });

    await expect(
      invoke(interceptor, {
        key: 'conflicting-key-0001',
        body: { command: 'different' },
        requestId: 'request-conflict-second',
        handler,
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('serializes concurrent duplicate keys with a PostgreSQL transaction advisory lock', async () => {
    const interceptor = new IdempotencyInterceptor();
    let executions = 0;
    const handler = async (reply: TestReply) => {
      executions += 1;
      await delay(100);
      reply.status(202).header('x-command-result', 'accepted-once');
      return { accepted: true, sequence: executions };
    };

    const [first, duplicate] = await Promise.all([
      invoke(interceptor, {
        key: 'concurrent-key-0001',
        body: { command: 'dispatch', payload: { z: 1, a: 2 } },
        requestId: 'request-concurrent-1',
        handler,
      }),
      invoke(interceptor, {
        key: 'concurrent-key-0001',
        body: { payload: { a: 2, z: 1 }, command: 'dispatch' },
        requestId: 'request-concurrent-2',
        handler,
      }),
    ]);

    expect(executions).toBe(1);
    expect(duplicate).toEqual(first);

    const visibleInsideTenant = await database.withTenantTransaction(
      {
        tenantId,
        subjectId,
        requestId: 'request-inspect',
        permissions: ['idempotency:read'],
      },
      async (tx) =>
        [
          ...(await tx.execute<{ count: string }>(
            // The transaction itself establishes the RLS tenant identity.
            (await import('drizzle-orm'))
              .sql`SELECT count(*)::text AS count FROM idempotency_records`
          )),
        ][0]?.count
    );
    const visibleWithoutTenant = await app<{ count: string }[]>`
      SELECT count(*)::text AS count FROM idempotency_records
    `;

    expect(visibleInsideTenant).toBe('1');
    expect(visibleWithoutTenant[0]?.count).toBe('0');
  });

  it('uses the outer request UoW so an idempotency persistence failure rolls back business writes', async () => {
    const interceptor = new IdempotencyInterceptor();

    await expect(
      invoke(interceptor, {
        key: 'rollback-after-write-0001',
        body: { command: 'write-then-fail-persistence' },
        requestId: 'request-rollback-uow',
        handler: async () => {
          await database.withTenantTransaction(
            {
              tenantId,
              subjectId,
              requestId: 'request-rollback-uow',
              permissions: ['waybill:write'],
            },
            async (tx) => {
              await tx.execute(sql`
                INSERT INTO outbox_events (
                  id, tenant_id, aggregate_type, aggregate_id, aggregate_version,
                  event_type, payload, dedupe_key
                ) VALUES (
                  '01J0000000000000000000090A', ${tenantId}, 'waybill',
                  '01J0000000000000000000091A', 1, 'WaybillCreated',
                  '{}'::jsonb, 'rollback-after-write-0001'
                )
              `);
            }
          );
          return { cannotPersistAsJson: 1n };
        },
      })
    ).rejects.toThrow();

    const [counts] = await admin<{ idempotency_count: string; outbox_count: string }[]>`
      SELECT
        (SELECT count(*)::text FROM idempotency_records) AS idempotency_count,
        (SELECT count(*)::text FROM outbox_events) AS outbox_count
    `;
    expect(counts).toEqual({ idempotency_count: '0', outbox_count: '0' });
  });

  it('rolls back deterministic 4xx side effects then stores and exactly replays the problem', async () => {
    const interceptor = new IdempotencyInterceptor();
    let executions = 0;
    const handler = async (reply: TestReply) => {
      executions += 1;
      await database.withTenantTransaction(
        {
          tenantId,
          subjectId,
          requestId: 'request-deterministic-4xx',
          permissions: ['waybill:write'],
        },
        async (tx) => {
          await tx.execute(sql`
            INSERT INTO outbox_events (
              id, tenant_id, aggregate_type, aggregate_id, aggregate_version,
              event_type, payload, dedupe_key
            ) VALUES (
              '01J0000000000000000000092A', ${tenantId}, 'waybill',
              '01J0000000000000000000093A', 1, 'WaybillRejected',
              '{}'::jsonb, 'deterministic-4xx-side-effect'
            )
          `);
        }
      );
      reply.header('etag', '"8"');
      throw new ConflictException({
        code: 'STATE_TRANSITION_NOT_ALLOWED',
        detail: 'The waybill is already cancelled.',
        remediation: 'Refresh the waybill before choosing another action.',
      });
    };

    const first = await invoke(interceptor, {
      key: 'deterministic-4xx-0001',
      body: { action: 'cancel' },
      requestId: 'request-deterministic-4xx',
      handler,
    });
    const replay = await invoke(interceptor, {
      key: 'deterministic-4xx-0001',
      body: { action: 'cancel' },
      requestId: 'request-deterministic-replay',
      handler,
    });

    expect(executions).toBe(1);
    expect(replay).toEqual(first);
    expect(first).toEqual({
      status: 409,
      headers: {
        'content-type': 'application/problem+json',
        etag: '"8"',
        'x-request-id': 'request-deterministic-4xx',
      },
      body: {
        code: 'STATE_TRANSITION_NOT_ALLOWED',
        detail: 'The waybill is already cancelled.',
        remediation: 'Refresh the waybill before choosing another action.',
        requestId: 'request-deterministic-4xx',
      },
    });

    const [counts] = await admin<{ idempotency_count: string; outbox_count: string }[]>`
      SELECT
        (SELECT count(*)::text FROM idempotency_records) AS idempotency_count,
        (SELECT count(*)::text FROM outbox_events) AS outbox_count
    `;
    expect(counts).toEqual({ idempotency_count: '1', outbox_count: '0' });
  });

  it('does not cache unknown 500 failures', async () => {
    const interceptor = new IdempotencyInterceptor();
    let executions = 0;
    const handler = async () => {
      executions += 1;
      throw new Error('transient internal failure');
    };

    for (const requestId of ['request-500-first', 'request-500-second']) {
      await expect(
        invoke(interceptor, {
          key: 'unknown-500-key-0001',
          body: { command: 'retryable' },
          requestId,
          handler,
        })
      ).rejects.toThrow('transient internal failure');
    }

    const [recordCount] = await admin<{ count: string }[]>`
      SELECT count(*)::text AS count FROM idempotency_records
    `;
    expect(executions).toBe(2);
    expect(recordCount?.count).toBe('0');
  });

  it('scopes identical keys independently by tenant', async () => {
    const interceptor = new IdempotencyInterceptor();
    let executions = 0;
    const handler = async () => ({ execution: ++executions });

    const tenantAResult = await invoke(interceptor, {
      key: 'cross-tenant-key-0001',
      body: { tenantPayload: 'A' },
      requestId: 'request-tenant-a',
      handler,
    });
    const tenantBResult = await invoke(interceptor, {
      key: 'cross-tenant-key-0001',
      body: { tenantPayload: 'B' },
      requestId: 'request-tenant-b',
      tenantId: tenantB,
      subjectId: subjectB,
      handler,
    });

    expect(executions).toBe(2);
    expect(tenantAResult.body).toEqual({ execution: 1 });
    expect(tenantBResult.body).toEqual({ execution: 2 });
  });

  it('persists and replays only allowlisted response headers', async () => {
    const interceptor = new IdempotencyInterceptor();
    let executions = 0;
    const handler = async (reply: TestReply) => {
      executions += 1;
      reply
        .status(201)
        .header('etag', '"9"')
        .header('location', '/api/v1/waybills/9')
        .header('set-cookie', 'session=secret')
        .header('connection', 'keep-alive')
        .header('transfer-encoding', 'chunked')
        .header('x-internal-debug', 'secret-debug');
      return { created: true };
    };

    const first = await invoke(interceptor, {
      key: 'safe-headers-key-0001',
      body: { command: 'create' },
      requestId: 'request-safe-headers',
      handler,
    });
    const replay = await invoke(interceptor, {
      key: 'safe-headers-key-0001',
      body: { command: 'create' },
      requestId: 'request-safe-headers-replay',
      handler,
    });

    expect(executions).toBe(1);
    expect(replay).toEqual(first);
    expect(first.headers).toEqual({
      etag: '"9"',
      location: '/api/v1/waybills/9',
      'x-request-id': 'request-safe-headers',
    });

    const [stored] = await admin<{ response_headers: Record<string, unknown> }[]>`
      SELECT response_headers FROM idempotency_records
    `;
    expect(stored?.response_headers).toEqual(first.headers);
  });

  it('exactly replays an undefined response body', async () => {
    const interceptor = new IdempotencyInterceptor();
    let executions = 0;
    const handler = async (reply: TestReply) => {
      executions += 1;
      reply.status(204);
      return undefined;
    };

    const first = await invoke(interceptor, {
      key: 'undefined-body-key-0001',
      body: { command: 'delete' },
      requestId: 'request-undefined-body',
      handler,
    });
    const replay = await invoke(interceptor, {
      key: 'undefined-body-key-0001',
      body: { command: 'delete' },
      requestId: 'request-undefined-body-replay',
      handler,
    });

    expect(executions).toBe(1);
    expect(first.body).toBeUndefined();
    expect(replay).toEqual(first);
  });
});
