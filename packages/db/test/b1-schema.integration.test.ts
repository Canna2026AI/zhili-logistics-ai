import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const expectedDomainTables = [
  'attachments',
  'bills_of_lading',
  'customer_addresses',
  'customers',
  'customs_declarations',
  'declaration_items',
  'delivery_task_events',
  'delivery_tasks',
  'device_bindings',
  'device_event_media_claims',
  'device_event_receipts',
  'device_sync_conflicts',
  'device_sync_sessions',
  'device_tasks',
  'devices',
  'fba_deliveries',
  'import_jobs',
  'import_rows',
  'inventory_balances',
  'inventory_ledger_entries',
  'linehaul_bookings',
  'load_unit_items',
  'load_units',
  'oauth_states',
  'order_batch_items',
  'order_batch_jobs',
  'orders',
  'organizations',
  'permission_actions',
  'pod_records',
  'pod_versions',
  'print_jobs',
  'quote_acceptances',
  'quote_charge_lines',
  'quote_explanations',
  'quote_options',
  'quote_parcels',
  'quote_versions',
  'quotes',
  'rate_card_versions',
  'rate_cards',
  'rate_rules',
  'refresh_token_families',
  'refresh_tokens',
  'role_grant_customer_scopes',
  'role_grant_field_policies',
  'role_grant_organization_scopes',
  'role_grant_warehouse_scopes',
  'role_grants',
  'roles',
  'route_decisions',
  'sessions',
  'shipping_channels',
  'tenants',
  'user_role_assignments',
  'users',
  'warehouse_measurements',
  'warehouse_media',
  'warehouse_receipts',
  'warehouse_scans',
  'warehouses',
  'waybill_packages',
  'waybills',
] as const;

const tenantA = '01J1000000000000000000000A';
const tenantB = '01J1000000000000000000000B';
const organizationA = '01J1000000000000000000010A';
const organizationB = '01J1000000000000000000010B';
const customerA = '01J1000000000000000000020A';
const customerB = '01J1000000000000000000020B';
const addressA = '01J1000000000000000000030A';
const addressB = '01J1000000000000000000030B';
const warehouseA = '01J1000000000000000000040A';
const warehouseA2 = '01J1000000000000000000041A';

let container: StartedPostgreSqlContainer;
let admin: Sql;
let firstFingerprint = '';

async function migrateUp(): Promise<void> {
  await migrate(drizzle(admin), { migrationsFolder: resolve(packageRoot, 'migrations') });
}

async function schemaFingerprint(): Promise<string> {
  const rows = await admin<
    {
      definition: string;
      kind: string;
      name: string;
      parent: string;
    }[]
  >`
    WITH schema_objects AS (
      SELECT
        'column'::text AS kind,
        c.table_name::text AS parent,
        c.column_name::text AS name,
        concat_ws('|', c.ordinal_position, c.data_type, c.udt_name, c.is_nullable,
          c.column_default, c.is_generated, c.generation_expression)::text AS definition
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      UNION ALL
      SELECT 'constraint', con.conrelid::regclass::text, con.conname,
        pg_get_constraintdef(con.oid, true)
      FROM pg_constraint con
      JOIN pg_namespace n ON n.oid = con.connamespace
      WHERE n.nspname = 'public'
      UNION ALL
      SELECT 'index', idx.tablename, idx.indexname, idx.indexdef
      FROM pg_indexes idx
      WHERE idx.schemaname = 'public'
      UNION ALL
      SELECT 'policy', pol.tablename, pol.policyname,
        concat_ws('|', pol.permissive, pol.roles::text, pol.cmd, pol.qual, pol.with_check)
      FROM pg_policies pol
      WHERE pol.schemaname = 'public'
      UNION ALL
      SELECT 'trigger', trigger.event_object_table, trigger.trigger_name,
        concat_ws('|', trigger.event_manipulation, trigger.action_timing,
          trigger.action_orientation, trigger.action_statement)
      FROM information_schema.triggers trigger
      WHERE trigger.trigger_schema = 'public'
    )
    SELECT kind, parent, name, definition
    FROM schema_objects
    ORDER BY kind, parent, name, definition
  `;

  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

async function seedCrossDomainParents(): Promise<void> {
  await admin`
    INSERT INTO tenants (id, slug, display_name) VALUES
      (${tenantA}, 'tenant-a', 'Tenant A'),
      (${tenantB}, 'tenant-b', 'Tenant B')
  `;
  await admin`
    INSERT INTO organizations (id, tenant_id, code, display_name, organization_type) VALUES
      (${organizationA}, ${tenantA}, 'ROOT-A', 'Root A', 'TENANT_ROOT'),
      (${organizationB}, ${tenantB}, 'ROOT-B', 'Root B', 'TENANT_ROOT')
  `;
  await admin`
    INSERT INTO warehouses (id, tenant_id, organization_id, code, display_name) VALUES
      (${warehouseA}, ${tenantA}, ${organizationA}, 'WH-A', 'Warehouse A'),
      (${warehouseA2}, ${tenantA}, ${organizationA}, 'WH-A2', 'Warehouse A2')
  `;
  await admin`
    INSERT INTO customers (id, tenant_id, organization_id, customer_number, display_name) VALUES
      (${customerA}, ${tenantA}, ${organizationA}, 'CUST-A', 'Customer A'),
      (${customerB}, ${tenantB}, ${organizationB}, 'CUST-B', 'Customer B')
  `;
  await admin`
    INSERT INTO customer_addresses (
      id, tenant_id, customer_id, address_code, address_type, contact_name,
      country_code, city, line1
    ) VALUES
      (${addressA}, ${tenantA}, ${customerA}, 'A-1', 'PICKUP', 'A', 'CN', 'Shanghai', 'Line 1'),
      (${addressB}, ${tenantB}, ${customerB}, 'B-1', 'DELIVERY', 'B', 'CN', 'Beijing', 'Line 1');
  `;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  admin = postgres(container.getConnectionUri(), { max: 4 });
  await migrateUp();
});

