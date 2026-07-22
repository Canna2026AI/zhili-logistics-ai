import 'reflect-metadata';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Module,
  Post,
  Req,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicRoute, RequirePermissions, createAuthenticatedPrincipal } from '@zhili/auth';
import { loadEnv } from '@zhili/config';
import type { RequestContext } from '../src/platform/request-context';
import { ContractOperation } from '../src/platform/contract-operation';
import { IdempotentCommand, SkipIdempotency } from '../src/platform/idempotency';
import {
  API_HEALTH_PROBES,
  API_READINESS_TIMEOUT_MS,
  createDefaultHealthProbes,
  type HealthProbe,
} from '../src/health.controller';
import { registerFeatureModule } from '../src/app.module';
import {
  API_BODY_LIMIT_BYTES,
  configureApiApplication,
  createApiFastifyAdapter,
} from '../src/main';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const migrationsFolder = resolve(repositoryRoot, 'packages/db/migrations');
const appRole = 'zhili_app';
const appPassword = 'task-4-e2e-only-password';
const tenantId = '01J0000000000000000000000A';
const subjectId = '01J0000000000000000000001A';

let container: StartedPostgreSqlContainer;
let admin: Sql;
let app: NestFastifyApplication;
let database: typeof import('@zhili/db');
let appClosed = false;
let commandExecutions = 0;
let loginExecutions = 0;
let unknownExecutions = 0;
let shutdownCalls = 0;

const probeImplementations: Record<string, () => Promise<void>> = {
  postgresql: async () => undefined,
  redis: async () => undefined,
  objectStorage: async () => undefined,
};

const probes: readonly HealthProbe[] = Object.keys(probeImplementations).map((name) => ({
  name,
  check: () => probeImplementations[name]!(),
}));

@Injectable()
class ShutdownObserver implements OnApplicationShutdown {
  onApplicationShutdown(): void {
    shutdownCalls += 1;
  }
}

@Controller()
class LifecycleController {
  @Get('waybills/:waybillId')
  @ContractOperation('getWaybill')
  @RequirePermissions('waybill.read')
  getWaybill(@Req() request: { params: { waybillId: string }; requestContext?: RequestContext }) {
    if (request.params.waybillId === 'explode') {
      unknownExecutions += 1;
      throw new Error('password=never-return-this');
    }

    return {
      data: {
        requestContext: request.requestContext,
        waybillId: request.params.waybillId,
      },
      meta: { requestId: request.requestContext?.requestId },
    };
  }

  @Post('customers')
  @HttpCode(201)
  @ContractOperation('createCustomer')
  @IdempotentCommand()
  createCustomer(@Req() request: { body?: { reject?: boolean } }) {
    commandExecutions += 1;
    if (request.body?.reject) {
      throw new ConflictException({
        code: 'STATE_TRANSITION_NOT_ALLOWED',
        detail: 'The requested customer transition is unavailable.',
        remediation: 'Refresh the customer state before retrying.',
      });
    }
    return { data: { created: true }, meta: {} };
  }

  @Post('auth/password/sessions')
  @ContractOperation('loginWithPassword')
  @PublicRoute()
  @SkipIdempotency()
  login(@Req() request: { cookies?: Record<string, string> }) {
    loginExecutions += 1;
    return { data: { cookie: request.cookies?.session ?? null }, meta: {} };
  }
}

@Module({ controllers: [LifecycleController], providers: [ShutdownObserver] })
class LifecycleFeatureModule {}

function connectionUriFor(username: string, password: string): string {
  const uri = new URL(container.getConnectionUri());
  uri.username = username;
  uri.password = password;
  return uri.toString();
}

