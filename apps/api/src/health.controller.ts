import { Controller, Get, Inject, Res } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { PublicRoute } from '@zhili/auth';
import type { AppEnv } from '@zhili/config';
import { getDatabaseClient } from '@zhili/db';
import { ContractOperation } from './platform/contract-operation';

export const API_HEALTH_PROBES = Symbol('API_HEALTH_PROBES');
export const API_READINESS_TIMEOUT_MS = Symbol('API_READINESS_TIMEOUT_MS');

export interface HealthProbe {
  readonly name: string;
  check(signal: AbortSignal): Promise<void>;
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
    {
      name: 'postgresql',
      check: async () => {
        await getDatabaseClient().execute(sql`SELECT 1`);
      },
    },
    {
      name: 'redis',
      check: (signal) => redisPing(env.REDIS_URL, signal),
    },
    {
      name: 'objectStorage',
      check: async (signal) => {
        const endpoint = new URL(env.S3_ENDPOINT);
        endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/minio/health/ready`;
        const response = await fetch(endpoint, { method: 'GET', signal });
        if (!response.ok) throw new Error('Object storage readiness request failed');
      },
    },
  ];
}

async function runProbe(probe: HealthProbe, timeoutMs: number): Promise<HealthDependencyResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => probe.check(controller.signal)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new HealthProbeTimeoutError());
          controller.abort();
        }, timeoutMs);
      }),
    ]);
    return { status: 'up', latencyMs: elapsedMilliseconds(startedAt) };
  } catch (error) {
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

function redisPing(urlValue: string, signal: AbortSignal): Promise<void> {
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
    let settled = false;
    let responseBuffer = '';
    let state: 'auth' | 'ping' = url.password ? 'auth' : 'ping';
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
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

function encodeRedisCommand(parts: readonly string[]): string {
  return `*${parts.length}\r\n${parts
    .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
    .join('')}`;
}
