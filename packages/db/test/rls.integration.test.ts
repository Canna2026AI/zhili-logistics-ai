import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres, { type Sql } from 'postgres';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const appRole = 'zhili_app';
const appPassword = 'integration-only-password';
const tenantA = '01J0000000000000000000000A';
const tenantB = '01J0000000000000000000000B';

let container: StartedPostgreSqlContainer;
let admin: Sql;
let app: Sql;
let database: typeof import('../src');

function connectionUriFor(username: string, password: string): string {
  const uri = new URL(container.getConnectionUri());
  uri.username = username;
  uri.password = password;
  return uri.toString();
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  admin = postgres(container.getConnectionUri(), { max: 1 });

  await migrate(drizzle(admin), { migrationsFolder: resolve(packageRoot, 'migrations') });
  await admin.unsafe(`ALTER ROLE ${appRole} WITH LOGIN PASSWORD '${appPassword}'`);

  const appUrl = connectionUriFor(appRole, appPassword);
  process.env.DATABASE_URL = appUrl;
  app = postgres(appUrl, { max: 1 });
  database = await import('../src');

  await admin`
    INSERT INTO idempotency_records (
      id, tenant_id, idempotency_key, request_hash, response_status,
      response_headers, response_body, expires_at
    ) VALUES
      ('01J0000000000000000000010A', ${tenantA}, 'tenant-a-seed-key', ${'a'.repeat(64)},
       201, '{}'::jsonb, '{"tenant":"A"}'::jsonb, now() + interval '1 hour'),
      ('01J0000000000000000000010B', ${tenantB}, 'tenant-b-seed-key', ${'b'.repeat(64)},
       201, '{}'::jsonb, '{"tenant":"B"}'::jsonb, now() + interval '1 hour')
  `;
});

afterAll(async () => {
  if (database) await database.closeDatabaseClient();
  if (app) await app.end();
  if (admin) await admin.end();
  if (container) await container.stop();
  delete process.env.DATABASE_URL;
});