function authenticatedHeaders(
  requestId: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    'x-request-id': requestId,
    'x-test-authenticated': 'true',
    ...extra,
  };
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  admin = postgres(container.getConnectionUri(), { max: 1 });
  await migrate(drizzle(admin), { migrationsFolder });
  await admin.unsafe(`ALTER ROLE ${appRole} WITH LOGIN PASSWORD '${appPassword}'`);

  process.env.DATABASE_URL = connectionUriFor(appRole, appPassword);
  process.env.REDIS_URL = 'redis://127.0.0.1:1';
  process.env.S3_ENDPOINT = 'http://127.0.0.1:1';
  process.env.S3_ACCESS_KEY = 'task-4-access';
  process.env.S3_SECRET_KEY = 'task-4-secret';
  process.env.SESSION_KEY = 'task-4-session';
  process.env.ENVELOPE_MASTER_KEY = 'task-4-envelope';
  process.env.NODE_ENV = 'test';

  const testingModule = await Test.createTestingModule({
    imports: [registerFeatureModule(LifecycleFeatureModule)],
  })
    .overrideProvider(API_HEALTH_PROBES)
    .useValue(probes)
    .overrideProvider(API_READINESS_TIMEOUT_MS)
    .useValue(40)
    .compile();

  app = testingModule.createNestApplication<NestFastifyApplication>(createApiFastifyAdapter());
  await configureApiApplication(app, { enableShutdownHooks: true });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, _reply, done) => {
      if (request.headers['x-test-authenticated'] === 'true') {
        request.principal = createAuthenticatedPrincipal({
          tenantId,
          subjectId,
          permissions: ['waybill.read', 'customer.write'],
        });
      }
      done();
    });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  database = await import('@zhili/db');
});

beforeEach(async () => {
  commandExecutions = 0;
  loginExecutions = 0;
  unknownExecutions = 0;
  probeImplementations.postgresql = async () => undefined;
  probeImplementations.redis = async () => undefined;
  probeImplementations.objectStorage = async () => undefined;
  await admin`TRUNCATE idempotency_records, outbox_events`;
});

afterAll(async () => {
  if (!appClosed && app) await app.close();
  if (database) await database.closeDatabaseClient();
  if (admin) await admin.end();
  if (container) await container.stop();
  for (const key of [
    'DATABASE_URL',
    'REDIS_URL',
    'S3_ENDPOINT',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'SESSION_KEY',
    'ENVELOPE_MASTER_KEY',
    'NODE_ENV',
  ]) {
    delete process.env[key];
  }
});