afterAll(async () => {
  if (admin) await admin.end();
  if (container) await container.stop();
});

describe('B1 ordered domain migration', () => {
  it('creates the reviewed identity, rates/waybills and warehouse/linehaul schema', async () => {
    const tables = await admin<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY(${expectedDomainTables as unknown as string[]})
      ORDER BY table_name
    `;

    expect(tables.map(({ table_name }) => table_name)).toEqual([...expectedDomainTables]);

    const tenantTablesWithoutForcedRls = await admin<{ table_name: string }[]>`
      SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_schema = n.nspname AND col.table_name = c.relname
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND col.column_name = 'tenant_id'
        AND c.relname <> 'permission_actions'
        AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
      ORDER BY c.relname
    `;
    expect(tenantTablesWithoutForcedRls).toEqual([]);

    const policies = await admin<{ table_name: string }[]>`
      SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_schema = n.nspname AND col.table_name = c.relname
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND col.column_name = 'tenant_id'
        AND NOT EXISTS (
          SELECT 1 FROM pg_policy p
          WHERE p.polrelid = c.oid
            AND pg_get_expr(p.polqual, p.polrelid) LIKE '%app.tenant_id%'
            AND pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%app.tenant_id%'
        )
      ORDER BY c.relname
    `;
    expect(policies).toEqual([]);

    const representativeTenantForeignKeys = await admin<{ conname: string }[]>`
      SELECT conname
      FROM pg_constraint
      WHERE contype = 'f'
        AND conname IN (
          'customer_addresses_customer_fk',
          'quotes_customer_fk',
          'quote_options_version_fk',
          'waybill_packages_waybill_fk',
          'inventory_balances_package_waybill_fk',
          'delivery_tasks_address_customer_fk'
        )
        AND array_length(conkey, 1) >= 2
      ORDER BY conname
    `;
    expect(representativeTenantForeignKeys.map(({ conname }) => conname)).toEqual([
      'customer_addresses_customer_fk',
      'delivery_tasks_address_customer_fk',
      'inventory_balances_package_waybill_fk',
      'quote_options_version_fk',
      'quotes_customer_fk',
      'waybill_packages_waybill_fk',
    ]);

    firstFingerprint = await schemaFingerprint();
    expect(firstFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('enforces tenant ownership, measurements, state, quote immutability and load-unit locks', async () => {
    await seedCrossDomainParents();

    await expect(
      admin`
        INSERT INTO orders (
          id, tenant_id, order_number, customer_id, pickup_address_id,
          delivery_address_id, idempotency_key
        ) VALUES (
          '01J1000000000000000000100A', ${tenantA}, 'ORD-A', ${customerA},
          ${addressA}, ${addressB}, 'order-a'
        )
      `
    ).rejects.toMatchObject({ code: '23503' });

    await admin`
      INSERT INTO shipping_channels (id, tenant_id, code, name)
      VALUES ('01J1000000000000000000200A', ${tenantA}, 'DIRECT', 'Direct')
    `;
    await admin`
      INSERT INTO quotes (
        id, tenant_id, quote_number, customer_id, requested_currency, idempotency_key
      ) VALUES (
        '01J1000000000000000000210A', ${tenantA}, 'Q-A', ${customerA}, 'CNY', 'quote-a'
      )
    `;
    await admin`
      INSERT INTO quote_versions (
        id, tenant_id, quote_id, version_number, input_snapshot, valid_until
      ) VALUES (
        '01J1000000000000000000220A', ${tenantA}, '01J1000000000000000000210A',
        1, '{}'::jsonb, now() + interval '1 hour'
      );
    `;

    await expect(
      admin`
        INSERT INTO quote_parcels (
          id, tenant_id, quote_version_id, parcel_number, actual_weight_grams,
          length_mm, width_mm, height_mm
        ) VALUES (
          '01J1000000000000000000230A', ${tenantA}, '01J1000000000000000000220A',
          1, 0, 100, 100, 100
        )
      `
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      admin`
        UPDATE quote_versions SET input_snapshot = '{"tampered":true}'::jsonb
        WHERE id = '01J1000000000000000000220A'
      `
    ).rejects.toMatchObject({ code: '55000' });

    await expect(
      admin`
        INSERT INTO waybills (
          id, tenant_id, waybill_number, tracking_number, order_id,
          state, idempotency_key
        ) VALUES (
          '01J1000000000000000000300A', ${tenantA}, 'WB-A', 'TRACK-A',
          '01J1000000000000000000100A', 'UNKNOWN', 'waybill-a'
        )
      `
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      admin`
        INSERT INTO load_units (
          id, tenant_id, load_unit_no, origin_warehouse_id, destination_warehouse_id,
          status, version, sealed_at
        ) VALUES (
          '01J1000000000000000000400A', ${tenantA}, 'LU-A', ${warehouseA},
          ${warehouseA2}, 'SEALED', 1, now()
        )
      `
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('survives a reversible schema reset/down and produces an identical second-up fingerprint', async () => {
    expect(firstFingerprint).not.toBe('');
    await admin.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await admin`GRANT ALL ON SCHEMA public TO CURRENT_USER`;
    await admin`DELETE FROM drizzle.__drizzle_migrations`;

    await migrateUp();

    const secondFingerprint = await schemaFingerprint();
    expect(secondFingerprint).toBe(firstFingerprint);
  });
});
