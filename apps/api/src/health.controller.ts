import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { request as requestHttp, type ClientRequest } from 'node:http';
import { request as requestHttps } from 'node:https';
import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';
import postgres, { type PendingQuery, type Row, type Sql } from 'postgres';
import { PublicRoute } from '@zhili/auth';
import type { AppEnv } from '@zhili/config';
import { ContractOperation } from './platform/contract-operation';

export const API_HEALTH_PROBES = Symbol('API_HEALTH_PROBES');
export const API_READINESS_TIMEOUT_MS = Symbol('API_READINESS_TIMEOUT_MS');

export interface HealthProbe {
  readonly name: string;
  readonly drainAfterAbort?: boolean;
  check(signal: AbortSignal): Promise<void>;
  close(): Promise<void>;
}

interface HealthDependencyResult {
  readonly status: 'up' | 'down';
  readonly latencyMs: number;
  readonly detail?: string;
}

interface HealthResponse {
  readonly data: {
    readonly status: 'ok' | 'unavailable';
    readonly checks: Readonly<Record<string, HealthDependencyResult>>;
  };
  readonly meta: { readonly requestId: string };
}

@Controller('health')
export class HealthController {
  constructor(
    @Inject(API_HEALTH_PROBES) private readonly probes: readonly HealthProbe[],
    @Inject(API_READINESS_TIMEOUT_MS) private readonly timeoutMs: number
  ) {}

  @Get('live')
  @PublicRoute()
  @ContractOperation('getServiceLiveness')
  live(@Res({ passthrough: true }) reply: FastifyReply): HealthResponse {
    return healthResponse('ok', {}, requestIdFromReply(reply));
  }

  @Get('ready')
  @PublicRoute()
  @ContractOperation('getServiceReadiness')
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthResponse> {
    const results = await Promise.all(
      this.probes.map(async (probe) => [probe.name, await runProbe(probe, this.timeoutMs)] as const)
    );
    const checks = Object.fromEntries(results);
    const ready = results.every(([, result]) => result.status === 'up');
    if (!ready) reply.status(503);
    return healthResponse(ready ? 'ok' : 'unavailable', checks, requestIdFromReply(reply));
  }
}

export function createDefaultHealthProbes(env: AppEnv): readonly HealthProbe[] {
  return [
    createPostgresHealthProbe(env),
    createRedisHealthProbe(env.REDIS_URL),
    createObjectStorageHealthProbe(env.S3_ENDPOINT),
  ];
}

export function createPostgresHealthProbe(env: AppEnv, statement = 'SELECT 1'): HealthProbe {
  interface ActiveQuery {
    readonly client: Sql;
    readonly completion: Promise<void>;
    readonly query: PendingQuery<Row[]>;
  }

  const active = new Set<ActiveQuery>();
  let closed = false;
  return {
    name: 'postgresql',
    drainAfterAbort: true,
    check: async (signal) => {
      if (closed) throw new Error('PostgreSQL readiness probe is closed');
      const client = postgres(env.DATABASE_URL, {
        connect_timeout: 1,
        connection: { application_name: 'zhili-health-readiness' },
        max: 1,
      });
      const query = client.unsafe<Row[]>(statement);
      let completion!: Promise<void>;
      const operation: ActiveQuery = {
        client,
        query,
        completion: (completion = executePostgresQuery(client, query, signal).finally(() => {
          active.delete(operation);
        })),
      };
      active.add(operation);
      return completion;
    },
    close: async () => {
      closed = true;
      const operations = [...active];
      for (const operation of operations) {
        operation.query.cancel();
        void operation.client.end({ timeout: 0 });
      }
      await Promise.allSettled(operations.map((operation) => operation.completion));
    },
  };
}

function createRedisHealthProbe(url: string): HealthProbe {
  const sockets = new Set<ReturnType<typeof connectTcp>>();
  const completions = new Set<Promise<void>>();
  let closed = false;
  return {
    name: 'redis',
    check: (signal) => {
      if (closed) return Promise.reject(new Error('Redis readiness probe is closed'));
      const completion = redisPing(url, signal, sockets);
      completions.add(completion);
      void completion.then(
        () => completions.delete(completion),
        () => completions.delete(completion)
      );
      return completion;
    },
    close: async () => {
      closed = true;
      for (const socket of sockets) socket.destroy(new Error('Redis readiness probe is closing'));
      await Promise.allSettled([...completions]);
    },
  };
}

function createObjectStorageHealthProbe(endpointValue: string): HealthProbe {
  const requests = new Set<ClientRequest>();
  const completions = new Set<Promise<void>>();
  let closed = false;
  return {
    name: 'objectStorage',
    check: (signal) => {
      if (closed) return Promise.reject(new Error('Object storage readiness probe is closed'));
      const completion = objectStorageReady(endpointValue, signal, requests);
      completions.add(completion);
      void completion.then(
        () => completions.delete(completion),
        () => completions.delete(completion)
      );
      return completion;
    },
    close: async () => {
      closed = true;
      for (const request of requests) {
        request.destroy(new Error('Object storage readiness probe is closing'));
      }
      await Promise.allSettled([...completions]);
    },
  };
}