describe('Nest + Fastify API composition', () => {
  it('serves public liveness with request ID and secure headers without consulting dependencies', async () => {
    const calls = vi.fn();
    for (const name of Object.keys(probeImplementations)) {
      probeImplementations[name] = async () => calls(name);
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
      headers: { 'x-request-id': 'request-live' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe('request-live');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.json()).toEqual({
      data: { status: 'ok', checks: {} },
      meta: { requestId: 'request-live' },
    });
    expect(calls).not.toHaveBeenCalled();
  });

  it('runs required readiness probes concurrently and returns 200 only when all are up', async () => {
    for (const name of Object.keys(probeImplementations)) {
      probeImplementations[name] = async () => delay(30);
    }
    const startedAt = performance.now();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
      headers: { 'x-request-id': 'request-ready' },
    });
    const elapsedMs = performance.now() - startedAt;

    expect(response.statusCode).toBe(200);
    expect(elapsedMs).toBeLessThan(90);
    expect(response.json()).toEqual({
      data: {
        status: 'ok',
        checks: {
          postgresql: { status: 'up', latencyMs: expect.any(Number) },
          redis: { status: 'up', latencyMs: expect.any(Number) },
          objectStorage: { status: 'up', latencyMs: expect.any(Number) },
        },
      },
      meta: { requestId: 'request-ready' },
    });
  });

  it('bounds hanging probes, reports safe per-dependency failures, and leaks no credentials or URLs', async () => {
    probeImplementations.postgresql = async () => undefined;
    probeImplementations.redis = async () => {
      throw new Error('redis://user:redis-secret@internal.example:6379');
    };
    probeImplementations.objectStorage = () => new Promise<void>(() => undefined);
    const startedAt = performance.now();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
      headers: { 'x-request-id': 'request-not-ready' },
    });
    const elapsedMs = performance.now() - startedAt;
    const serialized = response.body;

    expect(response.statusCode).toBe(503);
    expect(elapsedMs).toBeLessThan(200);
    expect(response.json()).toEqual({
      data: {
        status: 'unavailable',
        checks: {
          postgresql: { status: 'up', latencyMs: expect.any(Number) },
          redis: {
            status: 'down',
            latencyMs: expect.any(Number),
            detail: 'Dependency check failed.',
          },
          objectStorage: {
            status: 'down',
            latencyMs: expect.any(Number),
            detail: 'Dependency check timed out.',
          },
        },
      },
      meta: { requestId: 'request-not-ready' },
    });
    expect(serialized).not.toContain('redis-secret');
    expect(serialized).not.toContain('internal.example');
    expect(serialized).not.toContain(process.env.S3_SECRET_KEY);
    expect(serialized).not.toContain(process.env.S3_ENDPOINT);
  });

  it('probes the real PostgreSQL, authenticated Redis, and object-storage protocols', async () => {
    const redisCommands: string[] = [];
    const redisServer = createTcpServer((socket) => {
      let authenticated = false;
      let received = '';
      socket.on('data', (chunk) => {
        received += chunk.toString('utf8');
        if (received.includes('AUTH') && !authenticated) {
          redisCommands.push('AUTH');
          authenticated = true;
          received = '';
          socket.write('+OK\r\n');
          return;
        }
        if (received.includes('PING')) {
          redisCommands.push('PING');
          received = '';
          socket.write(authenticated ? '+PONG\r\n' : '-NOAUTH Authentication required\r\n');
        }
      });
    });
    let objectStoragePath = '';
    const objectStorageServer = createHttpServer((request, response) => {
      objectStoragePath = request.url ?? '';
      response.statusCode = 200;
      response.end('ok');
    });
    await Promise.all([
      new Promise<void>((resolveListen) => redisServer.listen(0, '127.0.0.1', resolveListen)),
      new Promise<void>((resolveListen) =>
        objectStorageServer.listen(0, '127.0.0.1', resolveListen)
      ),
    ]);

    try {
      const redisAddress = redisServer.address();
      const objectAddress = objectStorageServer.address();
      if (!redisAddress || typeof redisAddress === 'string') throw new Error('Redis test port');
      if (!objectAddress || typeof objectAddress === 'string') throw new Error('S3 test port');
      const env = loadEnv({
        ...process.env,
        REDIS_URL: `redis://probe-user:probe-password@127.0.0.1:${redisAddress.port}`,
        S3_ENDPOINT: `http://127.0.0.1:${objectAddress.port}/storage`,
      });
      const defaultProbes = createDefaultHealthProbes(env);

      await Promise.all(defaultProbes.map((probe) => probe.check(new AbortController().signal)));

      expect(defaultProbes.map((probe) => probe.name)).toEqual([
        'postgresql',
        'redis',
        'objectStorage',
      ]);
      expect(redisCommands).toEqual(['AUTH', 'PING']);
      expect(objectStoragePath).toBe('/storage/minio/health/ready');
    } finally {
      await Promise.all([
        new Promise<void>((resolveClose, rejectClose) =>
          redisServer.close((error) => (error ? rejectClose(error) : resolveClose()))
        ),
        new Promise<void>((resolveClose, rejectClose) =>
          objectStorageServer.close((error) => (error ? rejectClose(error) : resolveClose()))
        ),
      ]);
    }
  });

  it('runs authentication before request context and idempotency, while trusted identity ignores query data', async () => {
    const unauthenticatedCommand = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      payload: { name: 'missing auth and key' },
      headers: { 'x-request-id': 'request-auth-before-idempotency' },
    });
    const authenticatedWithoutKey = await app.inject({
      method: 'POST',
      url: '/api/v1/customers',
      payload: { name: 'missing key' },
      headers: authenticatedHeaders('request-context-before-idempotency'),
    });
    const protectedRead = await app.inject({
      method: 'GET',
      url: '/api/v1/waybills/WB-1?tenantId=attacker-tenant&subjectId=attacker-subject',
      headers: authenticatedHeaders('request-protected-read'),
    });

    expect(unauthenticatedCommand.statusCode).toBe(401);
    expect(unauthenticatedCommand.json()).toEqual({
      code: 'UNAUTHORIZED',
      message: 'An authenticated principal is required.',
      detail: 'An authenticated principal is required.',
      details: [],
      remediation: 'Sign in again and retry the request.',
      requestId: 'request-auth-before-idempotency',
    });
    expect(authenticatedWithoutKey.statusCode).toBe(400);
    expect(authenticatedWithoutKey.headers['x-request-id']).toBe(
      'request-context-before-idempotency'
    );
    expect(protectedRead.statusCode).toBe(200);
    expect(protectedRead.json().data.requestContext).toEqual({
      tenantId,
      subjectId,
      permissions: ['waybill.read', 'customer.write'],
      requestId: 'request-protected-read',
    });
    expect(commandExecutions).toBe(0);
  });

  it('replays a deterministic 4xx through the real global idempotency interceptor', async () => {
    const request = {
      method: 'POST' as const,
      url: '/api/v1/customers',
      payload: { reject: true },
      headers: authenticatedHeaders('request-command-first', {
        'idempotency-key': 'task-4-command-key-0001',
      }),
    };
    const first = await app.inject(request);
    const replay = await app.inject({
      ...request,
      headers: authenticatedHeaders('request-command-replay', {
        'idempotency-key': 'task-4-command-key-0001',
      }),
    });

    expect(first.statusCode).toBe(409);
    expect(replay.statusCode).toBe(409);
    expect(replay.body).toBe(first.body);
    expect(first.json()).toEqual({
      code: 'STATE_TRANSITION_NOT_ALLOWED',
      message: 'The requested customer transition is unavailable.',
      detail: 'The requested customer transition is unavailable.',
      details: [],
      remediation: 'Refresh the customer state before retrying.',
      requestId: 'request-command-first',
    });
    expect(commandExecutions).toBe(1);
  });

  it('lets an explicitly skipped public mutation parse cookies without auth or idempotency headers', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/sessions',
      headers: {
        cookie: 'session=parsed-cookie',
        'x-request-id': 'request-public-login',
      },
      payload: { tenantId: 'untrusted-body-tenant' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['x-request-id']).toBe('request-public-login');
    expect(response.json()).toEqual({
      data: { cookie: 'parsed-cookie' },
      meta: {},
    });
    expect(loginExecutions).toBe(1);
  });

  it('maps unknown failures to the generic ErrorEnvelope and does not cache them', async () => {
    const request = {
      method: 'GET' as const,
      url: '/api/v1/waybills/explode',
      headers: authenticatedHeaders('request-unknown-500'),
    };

    const first = await app.inject(request);
    const second = await app.inject(request);

    expect(first.statusCode).toBe(500);
    expect(second.statusCode).toBe(500);
    expect(first.json()).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'The service could not complete the request.',
      detail: 'The service could not complete the request.',
      details: [],
      remediation: 'Retry later and provide the request ID if the failure persists.',
      requestId: 'request-unknown-500',
    });
    expect(first.body).not.toContain('never-return-this');
    expect(unknownExecutions).toBe(2);
  });

  it('maps the explicit Fastify body limit to the ErrorEnvelope without executing the route', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password/sessions',
      headers: { 'x-request-id': 'request-body-limit' },
      payload: { oversized: 'x'.repeat(API_BODY_LIMIT_BYTES + 1) },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'The request payload is too large.',
      detail: 'The request payload is too large.',
      details: [],
      remediation: 'Reduce the payload size and retry.',
      requestId: 'request-body-limit',
    });
    expect(loginExecutions).toBe(0);
  });

  it('runs application shutdown hooks and closes the Fastify instance', async () => {
    await app.close();
    appClosed = true;

    expect(shutdownCalls).toBe(1);
    await expect(app.inject({ method: 'GET', url: '/api/v1/health/live' })).rejects.toThrow();
  });
});
