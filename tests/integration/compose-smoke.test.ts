import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Queue, type Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import IORedis from 'ioredis';
import postgres, { type Sql } from 'postgres';
import { afterAll, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const composeProject = requiredEnvironment('COMPOSE_PROJECT_NAME');
const composeEnvironmentFile = process.env.COMPOSE_ENV_FILE ?? 'infra/.env.example';
const composeFile = 'infra/compose.yaml';
const cycle = Number(process.env.COMPOSE_CYCLE ?? '0');
const commandTimeoutMs = 120_000;
const expectedServices = [
  'api',
  'migrate',
  'minio',
  'minio-init',
  'object-smoke',
  'postgres',
  'redis',
  'worker',
] as const;
const longRunningResources = {
  api: { memory: 512 * 1024 * 1024, nanoCpus: 1_000_000_000, pids: 256 },
  worker: { memory: 512 * 1024 * 1024, nanoCpus: 1_000_000_000, pids: 256 },
  postgres: { memory: 768 * 1024 * 1024, nanoCpus: 1_000_000_000, pids: 256 },
  redis: { memory: 256 * 1024 * 1024, nanoCpus: 500_000_000, pids: 128 },
  minio: { memory: 512 * 1024 * 1024, nanoCpus: 1_000_000_000, pids: 256 },
} as const;
const tenantA = ulid(10);
const tenantB = ulid(11);
const subjectId = ulid(12);
const outboxId = ulid(cycle === 2 ? 22 : 21);
const aggregateId = ulid(cycle === 2 ? 24 : 23);
const traceId = `compose-cycle-${cycle}-trace`;
const payload = { marker: 'compose-smoke', cycle };

interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface ComposeEnvironment {
  readonly POSTGRES_DB: string;
  readonly POSTGRES_ADMIN_PASSWORD: string;
  readonly POSTGRES_API_PASSWORD: string;
  readonly POSTGRES_WORKER_PASSWORD: string;
  readonly REDIS_PASSWORD: string;
  readonly MINIO_ROOT_USER: string;
  readonly MINIO_ROOT_PASSWORD: string;
  readonly SESSION_KEY: string;
  readonly ENVELOPE_MASTER_KEY: string;
  readonly POSTGRES_PORT: string;
  readonly REDIS_PORT: string;
  readonly API_PORT: string;
}

interface ContainerInspection {
  readonly Id: string;
  readonly Architecture?: string;
  readonly Config: {
    readonly Image: string;
    readonly User: string;
    readonly Cmd: readonly string[] | null;
    readonly Labels: Readonly<Record<string, string>>;
  };
  readonly HostConfig: {
    readonly ReadonlyRootfs: boolean;
    readonly CapDrop: readonly string[] | null;
    readonly CapAdd: readonly string[] | null;
    readonly SecurityOpt: readonly string[] | null;
    readonly Memory: number;
    readonly NanoCpus: number;
    readonly PidsLimit: number;
    readonly Privileged: boolean;
    readonly Devices: readonly unknown[] | null;
    readonly Binds: readonly string[] | null;
  };
  readonly State: {
    readonly Status: string;
    readonly Running: boolean;
    readonly Health?: { readonly Status: string };
  };
  readonly Image: string;
  readonly Mounts: readonly { readonly Type: string; readonly Destination: string }[];
}

interface RuntimeMetadata {
  readonly version: string;
  readonly uid: number;
  readonly arch: string;
}

interface NormalOutboxJob {
  readonly outboxId: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly aggregate: { readonly type: string; readonly id: string; readonly version: string };
  readonly payload: unknown;
  readonly attempt: number;
  readonly traceId?: string;
}

type DatabaseModule = typeof import('@zhili/db');

let environment: ComposeEnvironment | undefined;
let database: DatabaseModule | undefined;
let appSql: Sql | undefined;
let workerSql: Sql | undefined;
let redis: IORedis | undefined;
let queue: Queue<NormalOutboxJob> | undefined;
let deadQueue: Queue | undefined;

afterAll(async () => {
  await Promise.allSettled([
    queue?.close(),
    deadQueue?.close(),
    redis?.quit(),
    appSql?.end(),
    workerSql?.end(),
    database?.closeDatabaseClient(),
  ]);
  delete process.env.DATABASE_URL;
});

it('proves the complete production-like Compose stack from an empty-volume cycle', async () => {
  environment = await loadComposeEnvironment();
  await assertStackReady();
  await assertVersionsAndArchitectures(environment);
  await assertRuntimeHardening();
  await assertHealthFailureAndRecovery(environment);
  await assertObjectWriteRead();
  await assertTenantIsolationAndWorkerDelivery(environment);
  await assertDatabaseRoles(environment);
  await assertSecretsAbsent(environment);
});

async function assertStackReady(): Promise<void> {
  const services = await compose(['--profile', 'smoke', 'config', '--services']);
  if (services.code !== 0) {
    throw new Error('STACK_NOT_READY: Compose implementation is absent or invalid');
  }
  expect(services.stdout.trim().split('\n').sort()).toEqual([...expectedServices].sort());

  for (const service of ['postgres', 'redis', 'minio', 'api', 'worker']) {
    const inspection = await inspectService(service);
    if (!inspection.State.Running || inspection.State.Health?.Status !== 'healthy') {
      throw new Error(
        `STACK_NOT_READY: ${service} state=${inspection.State.Status} health=${inspection.State.Health?.Status ?? 'none'}`
      );
    }
  }

  for (const service of ['migrate', 'minio-init']) {
    const inspection = await inspectService(service);
    expect(inspection.State.Status).toBe('exited');
  }
}

async function assertVersionsAndArchitectures(env: ComposeEnvironment): Promise<void> {
  appSql = postgres(databaseUrl('zhili_api_login', env.POSTGRES_API_PASSWORD, env), { max: 2 });
  const versions = await appSql<{ server_version: string }[]>`SHOW server_version`;
  expect(versions[0]?.server_version).toMatch(/^17\./);

  redis = new IORedis(redisUrl(env), { maxRetriesPerRequest: 1 });
  const redisInformation = await redis.info('server');
  expect(redisInformation).toMatch(/(?:^|\r?\n)redis_version:8\./);

  const minioVersion = await compose(['exec', '-T', 'minio', 'minio', '--version']);
  expect(minioVersion.code).toBe(0);
  expect(minioVersion.stdout).toContain('RELEASE.2025-04-22T22-12-26Z');

  for (const service of ['api', 'worker']) {
    const metadata = await runtimeMetadata(service);
    expect(metadata).toMatchObject({ version: expect.stringMatching(/^v22\.22\./), uid: 10001 });
    expect(metadata.arch).toBe(process.arch);
  }

  const pinnedImages = {
    postgres: 'postgres:17-alpine',
    redis: 'redis:8-alpine',
    minio: 'minio/minio:RELEASE.2025-04-22T22-12-26Z',
  } as const;
  for (const [service, image] of Object.entries(pinnedImages)) {
    const inspection = await inspectService(service);
    expect(inspection.Config.Image).toBe(image);
  }

  for (const service of ['postgres', 'redis', 'minio', 'api', 'worker']) {
    const inspection = await inspectService(service);
    const imageInspection = await command('docker', [
      'image',
      'inspect',
      '--format',
      '{{.Architecture}}',
      inspection.Image,
    ]);
    expect(imageInspection.code).toBe(0);
    expect(imageInspection.stdout.trim()).toBe(process.arch);
  }
}

async function assertRuntimeHardening(): Promise<void> {
  for (const service of ['api', 'worker'] as const) {
    const inspection = await inspectService(service);
    const limits = longRunningResources[service];
    expect(inspection.Config.User).toBe('10001:10001');
    expect(inspection.HostConfig.ReadonlyRootfs).toBe(true);
    expect(inspection.HostConfig.CapDrop).toContain('ALL');
    expect(inspection.HostConfig.CapAdd ?? []).toHaveLength(0);
    expect(inspection.HostConfig.SecurityOpt).toContain('no-new-privileges:true');
    expect(inspection.HostConfig.Privileged).toBe(false);
    expect(inspection.HostConfig.Devices ?? []).toHaveLength(0);
    expect(inspection.HostConfig.Binds ?? []).toHaveLength(0);
    expect(inspection.Mounts.some((mount) => mount.Type === 'bind')).toBe(false);
    expect(inspection.Mounts.some((mount) => mount.Destination.includes('docker.sock'))).toBe(
      false
    );
    expect(inspection.HostConfig.Memory).toBe(limits.memory);
    expect(inspection.HostConfig.NanoCpus).toBe(limits.nanoCpus);
    expect(inspection.HostConfig.PidsLimit).toBe(limits.pids);
    expect(inspection.State.Health?.Status).toBe('healthy');
    expect(inspection.Config.Labels['org.opencontainers.image.revision']).toBe(
      '301ec59f33896e123f154b4b01f63ff211d1a05a'
    );
    expect(inspection.Config.Labels['org.opencontainers.image.component']).toBe(service);
  }

  for (const service of ['postgres', 'redis', 'minio'] as const) {
    const inspection = await inspectService(service);
    const limits = longRunningResources[service];
    expect(inspection.HostConfig.Memory).toBe(limits.memory);
    expect(inspection.HostConfig.NanoCpus).toBe(limits.nanoCpus);
    expect(inspection.HostConfig.PidsLimit).toBe(limits.pids);
  }

  const postgresInspection = await inspectService('postgres');
  expect(postgresInspection.Mounts.every((mount) => mount.Type === 'volume')).toBe(true);
}

async function assertHealthFailureAndRecovery(env: ComposeEnvironment): Promise<void> {
  const liveRequestId = `compose-cycle-${cycle}-live`;
  const readyRequestId = `compose-cycle-${cycle}-ready`;
  const live = await fetchHealth(env, 'live', liveRequestId);
  expect(live.status).toBe(200);
  expect(live.headerRequestId).toBe(liveRequestId);
  expect(live.body).toEqual({
    data: { status: 'ok', checks: {} },
    meta: { requestId: liveRequestId },
  });

  const ready = await fetchHealth(env, 'ready', readyRequestId);
  expect(ready.status).toBe(200);
  expect(ready.headerRequestId).toBe(readyRequestId);
  expect(ready.body).toMatchObject({
    data: {
      status: 'ok',
      checks: {
        postgresql: { status: 'up', latencyMs: expect.any(Number) },
        redis: { status: 'up', latencyMs: expect.any(Number) },
        objectStorage: { status: 'up', latencyMs: expect.any(Number) },
      },
    },
    meta: { requestId: readyRequestId },
  });

  const stopped = await compose(['stop', '--timeout', '10', 'minio']);
  expect(stopped.code).toBe(0);
  const unavailable = await waitFor(
    'MinIO outage readiness',
    async () => {
      const response = await fetchHealth(env, 'ready', `compose-cycle-${cycle}-outage`);
      return response.status === 503 ? response : undefined;
    },
    20_000
  );
  const liveDuringOutage = await fetchHealth(env, 'live', `compose-cycle-${cycle}-live-outage`);
  expect(liveDuringOutage.status).toBe(200);
  expect(unavailable.body).toMatchObject({
    data: {
      status: 'unavailable',
      checks: {
        postgresql: { status: 'up', latencyMs: expect.any(Number) },
        redis: { status: 'up', latencyMs: expect.any(Number) },
        objectStorage: {
          status: 'down',
          latencyMs: expect.any(Number),
          detail: expect.stringMatching(/^Dependency check (failed|timed out)\.$/),
        },
      },
    },
  });
  assertNoKnownSecrets(JSON.stringify(unavailable.body), env, 'health response');

  const restarted = await compose(['start', 'minio']);
  expect(restarted.code).toBe(0);
  await waitFor(
    'MinIO and API health recovery',
    async () => {
      const [inspection, response] = await Promise.all([
        inspectService('api'),
        fetchHealth(env, 'ready', `compose-cycle-${cycle}-recovered`),
      ]);
      return inspection.State.Health?.Status === 'healthy' && response.status === 200
        ? true
        : undefined;
    },
    60_000
  );
}

async function assertObjectWriteRead(): Promise<void> {
  const key = `compose/cycle-${cycle}/object-smoke.txt`;
  const body = `zhili-compose-object-cycle-${cycle}`;
  const result = await compose(
    [
      '--profile',
      'smoke',
      'run',
      '--rm',
      '--no-deps',
      '-e',
      `OBJECT_SMOKE_KEY=${key}`,
      '-e',
      `OBJECT_SMOKE_BODY=${body}`,
      'object-smoke',
    ],
    60_000
  );
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('OBJECT_SMOKE_OK');
}

async function assertTenantIsolationAndWorkerDelivery(env: ComposeEnvironment): Promise<void> {
  process.env.DATABASE_URL = databaseUrl('zhili_api_login', env.POSTGRES_API_PASSWORD, env);
  database = await import('@zhili/db');
  const contextA = tenantContext(tenantA, `compose-cycle-${cycle}-tenant-a`);
  const contextB = tenantContext(tenantB, `compose-cycle-${cycle}-tenant-b`);

  const initial = await database.withTenantTransaction(contextA, (tx) =>
    tx.select({ id: database!.outboxEvents.id }).from(database!.outboxEvents)
  );
  expect(initial).toEqual([]);

  await database.withTenantTransaction(contextA, async (tx) => {
    await tx.insert(database!.outboxEvents).values({
      id: outboxId,
      tenantId: tenantA,
      aggregateType: 'shipment',
      aggregateId,
      aggregateVersion: 1n,
      eventType: 'imports.compose-smoke',
      payload,
      dedupeKey: `compose-cycle-${cycle}`,
      traceId,
    });
  });

  const tenantBRows = await database.withTenantTransaction(contextB, (tx) =>
    tx
      .select({ id: database!.outboxEvents.id })
      .from(database!.outboxEvents)
      .where(eq(database!.outboxEvents.id, outboxId))
  );
  expect(tenantBRows).toEqual([]);

  const noContextRows = await database
    .getDatabaseClient()
    .select({ id: database.outboxEvents.id })
    .from(database.outboxEvents)
    .where(eq(database.outboxEvents.id, outboxId));
  expect(noContextRows).toEqual([]);

  const tenantARows = await database.withTenantTransaction(contextA, (tx) =>
    tx
      .select({ id: database!.outboxEvents.id })
      .from(database!.outboxEvents)
      .where(eq(database!.outboxEvents.id, outboxId))
  );
  expect(tenantARows).toEqual([{ id: outboxId }]);

  const published = await waitFor(
    'Outbox publication',
    async () => {
      const rows = await database!.withTenantTransaction(contextA, (tx) =>
        tx
          .select({ publishedAt: database!.outboxEvents.publishedAt })
          .from(database!.outboxEvents)
          .where(eq(database!.outboxEvents.id, outboxId))
      );
      return rows[0]?.publishedAt ? rows[0] : undefined;
    },
    30_000
  );
  expect(published.publishedAt).toBeInstanceOf(Date);

  const connection = {
    host: '127.0.0.1',
    port: Number(env.REDIS_PORT),
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
  };
  queue = new Queue<NormalOutboxJob>('imports', { connection });
  deadQueue = new Queue('imports.dead', { connection });
  const job = await waitFor<Job<NormalOutboxJob>>(
    'BullMQ imports job',
    async () => (await queue!.getJob(outboxId)) ?? undefined,
    20_000
  );
  expect(job.id).toBe(outboxId);
  expect(job.data).toEqual({
    outboxId,
    tenantId: tenantA,
    eventType: 'imports.compose-smoke',
    aggregate: { type: 'shipment', id: aggregateId, version: '1' },
    payload,
    attempt: 1,
    traceId,
  });

  expect(await jobCount(queue, outboxId)).toBe(1);
  expect(await jobCount(queue, outboxId)).toBe(1);
  expect(await deadQueue.getJob(outboxId)).toBeUndefined();
  expect(await deadQueue.count()).toBe(0);
}

async function assertDatabaseRoles(env: ComposeEnvironment): Promise<void> {
  appSql ??= postgres(databaseUrl('zhili_api_login', env.POSTGRES_API_PASSWORD, env), { max: 1 });
  workerSql = postgres(databaseUrl('zhili_worker_login', env.POSTGRES_WORKER_PASSWORD, env), {
    max: 1,
  });

  const roles = await appSql<
    {
      rolname: string;
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
    }[]
  >`
    SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb
    FROM pg_roles
    WHERE rolname IN ('zhili_app', 'zhili_worker', 'zhili_api_login', 'zhili_worker_login')
    ORDER BY rolname
  `;
  expect(roles).toEqual([
    roleFlags('zhili_api_login', true),
    roleFlags('zhili_app', false),
    roleFlags('zhili_worker', false),
    roleFlags('zhili_worker_login', true),
  ]);

  const memberships = await appSql<{ member_name: string; role_name: string }[]>`
    SELECT member_role.rolname AS member_name, group_role.rolname AS role_name
    FROM pg_auth_members AS membership
    JOIN pg_roles AS group_role ON group_role.oid = membership.roleid
    JOIN pg_roles AS member_role ON member_role.oid = membership.member
    WHERE member_role.rolname IN ('zhili_api_login', 'zhili_worker_login')
    ORDER BY member_name, role_name
  `;
  expect(memberships).toEqual([
    { member_name: 'zhili_api_login', role_name: 'zhili_app' },
    { member_name: 'zhili_worker_login', role_name: 'zhili_worker' },
  ]);

  await expect(workerSql`SELECT id FROM audit_events LIMIT 1`).rejects.toMatchObject({
    code: '42501',
  });
  await expect(
    workerSql`UPDATE outbox_events SET tenant_id = ${tenantB} WHERE id = ${outboxId}`
  ).rejects.toMatchObject({ code: '42501' });
  await expect(
    workerSql`UPDATE outbox_events SET payload = '{}'::jsonb WHERE id = ${outboxId}`
  ).rejects.toMatchObject({ code: '42501' });
}

async function assertSecretsAbsent(env: ComposeEnvironment): Promise<void> {
  const logs = await compose(['logs', '--no-color', 'api', 'worker', 'migrate']);
  expect(logs.code).toBe(0);
  assertNoKnownSecrets(`${logs.stdout}\n${logs.stderr}`, env, 'service logs');
}

function roleFlags(rolname: string, rolcanlogin: boolean) {
  return {
    rolname,
    rolcanlogin,
    rolsuper: false,
    rolbypassrls: false,
    rolcreaterole: false,
    rolcreatedb: false,
  };
}

function tenantContext(tenantId: string, requestId: string) {
  return { tenantId, subjectId, requestId, permissions: ['compose.smoke'] } as const;
}

async function jobCount(targetQueue: Queue, jobId: string): Promise<number> {
  const jobs = await targetQueue.getJobs(
    ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused'],
    0,
    -1,
    true
  );
  return jobs.filter((candidate) => candidate.id === jobId).length;
}

async function runtimeMetadata(service: string): Promise<RuntimeMetadata> {
  const result = await compose([
    'exec',
    '-T',
    service,
    'node',
    '-e',
    'console.log(JSON.stringify({version:process.version,uid:process.getuid(),arch:process.arch}))',
  ]);
  if (result.code !== 0) throw new Error(`RUNTIME_METADATA_FAILED:${service}`);
  return JSON.parse(result.stdout.trim()) as RuntimeMetadata;
}

async function fetchHealth(env: ComposeEnvironment, endpoint: 'live' | 'ready', requestId: string) {
  const response = await fetch(`http://127.0.0.1:${env.API_PORT}/api/v1/health/${endpoint}`, {
    headers: { 'x-request-id': requestId },
    signal: AbortSignal.timeout(5_000),
  });
  return {
    status: response.status,
    headerRequestId: response.headers.get('x-request-id'),
    body: (await response.json()) as unknown,
  };
}

async function inspectService(service: string): Promise<ContainerInspection> {
  const container = await compose(['ps', '--all', '--quiet', service], 10_000);
  const id = container.stdout.trim();
  if (container.code !== 0 || !id) {
    throw new Error(`STACK_NOT_READY: ${service} container absent`);
  }
  const inspection = await command('docker', ['inspect', id], 10_000);
  if (inspection.code !== 0) throw new Error(`CONTAINER_INSPECT_FAILED:${service}`);
  const parsed = JSON.parse(inspection.stdout) as readonly ContainerInspection[];
  if (!parsed[0]) throw new Error(`CONTAINER_INSPECT_EMPTY:${service}`);
  return parsed[0];
}

async function compose(args: readonly string[], timeoutMs = commandTimeoutMs) {
  return command(
    'docker',
    [
      'compose',
      '-p',
      composeProject,
      '--env-file',
      composeEnvironmentFile,
      '-f',
      composeFile,
      ...args,
    ],
    timeoutMs
  );
}

function command(executable: string, args: readonly string[], timeoutMs = commandTimeoutMs) {
  return new Promise<CommandResult>((resolveCommand, rejectCommand) => {
    const child = spawn(executable, [...args], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      rejectCommand(new Error(`COMMAND_TIMEOUT:${executable}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.once('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      rejectCommand(new Error(`COMMAND_START_FAILED:${executable}`));
    });
    child.once('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveCommand({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function loadComposeEnvironment(): Promise<ComposeEnvironment> {
  const path = resolve(repositoryRoot, composeEnvironmentFile);
  const contents = await readFile(path, 'utf8');
  const values = new Map<string, string>();
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error('COMPOSE_ENV_INVALID');
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }
  const required = (name: string) => {
    const value = process.env[name]?.trim() || values.get(name)?.trim();
    if (!value) throw new Error(`COMPOSE_ENV_MISSING:${name}`);
    return value;
  };
  return {
    POSTGRES_DB: required('POSTGRES_DB'),
    POSTGRES_ADMIN_PASSWORD: required('POSTGRES_ADMIN_PASSWORD'),
    POSTGRES_API_PASSWORD: required('POSTGRES_API_PASSWORD'),
    POSTGRES_WORKER_PASSWORD: required('POSTGRES_WORKER_PASSWORD'),
    REDIS_PASSWORD: required('REDIS_PASSWORD'),
    MINIO_ROOT_USER: required('MINIO_ROOT_USER'),
    MINIO_ROOT_PASSWORD: required('MINIO_ROOT_PASSWORD'),
    SESSION_KEY: required('SESSION_KEY'),
    ENVELOPE_MASTER_KEY: required('ENVELOPE_MASTER_KEY'),
    POSTGRES_PORT: required('POSTGRES_PORT'),
    REDIS_PORT: required('REDIS_PORT'),
    API_PORT: required('API_PORT'),
  };
}

function databaseUrl(username: string, password: string, env: ComposeEnvironment): string {
  const url = new URL('postgresql://127.0.0.1');
  url.username = username;
  url.password = password;
  url.port = env.POSTGRES_PORT;
  url.pathname = `/${env.POSTGRES_DB}`;
  return url.toString();
}

function redisUrl(env: ComposeEnvironment): string {
  const url = new URL('redis://127.0.0.1');
  url.password = env.REDIS_PASSWORD;
  url.port = env.REDIS_PORT;
  return url.toString();
}

function assertNoKnownSecrets(value: string, env: ComposeEnvironment, sourceLabel: string): void {
  const secrets = {
    POSTGRES_ADMIN_PASSWORD: env.POSTGRES_ADMIN_PASSWORD,
    POSTGRES_API_PASSWORD: env.POSTGRES_API_PASSWORD,
    POSTGRES_WORKER_PASSWORD: env.POSTGRES_WORKER_PASSWORD,
    REDIS_PASSWORD: env.REDIS_PASSWORD,
    MINIO_ROOT_USER: env.MINIO_ROOT_USER,
    MINIO_ROOT_PASSWORD: env.MINIO_ROOT_PASSWORD,
    SESSION_KEY: env.SESSION_KEY,
    ENVELOPE_MASTER_KEY: env.ENVELOPE_MASTER_KEY,
  };
  for (const [label, secret] of Object.entries(secrets)) {
    if (value.includes(secret)) throw new Error(`SECRET_LEAK:${sourceLabel}:${label}`);
  }
}

async function waitFor<T>(
  label: string,
  probe: () => Promise<T | undefined>,
  timeoutMs: number
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastState = 'pending';
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value !== undefined) return value;
      lastState = 'not-ready';
    } catch {
      lastState = 'probe-error';
    }
    await delay(250);
  }
  throw new Error(`WAIT_TIMEOUT:${label}:state=${lastState}`);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function ulid(index: number): string {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const suffix = alphabet[index];
  if (!suffix) throw new Error('ULID fixture index is invalid');
  return `01J${'0'.repeat(22)}${suffix}`;
}
