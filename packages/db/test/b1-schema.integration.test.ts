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
  'customer_credit_policies',
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
  'impersonation_sessions',
  'import_jobs',
  'import_rows',
  'inventory_balances',
  'inventory_ledger_entries',
  'linehaul_bookings',
  'load_unit_items',
  'load_units',
  'oauth_identities',
  'oauth_states',
  'order_batch_items',
  'order_batch_jobs',
  'orders',
  'organizations',
  'partners',
  'permission_actions',
  'permission_simulations',
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
  'reference_data_items',
  'reference_data_sets',
  'reference_data_versions',
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
  'tenant_entitlements',
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
const actorA = '01J1000000000000000000050A';
const subjectA = '01J1000000000000000000051A';
const subjectB = '01J1000000000000000000051B';
const deviceA = '01J1000000000000000000060A';

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
    INSERT INTO users (
      id, tenant_id, organization_id, login_name_normalized, display_name,
      password_hash, status
    ) VALUES
      (${actorA}, ${tenantA}, ${organizationA}, 'actor.a', 'Actor A', '$argon2id$test-a', 'ACTIVE'),
      (${subjectA}, ${tenantA}, ${organizationA}, 'subject.a', 'Subject A', NULL, 'ACTIVE'),
      (${subjectB}, ${tenantB}, ${organizationB}, 'subject.b', 'Subject B', NULL, 'ACTIVE')
  `;
  await admin`
    INSERT INTO devices (
      id, tenant_id, device_code, display_name, platform, credential_hash, status
    ) VALUES (
      ${deviceA}, ${tenantA}, 'PDA-A', 'PDA A', 'PDA_ANDROID', ${'a'.repeat(64)}, 'ACTIVE'
    )
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

  it('aligns tenant, canonical permissions and PDA bindings/tasks with the generated contract', async () => {
    const [tenant] = await admin<{ status: string; version: string }[]>`
      INSERT INTO tenants (id, slug, display_name)
      VALUES ('01J1000000000000000000900A', 'tenant-contract', 'Tenant Contract')
      RETURNING status, version::text
    `;
    expect(tenant).toEqual({ status: 'ACTIVE', version: '1' });

    await expect(
      admin`
        INSERT INTO tenants (id, slug, display_name, status)
        VALUES ('01J1000000000000000000900B', 'tenant-closed', 'Tenant Closed', 'CLOSED')
      `
    ).rejects.toMatchObject({ code: '23514' });
    await admin`
      UPDATE tenants SET status = 'EXPIRED'
      WHERE id = '01J1000000000000000000900A'
    `;

    await admin`
      INSERT INTO permission_actions (action_code, resource_type, description)
      VALUES ('platform.tenant.manage', 'tenant', 'Manage tenants')
    `;
    await expect(
      admin`
        INSERT INTO permission_actions (action_code, resource_type, description)
        VALUES ('tenant:manage', 'tenant', 'Legacy separator')
      `
    ).rejects.toMatchObject({ code: '23514' });

    const [binding] = await admin<{ bound_subject_user_id: string }[]>`
      INSERT INTO device_bindings (
        id, tenant_id, device_id, warehouse_id, bound_by_user_id, bound_subject_user_id
      ) VALUES (
        '01J1000000000000000000910A', ${tenantA}, ${deviceA}, ${warehouseA}, ${actorA}, ${subjectA}
      )
      RETURNING bound_subject_user_id
    `;
    expect(binding?.bound_subject_user_id).toBe(subjectA);

    const [task] = await admin<{ priority: string; task_type: string; version: string }[]>`
      INSERT INTO device_tasks (
        id, tenant_id, warehouse_id, assigned_device_id, assigned_user_id,
        task_type, task_number, priority
      ) VALUES (
        '01J1000000000000000000920A', ${tenantA}, ${warehouseA}, ${deviceA}, ${subjectA},
        'DISPATCH', 'TASK-CONTRACT', 'URGENT'
      )
      RETURNING task_type, priority, version::text
    `;
    expect(task).toEqual({ task_type: 'DISPATCH', priority: 'URGENT', version: '1' });
  });

  it('aligns rates and fulfillment states, transition guards and aggregate versions', async () => {
    await admin`
      INSERT INTO orders (
        id, tenant_id, order_number, customer_id, pickup_address_id,
        delivery_address_id, state, submitted_at, idempotency_key
      ) VALUES (
        '01J1000000000000000001100A', ${tenantA}, 'ORD-CANONICAL', ${customerA},
        ${addressA}, ${addressA}, 'SUBMITTED', now(), 'order-canonical'
      )
    `;
    const [waybill] = await admin<{ state: string; version: string }[]>`
      INSERT INTO waybills (
        id, tenant_id, waybill_number, tracking_number, order_id,
        state, idempotency_key, issued_at
      ) VALUES (
        '01J1000000000000000001110A', ${tenantA}, 'WB-CANONICAL', 'TRACK-CANONICAL',
        '01J1000000000000000001100A', 'AWAITING_RECEIPT', 'waybill-canonical', now()
      )
      RETURNING state, version::text
    `;
    expect(waybill).toEqual({ state: 'AWAITING_RECEIPT', version: '1' });

    await admin`
      INSERT INTO waybill_packages (
        id, tenant_id, waybill_id, package_number, actual_weight_grams,
        length_mm, width_mm, height_mm
      ) VALUES (
        '01J1000000000000000001120A', ${tenantA}, '01J1000000000000000001110A',
        1, 1000, 100, 100, 100
      )
    `;
    await admin`
      INSERT INTO warehouse_scans (
        id, tenant_id, warehouse_id, device_id, client_event_id,
        scan_code, scan_kind, occurred_at
      ) VALUES (
        '01J1000000000000000001130A', ${tenantA}, ${warehouseA}, ${deviceA},
        'event-canonical', 'TRACK-CANONICAL', 'RECEIVE', now()
      )
    `;
    const [scanned] = await admin<{ status: string; version: string }[]>`
      INSERT INTO warehouse_receipts (
        id, tenant_id, receipt_no, warehouse_id, waybill_id, scan_id, undo_until
      ) VALUES (
        '01J1000000000000000001140A', ${tenantA}, 'REC-CANONICAL', ${warehouseA},
        '01J1000000000000000001110A', '01J1000000000000000001130A', now() + interval '1 hour'
      )
      RETURNING status, version::text
    `;
    expect(scanned).toEqual({ status: 'SCANNED', version: '1' });
    const [confirmed] = await admin<{ status: string; version: string }[]>`
      UPDATE warehouse_receipts SET status = 'CONFIRMED', version = 2
      WHERE id = '01J1000000000000000001140A'
      RETURNING status, version::text
    `;
    expect(confirmed).toEqual({ status: 'CONFIRMED', version: '2' });
    const [undone] = await admin<{ status: string; version: string }[]>`
      UPDATE warehouse_receipts
      SET status = 'UNDONE', version = 3, undone_at = now(), undo_reason = 'Operator correction'
      WHERE id = '01J1000000000000000001140A'
      RETURNING status, version::text
    `;
    expect(undone).toEqual({ status: 'UNDONE', version: '3' });

    const [openLoad] = await admin<{ status: string; version: string }[]>`
      INSERT INTO load_units (
        id, tenant_id, load_unit_no, origin_warehouse_id, destination_warehouse_id
      ) VALUES (
        '01J1000000000000000001150A', ${tenantA}, 'LU-CANONICAL', ${warehouseA}, ${warehouseA2}
      )
      RETURNING status, version::text
    `;
    expect(openLoad).toEqual({ status: 'OPEN', version: '1' });
    await admin`
      INSERT INTO load_unit_items (
        id, tenant_id, load_unit_id, waybill_id, package_id, item_sequence
      ) VALUES (
        '01J1000000000000000001160A', ${tenantA}, '01J1000000000000000001150A',
        '01J1000000000000000001110A', '01J1000000000000000001120A', 1
      )
    `;
    await admin`
      UPDATE load_units SET status = 'SEALED', version = 2, sealed_at = now()
      WHERE id = '01J1000000000000000001150A'
    `;
    await admin`
      UPDATE load_units SET status = 'DISPATCHED', version = 3, dispatched_at = now()
      WHERE id = '01J1000000000000000001150A'
    `;

    const [booking] = await admin<{ status: string; version: string }[]>`
      INSERT INTO linehaul_bookings (
        id, tenant_id, booking_no, load_unit_id, carrier_code, status
      ) VALUES (
        '01J1000000000000000001170A', ${tenantA}, 'BOOK-CANONICAL',
        '01J1000000000000000001150A', 'CARRIER', 'CLOSED'
      )
      RETURNING status, version::text
    `;
    expect(booking).toEqual({ status: 'CLOSED', version: '1' });

    const [delivery] = await admin<{ status: string; version: string }[]>`
      INSERT INTO delivery_tasks (
        id, tenant_id, task_no, waybill_id, customer_id, destination_address_id, status
      ) VALUES (
        '01J1000000000000000001180A', ${tenantA}, 'DELIVERY-CANONICAL',
        '01J1000000000000000001110A', ${customerA}, ${addressA}, 'PLANNED'
      )
      RETURNING status, version::text
    `;
    expect(delivery).toEqual({ status: 'PLANNED', version: '1' });

    const [importJob] = await admin<{ state: string; version: string }[]>`
      INSERT INTO import_jobs (
        id, tenant_id, import_number, import_type, source_object_key,
        source_sha256, state, idempotency_key
      ) VALUES (
        '01J1000000000000000001190A', ${tenantA}, 'IMPORT-CANONICAL', 'ORDERS',
        'imports/canonical.csv', ${'c'.repeat(64)}, 'MAPPING', 'import-canonical'
      )
      RETURNING state, version::text
    `;
    expect(importJob).toEqual({ state: 'MAPPING', version: '1' });

    const [conflictConstraint] = await admin<{ definition: string }[]>`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'device_sync_conflicts_resolution_check'
    `;
    expect(conflictConstraint?.definition).toContain('KEEP_SERVER');
    expect(conflictConstraint?.definition).toContain('REAPPLY_LOCAL');
    expect(conflictConstraint?.definition).toContain('SUBMIT_MANUAL');
  });

  it('persists the missing identity P0 aggregates with immutable version history', async () => {
    await admin`
      INSERT INTO tenant_entitlements (
        id, tenant_id, module_code, entitlement_version, state,
        quota_limit, usage_value, valid_from, created_by_user_id
      ) VALUES (
        '01J1000000000000000001000A', ${tenantA}, 'WAREHOUSE', 1, 'ACTIVE',
        100, 10, now(), ${actorA}
      )
    `;
    await expect(
      admin`
        UPDATE tenant_entitlements SET quota_limit = 200
        WHERE id = '01J1000000000000000001000A'
      `
    ).rejects.toMatchObject({ code: '55000' });

    await admin`
      INSERT INTO impersonation_sessions (
        id, tenant_id, actor_subject_id, reason, started_at, expires_at
      ) VALUES (
        '01J1000000000000000001010A', ${tenantA}, 'platform-actor',
        'Investigate customer support incident', now(), now() + interval '15 minutes'
      )
    `;
    await admin`
      INSERT INTO oauth_identities (
        id, tenant_id, user_id, provider, provider_subject_hash
      ) VALUES (
        '01J1000000000000000001020A', ${tenantA}, ${subjectA}, 'WECHAT', ${'b'.repeat(64)}
      )
    `;
    await expect(
      admin`
        INSERT INTO oauth_identities (
          id, tenant_id, user_id, provider, provider_subject_hash
        ) VALUES (
          '01J1000000000000000001020B', ${tenantB}, ${subjectB}, 'WECHAT', ${'b'.repeat(64)}
        )
      `
    ).rejects.toMatchObject({ code: '23505' });

    await admin`
      INSERT INTO partners (
        id, tenant_id, partner_code, display_name, partner_type
      ) VALUES (
        '01J1000000000000000001030A', ${tenantA}, 'PARTNER-A', 'Partner A', 'LAST_MILE'
      )
    `;

    await admin`
      INSERT INTO reference_data_sets (id, tenant_id, set_code, display_name)
      VALUES ('01J1000000000000000001040A', ${tenantA}, 'COUNTRY', 'Countries')
    `;
    await admin`
      INSERT INTO reference_data_versions (
        id, tenant_id, reference_data_set_id, version_number, state, created_by_user_id
      ) VALUES (
        '01J1000000000000000001050A', ${tenantA}, '01J1000000000000000001040A',
        1, 'DRAFT', ${actorA}
      )
    `;
    await admin`
      INSERT INTO reference_data_items (
        id, tenant_id, reference_data_version_id, item_key, item_payload
      ) VALUES (
        '01J1000000000000000001060A', ${tenantA}, '01J1000000000000000001050A',
        'CN', '{"name":"China"}'::jsonb
      )
    `;
    await admin`
      UPDATE reference_data_versions
      SET state = 'PUBLISHED', published_at = now()
      WHERE id = '01J1000000000000000001050A'
    `;
    await admin`
      UPDATE reference_data_sets
      SET current_version_id = '01J1000000000000000001050A', version = 2
      WHERE id = '01J1000000000000000001040A'
    `;
    await expect(
      admin`
        UPDATE reference_data_items SET item_payload = '{"name":"tampered"}'::jsonb
        WHERE id = '01J1000000000000000001060A'
      `
    ).rejects.toMatchObject({ code: '55000' });

    await admin`
      INSERT INTO customer_credit_policies (
        id, tenant_id, customer_id, policy_version, currency,
        credit_limit_minor, payment_cycle, hold_policy, created_by_user_id
      ) VALUES (
        '01J1000000000000000001070A', ${tenantA}, ${customerA}, 1, 'CNY',
        100000, 'MONTHLY', 'AUTO_HOLD', ${actorA}
      )
    `;
    await expect(
      admin`
        INSERT INTO customer_credit_policies (
          id, tenant_id, customer_id, policy_version, currency,
          credit_limit_minor, payment_cycle, hold_policy, created_by_user_id
        ) VALUES (
          '01J1000000000000000001071A', ${tenantA}, ${customerA}, 2, 'CNY',
          -1, 'MONTHLY', 'AUTO_HOLD', ${actorA}
        )
      `
    ).rejects.toMatchObject({ code: '23514' });

    await admin`
      INSERT INTO permission_simulations (
        id, tenant_id, actor_user_id, subject_user_id, proposed_policy, expires_at
      ) VALUES (
        '01J1000000000000000001080A', ${tenantA}, ${actorA}, ${subjectA},
        '{"statements":[]}'::jsonb, now() + interval '15 minutes'
      )
    `;
  });

  it('exposes pre-tenant password lookup only through a fixed-search-path auth capability', async () => {
    const [boundary] = await admin<
      { config: string[] | null; execute_allowed: boolean; security_definer: boolean }[]
    >`
      SELECT
        p.prosecdef AS security_definer,
        p.proconfig AS config,
        has_function_privilege(
          'zhili_auth',
          'public.auth_lookup_password(text,text)',
          'EXECUTE'
        ) AS execute_allowed
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'auth_lookup_password'
    `;
    expect(boundary).toEqual({
      security_definer: true,
      config: ['search_path=pg_catalog, public'],
      execute_allowed: true,
    });

    const [privilege] = await admin<{ can_select_users: boolean }[]>`
      SELECT has_table_privilege('zhili_auth', 'public.users', 'SELECT') AS can_select_users
    `;
    expect(privilege?.can_select_users).toBe(false);

    await admin.unsafe("ALTER ROLE zhili_auth WITH LOGIN PASSWORD 'integration-auth-only'");
    const authUrl = new URL(container.getConnectionUri());
    authUrl.username = 'zhili_auth';
    authUrl.password = 'integration-auth-only';
    const auth = postgres(authUrl.toString(), { max: 1 });
    try {
      const [credential] = await auth<
        { password_hash: string; tenant_id: string; user_id: string }[]
      >`SELECT tenant_id, user_id, password_hash FROM auth_lookup_password('actor.a', 'tenant-a')`;
      expect(credential).toEqual({
        tenant_id: tenantA,
        user_id: actorA,
        password_hash: '$argon2id$test-a',
      });
      await expect(auth`SELECT id FROM users LIMIT 1`).rejects.toMatchObject({ code: '42501' });
    } finally {
      await auth.end();
    }
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