describe('tenant row-level security', () => {
  it('uses an application role that cannot bypass row-level security', async () => {
    const [role] = await admin<
      {
        rolbypassrls: boolean;
        rolsuper: boolean;
      }[]
    >`
      SELECT rolbypassrls, rolsuper
      FROM pg_roles
      WHERE rolname = ${appRole}
    `;

    expect(role).toEqual({ rolbypassrls: false, rolsuper: false });

    const protectedTables = await admin<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname IN ('audit_events', 'idempotency_records', 'outbox_events')
      ORDER BY relname
    `;

    expect(protectedTables).toEqual([
      { relname: 'audit_events', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'idempotency_records', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'outbox_events', relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });

  it('defaults to no visible rows when tenant context is absent', async () => {
    const rows = await app`SELECT id FROM idempotency_records ORDER BY id`;

    expect(rows).toEqual([]);
  });

  it('isolates tenant A from tenant B for reads and updates', async () => {
    await database.withTenantTransaction(
      {
        tenantId: tenantA,
        subjectId: '01J0000000000000000000020A',
        requestId: '01J0000000000000000000030A',
        permissions: ['idempotency:read', 'idempotency:update'],
      },
      async (tx) => {
        const visible = await tx.execute<{ tenant_id: string }>(
          sql`SELECT tenant_id FROM idempotency_records ORDER BY tenant_id`
        );
        expect([...visible]).toEqual([{ tenant_id: tenantA }]);

        const updated = await tx.execute<{ id: string }>(sql`
          UPDATE idempotency_records
          SET response_status = 202
          WHERE tenant_id = ${tenantB}
          RETURNING id
        `);
        expect([...updated]).toEqual([]);
      }
    );

    const [tenantBRow] = await admin<{ response_status: number }[]>`
      SELECT response_status
      FROM idempotency_records
      WHERE tenant_id = ${tenantB}
    `;
    expect(tenantBRow?.response_status).toBe(201);
  });

  it('sets request context only for the transaction and rejects incomplete context', async () => {
    const context = {
      tenantId: tenantA,
      subjectId: '01J0000000000000000000020A',
      requestId: '01J0000000000000000000030A',
      permissions: ['audit:write', 'outbox:write'],
    } as const;

    await database.withTenantTransaction(context, async (tx) => {
      const [settings] = await tx.execute<{
        permissions: string;
        request_id: string;
        subject_id: string;
        tenant_id: string;
      }>(sql`
        SELECT
          current_setting('app.tenant_id', true) AS tenant_id,
          current_setting('app.subject_id', true) AS subject_id,
          current_setting('app.request_id', true) AS request_id,
          current_setting('app.permissions', true) AS permissions
      `);

      expect(settings).toEqual({
        tenant_id: context.tenantId,
        subject_id: context.subjectId,
        request_id: context.requestId,
        permissions: JSON.stringify(context.permissions),
      });
    });

    const [outside] = await app<{ tenant_id: string | null }[]>`
      SELECT nullif(current_setting('app.tenant_id', true), '') AS tenant_id
    `;
    expect(outside?.tenant_id).toBeNull();

    let workOpened = false;
    await expect(
      database.withTenantTransaction({ ...context, subjectId: ' ' }, async () => {
        workOpened = true;
      })
    ).rejects.toThrow('subjectId');
    expect(workOpened).toBe(false);
  });
});

describe('foundation schema guarantees', () => {
  it('uses text ULIDs, UTC-capable timestamps, snapshots, expiry, and dedupe columns', async () => {
    const columns = await admin<{ column_name: string; data_type: string; table_name: string }[]>`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('audit_events', 'id'),
          ('audit_events', 'occurred_at'),
          ('idempotency_records', 'request_hash'),
          ('idempotency_records', 'response_body'),
          ('idempotency_records', 'expires_at'),
          ('outbox_events', 'aggregate_version'),
          ('outbox_events', 'dedupe_key'),
          ('outbox_events', 'occurred_at')
        )
      ORDER BY table_name, column_name
    `;

    expect(columns).toEqual([
      { table_name: 'audit_events', column_name: 'id', data_type: 'text' },
      {
        table_name: 'audit_events',
        column_name: 'occurred_at',
        data_type: 'timestamp with time zone',
      },
      {
        table_name: 'idempotency_records',
        column_name: 'expires_at',
        data_type: 'timestamp with time zone',
      },
      { table_name: 'idempotency_records', column_name: 'request_hash', data_type: 'text' },
      { table_name: 'idempotency_records', column_name: 'response_body', data_type: 'jsonb' },
      { table_name: 'outbox_events', column_name: 'aggregate_version', data_type: 'bigint' },
      { table_name: 'outbox_events', column_name: 'dedupe_key', data_type: 'text' },
      {
        table_name: 'outbox_events',
        column_name: 'occurred_at',
        data_type: 'timestamp with time zone',
      },
    ]);
  });

  it('prevents audit updates and deletes in the database', async () => {
    const context = {
      tenantId: tenantA,
      subjectId: '01J0000000000000000000020A',
      requestId: '01J0000000000000000000030A',
      permissions: ['audit:write'],
    } as const;
    const auditId = '01J0000000000000000000040A';

    await database.withTenantTransaction(context, async (tx) => {
      await tx.execute(sql`
        INSERT INTO audit_events (
          id, tenant_id, subject_id, request_id, action, entity_type, entity_id, payload
        ) VALUES (
          ${auditId}, ${tenantA}, ${context.subjectId}, ${context.requestId},
          'created', 'idempotency_record', '01J0000000000000000000010A', '{"before":null}'::jsonb
        )
      `);
    });

    await expect(
      database.withTenantTransaction(context, async (tx) => {
        await tx.execute(sql`
          UPDATE audit_events SET payload = '{"tampered":true}'::jsonb WHERE id = ${auditId}
        `);
      })
    ).rejects.toMatchObject({
      cause: { code: '55000', message: expect.stringMatching(/immutable/i) },
    });

    await expect(
      database.withTenantTransaction(context, async (tx) => {
        await tx.execute(sql`DELETE FROM audit_events WHERE id = ${auditId}`);
      })
    ).rejects.toMatchObject({
      cause: { code: '55000', message: expect.stringMatching(/immutable/i) },
    });
  });
});
