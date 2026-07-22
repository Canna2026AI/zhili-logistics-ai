import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const appRole = 'zhili_app';
const appPassword = 'integration-only-password';
const tenantId = '01J0000000000000000000000C';
const context = {
  tenantId,
  subjectId: '01J0000000000000000000020C',
  requestId: '01J0000000000000000000030C',
  permissions: ['idempotency:write', 'outbox:write'],
} as const;

let container: StartedPostgreSqlContainer;
let admin: Sql;
let database: typeof import('../src');

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  admin = postgres(container.getConnectionUri(), { max: 1 });

  await migrate(drizzle(admin), { migrationsFolder: resolve(packageRoot, 'migrations') });
  await admin.unsafe(`ALTER ROLE ${appRole} WITH LOGIN PASSWORD '${appPassword}'`);

  const appUrl = new URL(container.getConnectionUri());
  appUrl.username = appRole;
  appUrl.password = appPassword;
  process.env.DATABASE_URL = appUrl.toString();
  database = await import('../src');
});

afterAll(async () => {
  if (database) await database.closeDatabaseClient();
  if (admin) await admin.end();
  if (container) await container.stop();
  delete process.env.DATABASE_URL;
});

describe('transactional outbox', () => {
  it('rolls a business write and its outbox event back together', async () => {
    await expect(
      database.withTenantTransaction(context, async (tx) => {
        await tx.execute(sql`
          INSERT INTO idempotency_records (
            id, tenant_id, idempotency_key, request_hash, response_headers,
            response_body, expires_at
          ) VALUES (
            '01J0000000000000000000050C', ${tenantId}, 'rollback-business-key',
            ${'c'.repeat(64)}, '{}'::jsonb, '{"accepted":true}'::jsonb,
            now() + interval '1 hour'
          )
        `);
        await tx.execute(sql`
          INSERT INTO outbox_events (
            id, tenant_id, aggregate_type, aggregate_id, aggregate_version,
            event_type, payload, dedupe_key
          ) VALUES (
            '01J0000000000000000000060C', ${tenantId}, 'idempotency_record',
            '01J0000000000000000000050C', 1, 'IdempotencyRecorded',
            '{"accepted":true}'::jsonb, 'rollback-event-key'
          )
        `);

        throw new Error('force transaction rollback');
      })
    ).rejects.toThrow('force transaction rollback');

    await database.withTenantTransaction(context, async (tx) => {
      const [counts] = await tx.execute<{ business_count: number; outbox_count: number }>(sql`
        SELECT
          (SELECT count(*)::int FROM idempotency_records
           WHERE idempotency_key = 'rollback-business-key') AS business_count,
          (SELECT count(*)::int FROM outbox_events
           WHERE dedupe_key = 'rollback-event-key') AS outbox_count
      `);
      expect(counts).toEqual({ business_count: 0, outbox_count: 0 });
    });
  });

  it('commits a business write and its outbox event together', async () => {
    await database.withTenantTransaction(context, async (tx) => {
      await tx.execute(sql`
        INSERT INTO idempotency_records (
          id, tenant_id, idempotency_key, request_hash, response_status,
          response_headers, response_body, expires_at
        ) VALUES (
          '01J0000000000000000000070C', ${tenantId}, 'commit-business-key',
          ${'d'.repeat(64)}, 201, '{"content-type":"application/json"}'::jsonb,
          '{"accepted":true}'::jsonb, now() + interval '1 hour'
        )
      `);
      await tx.execute(sql`
        INSERT INTO outbox_events (
          id, tenant_id, aggregate_type, aggregate_id, aggregate_version,
          event_type, payload, dedupe_key
        ) VALUES (
          '01J0000000000000000000080C', ${tenantId}, 'idempotency_record',
          '01J0000000000000000000070C', 1, 'IdempotencyRecorded',
          '{"accepted":true}'::jsonb, 'commit-event-key'
        )
      `);
    });

    await database.withTenantTransaction(context, async (tx) => {
      const [counts] = await tx.execute<{ business_count: number; outbox_count: number }>(sql`
        SELECT
          (SELECT count(*)::int FROM idempotency_records
           WHERE idempotency_key = 'commit-business-key') AS business_count,
          (SELECT count(*)::int FROM outbox_events
           WHERE dedupe_key = 'commit-event-key') AS outbox_count
      `);
      expect(counts).toEqual({ business_count: 1, outbox_count: 1 });
    });
  });

  it('rejects duplicate outbox dedupe keys per tenant', async () => {
    await expect(
      database.withTenantTransaction(context, async (tx) => {
        await tx.execute(sql`
          INSERT INTO outbox_events (
            id, tenant_id, aggregate_type, aggregate_id, aggregate_version,
            event_type, payload, dedupe_key
          ) VALUES (
            '01J0000000000000000000090C', ${tenantId}, 'idempotency_record',
            '01J0000000000000000000070C', 2, 'IdempotencyRecorded',
            '{}'::jsonb, 'commit-event-key'
          )
        `);
      })
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });
});