async function runProbe(probe: HealthProbe, timeoutMs: number): Promise<HealthDependencyResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  const operation = Promise.resolve().then(() => probe.check(controller.signal));
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new HealthProbeTimeoutError());
          controller.abort();
        }, timeoutMs);
      }),
    ]);
    return { status: 'up', latencyMs: elapsedMilliseconds(startedAt) };
  } catch (error) {
    if (error instanceof HealthProbeTimeoutError) {
      const settledOperation = operation.catch(() => undefined);
      if (probe.drainAfterAbort) {
        await settledOperation;
      } else {
        await Promise.race([
          settledOperation,
          new Promise<void>((resolve) => setTimeout(resolve, Math.min(timeoutMs, 100))),
        ]);
      }
    }
    return {
      status: 'down',
      latencyMs: elapsedMilliseconds(startedAt),
      detail:
        error instanceof HealthProbeTimeoutError
          ? 'Dependency check timed out.'
          : 'Dependency check failed.',
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

class HealthProbeTimeoutError extends Error {}

function healthResponse(
  status: 'ok' | 'unavailable',
  checks: Readonly<Record<string, HealthDependencyResult>>,
  requestId: string
): HealthResponse {
  return { data: { status, checks }, meta: { requestId } };
}

function requestIdFromReply(reply: FastifyReply): string {
  const value = reply.getHeader('x-request-id');
  return Array.isArray(value) ? String(value[0]) : String(value ?? '');
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function executePostgresQuery(
  client: Sql,
  query: PendingQuery<Row[]>,
  signal: AbortSignal
): Promise<void> {
  const onAbort = () => {
    query.cancel();
  };
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();
  try {
    await query;
  } finally {
    signal.removeEventListener('abort', onAbort);
    await client.end({ timeout: 0 });
  }
}

function redisPing(
  urlValue: string,
  signal: AbortSignal,
  sockets: Set<ReturnType<typeof connectTcp>>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlValue);
    const secure = url.protocol === 'rediss:';
    if (!secure && url.protocol !== 'redis:') {
      reject(new Error('Unsupported Redis protocol'));
      return;
    }
    const port = url.port ? Number(url.port) : 6379;
    const socket = secure
      ? connectTls({
          host: url.hostname,
          port,
          rejectUnauthorized: true,
          servername: url.hostname,
        })
      : connectTcp({ host: url.hostname, port });
    sockets.add(socket);
    let settled = false;
    let responseBuffer = '';
    let state: 'auth' | 'ping' = url.password ? 'auth' : 'ping';
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      sockets.delete(socket);
      socket.destroy();
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(new Error('Redis readiness aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    socket.once('error', (error) => finish(error));
    socket.once(secure ? 'secureConnect' : 'connect', () => {
      if (state === 'auth') {
        const username = decodeURIComponent(url.username);
        const password = decodeURIComponent(url.password);
        socket.write(
          encodeRedisCommand(username ? ['AUTH', username, password] : ['AUTH', password])
        );
      } else {
        socket.write(encodeRedisCommand(['PING']));
      }
    });
    socket.on('data', (chunk: Buffer) => {
      responseBuffer += chunk.toString('utf8');
      const lineEnd = responseBuffer.indexOf('\r\n');
      if (lineEnd < 0) return;
      const line = responseBuffer.slice(0, lineEnd);
      responseBuffer = responseBuffer.slice(lineEnd + 2);
      if (line.startsWith('-')) {
        finish(new Error('Redis readiness command failed'));
        return;
      }
      if (state === 'auth' && line === '+OK') {
        state = 'ping';
        socket.write(encodeRedisCommand(['PING']));
        return;
      }
      if (state === 'ping' && line === '+PONG') {
        finish();
        return;
      }
      finish(new Error('Unexpected Redis readiness response'));
    });
  });
}

function objectStorageReady(
  endpointValue: string,
  signal: AbortSignal,
  requests: Set<ClientRequest>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const endpoint = new URL(endpointValue);
    endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/minio/health/ready`;
    const request = (endpoint.protocol === 'https:' ? requestHttps : requestHttp)(
      endpoint,
      { agent: false, method: 'GET', signal },
      (response) => {
        response.once('error', reject);
        response.once('end', () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            resolve();
          } else {
            reject(new Error('Object storage readiness request failed'));
          }
        });
        response.resume();
      }
    );
    requests.add(request);
    request.once('error', reject);
    request.once('close', () => requests.delete(request));
    request.end();
  });
}

function encodeRedisCommand(parts: readonly string[]): string {
  return `*${parts.length}\r\n${parts
    .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
    .join('')}`;
}
