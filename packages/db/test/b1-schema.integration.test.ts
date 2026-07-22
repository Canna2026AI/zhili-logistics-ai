import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const snapshotPath = resolve(packageRoot, 'migrations/meta/0002_snapshot.json');
const domainDownMigrationPath = resolve(packageRoot, 'migrations/down/0001_b1_domains.down.sql');
const alignmentDownMigrationPath = resolve(
  packageRoot,
  'migrations/down/0002_b1_persistence_alignment.down.sql'
);
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
const versionedAggregateTables = [
  'attachments',
  'bills_of_lading',
  'customer_addresses',
  'customers',
  'customs_declarations',
  'delivery_tasks',
  'device_bindings',
  'device_sync_conflicts',
  'device_tasks',
  'devices',
  'fba_deliveries',
  'impersonation_sessions',
  'import_jobs',
  'inventory_balances',
  'linehaul_bookings',
  'load_units',
  'oauth_identities',
  'oauth_states',
  'order_batch_jobs',
  'orders',
  'organizations',
  'partners',
  'permission_simulations',
  'print_jobs',
  'quotes',
  'rate_cards',
  'rate_rules',
  'reference_data_sets',
  'refresh_token_families',
  'refresh_tokens',
  'role_grant_customer_scopes',
  'role_grant_field_policies',
  'role_grant_organization_scopes',
  'role_grant_warehouse_scopes',
  'role_grants',
  'roles',
  'sessions',
  'shipping_channels',
  'tenants',
  'user_role_assignments',
  'users',
  'warehouse_receipts',
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
const actorB = '01J1000000000000000000052B';
const deviceA = '01J1000000000000000000060A';
const controlRoleA = '01J1000000000000000000070A';
const controlAssignmentA = '01J1000000000000000000071A';
const narrowControlRoleA = '01J1000000000000000000075A';
const narrowControlAssignmentA = '01J1000000000000000000076A';
const controlTenantC = '01J1000000000000000000000C';
const deniedTenantD = '01J1000000000000000000000D';
const realPasswordHash =
  '$argon2id$v=19$m=65536,t=3,p=1$emhpbGktYXV0aC1yZWFsLWE$MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const dummyCredential = {
  tenant_id: '00000000000000000000000000',
  user_id: '00000000000000000000000001',
  password_hash:
    '$argon2id$v=19$m=65536,t=3,p=1$emhpbGktYXV0aC1kdW1teQ$YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk',
} as const;

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
      UNION ALL
      SELECT 'function', n.nspname, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
        concat_ws('|', p.prosecdef, p.proconfig::text, p.proacl::text, pg_get_functiondef(p.oid))
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
      UNION ALL
      SELECT 'role', 'cluster', r.rolname,
        concat_ws('|', r.rolsuper, r.rolinherit, r.rolcreaterole, r.rolcreatedb,
          r.rolcanlogin, r.rolreplication, r.rolbypassrls)
      FROM pg_roles r
      WHERE r.rolname IN ('zhili_app', 'zhili_worker', 'zhili_auth', 'zhili_control_plane')
      UNION ALL
      SELECT 'role_membership', member_role.rolname, granted_role.rolname,
        concat_ws('|', membership.admin_option, grantor.rolname)
      FROM pg_auth_members membership
      JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
      JOIN pg_roles member_role ON member_role.oid = membership.member
      JOIN pg_roles grantor ON grantor.oid = membership.grantor
      WHERE granted_role.rolname LIKE 'zhili_%' OR member_role.rolname LIKE 'zhili_%'
      UNION ALL
      SELECT 'table_security', n.nspname, c.relname,
        concat_ws('|', c.relrowsecurity, c.relforcerowsecurity, c.relacl::text)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      UNION ALL
      SELECT 'extension', 'cluster', e.extname,
        concat_ws('|', e.extversion, owner_role.rolname, n.nspname)
      FROM pg_extension e
      JOIN pg_roles owner_role ON owner_role.oid = e.extowner
      JOIN pg_namespace n ON n.oid = e.extnamespace
    )
    SELECT kind, parent, name, definition
    FROM schema_objects
    ORDER BY kind, parent, name, definition
  `;

  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

interface ConstraintMapping {
  readonly columnsFrom: readonly string[];
  readonly columnsTo?: readonly string[];
  readonly name: string;
  readonly tableFrom: string;
  readonly tableTo?: string;
}

interface IndexColumnMapping {
  readonly asc: boolean;
  readonly expression: string;
  readonly nulls: 'first' | 'last';
  readonly opclass: string;
}

interface IndexMapping {
  readonly columns: readonly IndexColumnMapping[];
  readonly isUnique: boolean;
  readonly method: string;
  readonly name: string;
  readonly tableFrom: string;
}

function normalizeIndexExpression(expression: string): string {
  const normalized = expression
    .replace(/::text/g, '')
    .replace(/\s+(?:ASC|DESC)(?:\s+NULLS\s+(?:FIRST|LAST))?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.startsWith('(') && normalized.endsWith(')')
    ? normalized.slice(1, -1).trim()
    : normalized;
}

async function liveConstraintMappings(): Promise<{
  readonly foreignKeys: readonly ConstraintMapping[];
  readonly uniqueConstraints: readonly ConstraintMapping[];
}> {
  const foreignKeys = await admin<ConstraintMapping[]>`
    SELECT
      constraint_row.conname AS name,
      child.relname AS "tableFrom",
      parent.relname AS "tableTo",
      ARRAY(
        SELECT child_attribute.attname
        FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_attribute child_attribute
          ON child_attribute.attrelid = constraint_row.conrelid
         AND child_attribute.attnum = key_column.attnum
        ORDER BY key_column.position
      ) AS "columnsFrom",
      ARRAY(
        SELECT parent_attribute.attname
        FROM unnest(constraint_row.confkey) WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_attribute parent_attribute
          ON parent_attribute.attrelid = constraint_row.confrelid
         AND parent_attribute.attnum = key_column.attnum
        ORDER BY key_column.position
      ) AS "columnsTo"
    FROM pg_constraint constraint_row
    JOIN pg_class child ON child.oid = constraint_row.conrelid
    JOIN pg_namespace child_namespace ON child_namespace.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = constraint_row.confrelid
    WHERE constraint_row.contype = 'f'
      AND child_namespace.nspname = 'public'
      AND child.relname = ANY(${expectedDomainTables as unknown as string[]})
    ORDER BY child.relname, constraint_row.conname
  `;
  const uniqueConstraints = await admin<ConstraintMapping[]>`
    SELECT
      constraint_row.conname AS name,
      child.relname AS "tableFrom",
      ARRAY(
        SELECT child_attribute.attname
        FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, position)
        JOIN pg_attribute child_attribute
          ON child_attribute.attrelid = constraint_row.conrelid
         AND child_attribute.attnum = key_column.attnum
        ORDER BY key_column.position
      ) AS "columnsFrom"
    FROM pg_constraint constraint_row
    JOIN pg_class child ON child.oid = constraint_row.conrelid
    JOIN pg_namespace child_namespace ON child_namespace.oid = child.relnamespace
    WHERE constraint_row.contype = 'u'
      AND child_namespace.nspname = 'public'
      AND child.relname = ANY(${expectedDomainTables as unknown as string[]})
    ORDER BY child.relname, constraint_row.conname
  `;
  return { foreignKeys, uniqueConstraints };
}

async function snapshotConstraintMappings(): Promise<{
  readonly foreignKeys: readonly ConstraintMapping[];
  readonly uniqueConstraints: readonly ConstraintMapping[];
}> {
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
    readonly tables: Readonly<
      Record<
        string,
        {
          readonly foreignKeys: Readonly<
            Record<
              string,
              {
                readonly columnsFrom: readonly string[];
                readonly columnsTo: readonly string[];
                readonly name: string;
                readonly tableFrom: string;
                readonly tableTo: string;
              }
            >
          >;
          readonly name: string;
          readonly uniqueConstraints: Readonly<
            Record<string, { readonly columns: readonly string[]; readonly name: string }>
          >;
        }
      >
    >;
  };
  const domainTableNames = new Set<string>(expectedDomainTables);
  const tables = Object.values(snapshot.tables).filter(({ name }) => domainTableNames.has(name));
  return {
    foreignKeys: tables
      .flatMap(({ foreignKeys }) => Object.values(foreignKeys))
      .map(({ columnsFrom, columnsTo, name, tableFrom, tableTo }) => ({
        columnsFrom,
        columnsTo,
        name,
        tableFrom,
        tableTo,
      }))
      .sort((left, right) =>
        `${left.tableFrom}.${left.name}`.localeCompare(`${right.tableFrom}.${right.name}`)
      ),
    uniqueConstraints: tables
      .flatMap(({ name: tableFrom, uniqueConstraints }) =>
        Object.values(uniqueConstraints).map(({ columns, name }) => ({
          columnsFrom: columns,
          name,
          tableFrom,
        }))
      )
      .sort((left, right) =>
        `${left.tableFrom}.${left.name}`.localeCompare(`${right.tableFrom}.${right.name}`)
      ),
  };
}

async function liveIndexMappings(): Promise<readonly IndexMapping[]> {
  const rows = await admin<
    {
      asc: boolean;
      expression: string;
      is_expression: boolean;
      is_unique: boolean;
      method: string;
      name: string;
      nulls: 'first' | 'last';
      opclass: string;
      position: number;
      table_from: string;
    }[]
  >`
    SELECT
      child.relname AS table_from,
      index_relation.relname AS name,
      access_method.amname AS method,
      index_row.indisunique AS is_unique,
      key_column.position::integer AS position,
      key_column.attnum = 0 AS is_expression,
      CASE
        WHEN key_column.attnum = 0
          THEN pg_get_indexdef(index_row.indexrelid, key_column.position::integer, true)
        ELSE attribute_row.attname
      END AS expression,
      (key_column.options & 1) = 0 AS asc,
      CASE WHEN (key_column.options & 2) = 2 THEN 'first' ELSE 'last' END AS nulls,
      CASE WHEN operator_class.opcdefault THEN '<default>' ELSE operator_class.opcname END AS opclass
    FROM pg_index index_row
    JOIN pg_class child ON child.oid = index_row.indrelid
    JOIN pg_namespace child_namespace ON child_namespace.oid = child.relnamespace
    JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
    JOIN pg_am access_method ON access_method.oid = index_relation.relam
    CROSS JOIN LATERAL unnest(
      index_row.indkey::smallint[],
      index_row.indclass::oid[],
      index_row.indoption::smallint[]
    ) WITH ORDINALITY AS key_column(attnum, opclass_oid, options, position)
    LEFT JOIN pg_attribute attribute_row
      ON attribute_row.attrelid = index_row.indrelid
     AND attribute_row.attnum = key_column.attnum
    JOIN pg_opclass operator_class ON operator_class.oid = key_column.opclass_oid
    WHERE child_namespace.nspname = 'public'
      AND child.relname = ANY(${expectedDomainTables as unknown as string[]})
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint constraint_row
        WHERE constraint_row.conindid = index_row.indexrelid
      )
    ORDER BY child.relname, index_relation.relname, key_column.position
  `;

  const indexes = new Map<string, IndexMapping>();
  for (const row of rows) {
    const key = `${row.table_from}.${row.name}`;
    const existing = indexes.get(key);
    const column = {
      expression: row.is_expression ? '<expression>' : normalizeIndexExpression(row.expression),
      asc: row.asc,
      nulls: row.nulls,
      opclass: row.opclass,
    } as const;
    if (existing) {
      indexes.set(key, { ...existing, columns: [...existing.columns, column] });
    } else {
      indexes.set(key, {
        tableFrom: row.table_from,
        name: row.name,
        method: row.method,
        isUnique: row.is_unique,
        columns: [column],
      });
    }
  }
  return [...indexes.values()];
}

async function snapshotIndexMappings(): Promise<readonly IndexMapping[]> {
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
    readonly tables: Readonly<
      Record<
        string,
        {
          readonly indexes: Readonly<
            Record<
              string,
              {
                readonly columns: readonly {
                  readonly asc: boolean;
                  readonly expression: string;
                  readonly isExpression: boolean;
                  readonly nulls: 'first' | 'last';
                  readonly opclass?: string;
                }[];
                readonly isUnique: boolean;
                readonly method: string;
                readonly name: string;
              }
            >
          >;
          readonly name: string;
        }
      >
    >;
  };
  const domainTableNames = new Set<string>(expectedDomainTables);
  return Object.values(snapshot.tables)
    .filter(({ name }) => domainTableNames.has(name))
    .flatMap(({ indexes, name: tableFrom }) =>
      Object.values(indexes).map(({ columns, isUnique, method, name }) => ({
        tableFrom,
        name,
        method,
        isUnique,
        columns: columns.map(({ asc, expression, isExpression, nulls, opclass }) => {
          const expressionDeclaresDescending = isExpression && /\s+DESC$/i.test(expression);
          return {
            expression: isExpression ? '<expression>' : normalizeIndexExpression(expression),
            asc: expressionDeclaresDescending ? false : asc,
            nulls: expressionDeclaresDescending ? 'first' : nulls,
            opclass: opclass ?? '<default>',
          };
        }),
      }))
    )
    .sort((left, right) =>
      `${left.tableFrom}.${left.name}`.localeCompare(`${right.tableFrom}.${right.name}`)
    );
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
      (${actorA}, ${tenantA}, ${organizationA}, 'actor.a', 'Actor A', ${realPasswordHash}, 'ACTIVE'),
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
  it('keeps live keys and index column/opclass mappings identical to Drizzle snapshot', async () => {
    const live = await liveConstraintMappings();
    const snapshot = await snapshotConstraintMappings();

    expect(snapshot.foreignKeys).toEqual(live.foreignKeys);
    expect(snapshot.uniqueConstraints).toEqual(live.uniqueConstraints);
    expect(await snapshotIndexMappings()).toEqual(await liveIndexMappings());
  });

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
        AND c.relname <> 'login_throttle_buckets'
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

  it('starts every API-visible aggregate at version one and exposes a conflict CAS version', async () => {
    const columns = await admin<{ column_default: string | null; table_name: string }[]>`
      SELECT table_name, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'version'
        AND table_name = ANY(${versionedAggregateTables as unknown as string[]})
      ORDER BY table_name
    `;
    expect(columns.map(({ table_name }) => table_name)).toEqual([...versionedAggregateTables]);
    expect(columns.every(({ column_default }) => column_default === '1')).toBe(true);

    const invalidChecks = await admin<{ table_name: string }[]>`
      SELECT child.relname AS table_name
      FROM pg_constraint constraint_row
      JOIN pg_class child ON child.oid = constraint_row.conrelid
      JOIN pg_namespace namespace_row ON namespace_row.oid = child.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND child.relname = ANY(${versionedAggregateTables as unknown as string[]})
        AND constraint_row.conname = child.relname || '_version_check'
        AND pg_get_constraintdef(constraint_row.oid, true) NOT LIKE '%version >= 1%'
      ORDER BY child.relname
    `;
    expect(invalidChecks).toEqual([]);
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
      ON CONFLICT (action_code) DO NOTHING
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
      INSERT INTO reference_data_versions (
        id, tenant_id, reference_data_set_id, version_number, state, created_by_user_id
      ) VALUES (
        '01J1000000000000000001051A', ${tenantA}, '01J1000000000000000001040A',
        2, 'DRAFT', ${actorA}
      )
    `;
    await expect(
      admin`
        UPDATE reference_data_items
        SET reference_data_version_id = '01J1000000000000000001051A',
            item_key = 'CN-MOVED',
            item_payload = '{"name":"moved and tampered"}'::jsonb
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

  it('enforces exact conflict resolution CAS and rejects stale concurrent resolution', async () => {
    await admin`
      INSERT INTO device_sync_sessions (
        id, tenant_id, device_id, warehouse_id, binding_version, expires_at
      ) VALUES (
        '01J1000000000000000001200A', ${tenantA}, ${deviceA}, ${warehouseA}, 1,
        now() + interval '1 hour'
      )
    `;
    await admin.begin(async (transaction) => {
      await transaction`
        INSERT INTO device_event_receipts (
          id, tenant_id, session_id, device_id, warehouse_id, event_id,
          local_sequence, event_type, aggregate_type, aggregate_id,
          expected_version, disposition, server_version, conflict_id, payload, occurred_at
        ) VALUES (
          '01J1000000000000000001210A', ${tenantA}, '01J1000000000000000001200A',
          ${deviceA}, ${warehouseA}, 'event-conflict-cas', 1, 'UPDATE', 'WAYBILL',
          '01J1000000000000000001110A', 1, 'CONFLICT', 2,
          '01J1000000000000000001220A', '{}'::jsonb, now()
        )
      `;
      await transaction`
        INSERT INTO device_sync_conflicts (
          id, tenant_id, device_event_receipt_id, aggregate_type, aggregate_id,
          expected_version, server_version, server_snapshot, client_snapshot
        ) VALUES (
          '01J1000000000000000001220A', ${tenantA},
          '01J1000000000000000001210A', 'WAYBILL',
          '01J1000000000000000001110A', 1, 2, '{}'::jsonb, '{}'::jsonb
        )
      `;
    });

    const [openConflict] = await admin<{ status: string; version: string }[]>`
      SELECT status, version::text
      FROM device_sync_conflicts
      WHERE id = '01J1000000000000000001220A'
    `;
    expect(openConflict).toEqual({ status: 'OPEN', version: '1' });

    await expect(
      admin`
        UPDATE device_sync_conflicts
        SET status = 'RESOLVED', resolution = 'KEEP_SERVER', resolution_payload = '{}'::jsonb,
            resolved_by_subject_id = ${subjectA}, resolution_reason = 'invalid CAS attempt',
            resolved_at = now(), version = 3
        WHERE id = '01J1000000000000000001220A'
      `
    ).rejects.toMatchObject({ code: '40001' });

    const contenderA = postgres(container.getConnectionUri(), { max: 1 });
    const contenderB = postgres(container.getConnectionUri(), { max: 1 });
    let releaseWinner: () => void = () => {};
    let markWinnerUpdated: () => void = () => {};
    const holdWinner = new Promise<void>((resolveHold) => {
      releaseWinner = resolveHold;
    });
    const winnerUpdated = new Promise<void>((resolveUpdated) => {
      markWinnerUpdated = resolveUpdated;
    });
    try {
      const winnerTransaction = contenderA.begin(async (transaction) => {
        const rows = await transaction<{ resolution: string; status: string; version: string }[]>`
          UPDATE device_sync_conflicts
          SET status = 'RESOLVED', resolution = 'KEEP_SERVER', resolution_payload = '{}'::jsonb,
              resolved_by_subject_id = ${subjectA}, resolution_reason = 'winner accepted server',
              resolved_at = now(), version = 2
          WHERE id = '01J1000000000000000001220A' AND version = 1
          RETURNING status, resolution, version::text
        `;
        markWinnerUpdated();
        await holdWinner;
        return rows;
      });
      await winnerUpdated;
      const blockedContender = Promise.resolve(
        contenderB<{ resolution: string; status: string; version: string }[]>`
          UPDATE device_sync_conflicts
          SET status = 'RESOLVED', resolution = 'SUBMIT_MANUAL',
              resolution_payload = '{"concurrent":true}'::jsonb,
              resolved_by_subject_id = ${subjectA}, resolution_reason = 'concurrent manual review',
              resolved_at = now(), version = 2
          WHERE id = '01J1000000000000000001220A' AND version = 1
          RETURNING status, resolution, version::text
        `
      );
      await new Promise((resolveStarted) => setTimeout(resolveStarted, 100));
      releaseWinner();
      const [winnerRows, contenderRows] = await Promise.all([winnerTransaction, blockedContender]);
      expect(winnerRows).toEqual([{ status: 'RESOLVED', resolution: 'KEEP_SERVER', version: '2' }]);
      expect(contenderRows).toEqual([]);
    } finally {
      releaseWinner();
      await Promise.all([contenderA.end(), contenderB.end()]);
    }

    await expect(
      admin`
        UPDATE device_sync_conflicts
        SET resolution = 'SUBMIT_MANUAL', resolution_payload = '{"stale":true}'::jsonb,
            version = 3
        WHERE id = '01J1000000000000000001220A'
      `
    ).rejects.toMatchObject({ code: '55000' });
  });

  it('exposes atomic least-privilege control-plane commands with DB-backed authorization', async () => {
    const [seedState] = await admin<{ seeded: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM tenants WHERE id = ${tenantA}) AS seeded
    `;
    if (!seedState?.seeded) await seedCrossDomainParents();

    const canonicalActions = await admin<{ action_code: string }[]>`
      SELECT action_code FROM permission_actions
      WHERE action_code IN ('platform.tenant.manage', 'platform.entitlement.write')
      ORDER BY action_code
    `;
    expect(canonicalActions.map(({ action_code }) => action_code)).toEqual([
      'platform.entitlement.write',
      'platform.tenant.manage',
    ]);
    await admin`
      INSERT INTO roles (id, tenant_id, role_code, display_name) VALUES
        (${controlRoleA}, ${tenantA}, 'PLATFORM_CONTROL', 'Platform control'),
        (${narrowControlRoleA}, ${tenantA}, 'NARROW_CONTROL', 'Narrow control')
    `;
    await admin`
      INSERT INTO user_role_assignments (
        id, tenant_id, user_id, role_id, assigned_by_user_id
      ) VALUES
        (${controlAssignmentA}, ${tenantA}, ${actorA}, ${controlRoleA}, ${actorA}),
        (${narrowControlAssignmentA}, ${tenantA}, ${subjectA}, ${narrowControlRoleA}, ${actorA})
    `;
    await admin`
      INSERT INTO role_grants (
        id, tenant_id, role_id, action_code, effect, data_scope_kind
      ) VALUES
        ('01J1000000000000000000072A', ${tenantA}, ${controlRoleA},
          'platform.tenant.manage', 'ALLOW', 'PLATFORM'),
        ('01J1000000000000000000074A', ${tenantA}, ${controlRoleA},
          'platform.entitlement.write', 'ALLOW', 'PLATFORM')
    `;

    const functions = await admin<
      {
        config: string[] | null;
        execute_allowed: boolean;
        proname: string;
        security_definer: boolean;
      }[]
    >`
      SELECT
        p.proname,
        p.prosecdef AS security_definer,
        p.proconfig AS config,
        has_function_privilege('zhili_control_plane', p.oid, 'EXECUTE') AS execute_allowed
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'control_plane_create_tenant',
          'control_plane_set_tenant_status',
          'control_plane_set_entitlement'
        )
      ORDER BY p.proname
    `;
    expect(functions).toEqual([
      {
        proname: 'control_plane_create_tenant',
        security_definer: true,
        config: ['search_path=pg_catalog'],
        execute_allowed: true,
      },
      {
        proname: 'control_plane_set_entitlement',
        security_definer: true,
        config: ['search_path=pg_catalog'],
        execute_allowed: true,
      },
      {
        proname: 'control_plane_set_tenant_status',
        security_definer: true,
        config: ['search_path=pg_catalog'],
        execute_allowed: true,
      },
    ]);

    const [boundary] = await admin<
      {
        can_insert_audit: boolean;
        can_insert_idempotency: boolean;
        can_insert_outbox: boolean;
        can_insert_tenants: boolean;
        can_select_users: boolean;
        can_update_tenants: boolean;
        rolbypassrls: boolean;
        rolcreaterole: boolean;
        rolsuper: boolean;
      }[]
    >`
      SELECT
        role_row.rolsuper,
        role_row.rolcreaterole,
        role_row.rolbypassrls,
        has_table_privilege('zhili_control_plane', 'public.tenants', 'INSERT') AS can_insert_tenants,
        has_table_privilege('zhili_control_plane', 'public.tenants', 'UPDATE') AS can_update_tenants,
        has_table_privilege('zhili_control_plane', 'public.users', 'SELECT') AS can_select_users,
        has_table_privilege('zhili_control_plane', 'public.audit_events', 'INSERT') AS can_insert_audit,
        has_table_privilege('zhili_control_plane', 'public.outbox_events', 'INSERT') AS can_insert_outbox,
        has_table_privilege(
          'zhili_control_plane', 'public.idempotency_records', 'INSERT'
        ) AS can_insert_idempotency
      FROM pg_roles role_row
      WHERE role_row.rolname = 'zhili_control_plane'
    `;
    expect(boundary).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolbypassrls: false,
      can_insert_tenants: false,
      can_update_tenants: false,
      can_select_users: false,
      can_insert_audit: false,
      can_insert_outbox: false,
      can_insert_idempotency: false,
    });

    await admin.unsafe(
      "ALTER ROLE zhili_control_plane WITH LOGIN PASSWORD 'integration-control-only'"
    );
    const controlUrl = new URL(container.getConnectionUri());
    controlUrl.username = 'zhili_control_plane';
    controlUrl.password = 'integration-control-only';
    const control = postgres(controlUrl.toString(), { max: 1 });
    try {
      await expect(control`SELECT id FROM tenants LIMIT 1`).rejects.toMatchObject({
        code: '42501',
      });

      const narrowCases = [
        {
          scope: 'SELF',
          grantId: '01J1000000000000000001400A',
          targetId: '01J1000000000000000001410A',
          operationId: '01J1000000000000000001420A',
        },
        {
          scope: 'TENANT',
          grantId: '01J1000000000000000001401A',
          targetId: '01J1000000000000000001411A',
          operationId: '01J1000000000000000001421A',
        },
        {
          scope: 'ORGANIZATION',
          grantId: '01J1000000000000000001402A',
          targetId: '01J1000000000000000001412A',
          operationId: '01J1000000000000000001422A',
        },
        {
          scope: 'CUSTOMER',
          grantId: '01J1000000000000000001403A',
          targetId: '01J1000000000000000001413A',
          operationId: '01J1000000000000000001423A',
        },
        {
          scope: 'WAREHOUSE',
          grantId: '01J1000000000000000001404A',
          targetId: '01J1000000000000000001414A',
          operationId: '01J1000000000000000001424A',
        },
      ] as const;
      for (const narrowCase of narrowCases) {
        await admin`
          INSERT INTO role_grants (
            id, tenant_id, role_id, action_code, effect, data_scope_kind
          ) VALUES (
            ${narrowCase.grantId}, ${tenantA}, ${narrowControlRoleA},
            'platform.tenant.manage', 'ALLOW', ${narrowCase.scope}
          )
        `;
        await expect(
          control`
            SELECT * FROM control_plane_create_tenant(
              ${tenantA}, ${subjectA}, ${narrowCase.targetId},
              ${`narrow-${narrowCase.scope.toLowerCase()}`}, 'Narrow tenant',
              'Asia/Shanghai', 'CNY',
              ${narrowCase.operationId}, ${`narrow-${narrowCase.scope.toLowerCase()}`},
              ${'a'.repeat(64)}
            )
          `
        ).rejects.toMatchObject({ code: '42501' });
        await admin`DELETE FROM role_grants WHERE id = ${narrowCase.grantId}`;
      }
      const [narrowWrites] = await admin<
        {
          audit_count: number;
          idempotency_count: number;
          outbox_count: number;
          tenant_count: number;
        }[]
      >`
        SELECT
          (SELECT count(*)::int FROM tenants
            WHERE id = ANY(${narrowCases.map(({ targetId }) => targetId)})) AS tenant_count,
          (SELECT count(*)::int FROM idempotency_records
            WHERE id = ANY(${narrowCases.map(({ operationId }) => operationId)})) AS idempotency_count,
          (SELECT count(*)::int FROM audit_events
            WHERE id = ANY(${narrowCases.map(({ operationId }) => operationId)})) AS audit_count,
          (SELECT count(*)::int FROM outbox_events
            WHERE id = ANY(${narrowCases.map(({ operationId }) => operationId)})) AS outbox_count
      `;
      expect(narrowWrites).toEqual({
        tenant_count: 0,
        idempotency_count: 0,
        audit_count: 0,
        outbox_count: 0,
      });

      const [created] = await control<
        { replayed: boolean; status: string; tenant_id: string; version: string }[]
      >`
        SELECT tenant_id, status, version::text, replayed
        FROM control_plane_create_tenant(
          ${tenantA}, ${actorA}, ${controlTenantC}, 'tenant-c', 'Tenant C',
          'Asia/Shanghai', 'CNY',
          '01J1000000000000000001300A', 'control-create-c', ${'1'.repeat(64)}
        )
      `;
      expect(created).toEqual({
        tenant_id: controlTenantC,
        status: 'ACTIVE',
        version: '1',
        replayed: false,
      });

      const [replayedCreate] = await control<
        { replayed: boolean; status: string; tenant_id: string; version: string }[]
      >`
        SELECT tenant_id, status, version::text, replayed
        FROM control_plane_create_tenant(
          ${tenantA}, ${actorA}, ${controlTenantC}, 'tenant-c', 'Tenant C',
          'Asia/Shanghai', 'CNY',
          '01J1000000000000000001300A', 'control-create-c', ${'1'.repeat(64)}
        )
      `;
      expect(replayedCreate).toEqual({ ...created, replayed: true });
      await expect(
        control`
          SELECT * FROM control_plane_create_tenant(
            ${tenantA}, ${actorA}, ${controlTenantC}, 'tenant-c', 'Tenant C',
            'Asia/Shanghai', 'CNY',
            '01J1000000000000000001300A', 'control-create-c', ${'9'.repeat(64)}
          )
        `
      ).rejects.toMatchObject({ code: '23514' });

      const [afterReplay] = await admin<
        {
          audit_count: number;
          idempotency_count: number;
          outbox_count: number;
          tenant_count: number;
        }[]
      >`
        SELECT
          (SELECT count(*)::int FROM tenants WHERE id = ${controlTenantC}) AS tenant_count,
          (SELECT count(*)::int FROM idempotency_records
            WHERE tenant_id = ${tenantA} AND idempotency_key = 'control-create-c') AS idempotency_count,
          (SELECT count(*)::int FROM audit_events
            WHERE id = '01J1000000000000000001300A') AS audit_count,
          (SELECT count(*)::int FROM outbox_events
            WHERE id = '01J1000000000000000001300A') AS outbox_count
      `;
      expect(afterReplay).toEqual({
        tenant_count: 1,
        idempotency_count: 1,
        audit_count: 1,
        outbox_count: 1,
      });

      const [suspended] = await control<
        { replayed: boolean; status: string; tenant_id: string; version: string }[]
      >`
        SELECT tenant_id, status, version::text, replayed
        FROM control_plane_set_tenant_status(
          ${tenantA}, ${actorA}, ${controlTenantC}, 1, 'SUSPENDED',
          '01J1000000000000000001310A', 'control-suspend-c', ${'2'.repeat(64)}
        )
      `;
      expect(suspended).toEqual({
        tenant_id: controlTenantC,
        status: 'SUSPENDED',
        version: '2',
        replayed: false,
      });
      await expect(
        control`
          SELECT * FROM control_plane_set_tenant_status(
            ${tenantA}, ${actorA}, ${controlTenantC}, 1, 'ACTIVE',
            '01J1000000000000000001320A', 'control-stale-c', ${'3'.repeat(64)}
          )
        `
      ).rejects.toMatchObject({ code: '40001' });

      const [entitlement] = await control<
        {
          entitlement_version: number;
          module_code: string;
          replayed: boolean;
          tenant_id: string;
          tenant_version: string;
        }[]
      >`
        SELECT tenant_id, module_code, entitlement_version, tenant_version::text, replayed
        FROM control_plane_set_entitlement(
          ${tenantA}, ${actorA}, ${tenantB}, ${subjectB},
          '01J1000000000000000001330B', 1, 'CONTROL_TEST', 500,
          now(), now() + interval '30 days', 1,
          '01J1000000000000000001340A', 'control-entitlement-b', ${'4'.repeat(64)}
        )
      `;
      expect(entitlement).toEqual({
        tenant_id: tenantB,
        module_code: 'CONTROL_TEST',
        entitlement_version: 1,
        tenant_version: '2',
        replayed: false,
      });

      await admin`
        INSERT INTO role_grants (
          id, tenant_id, role_id, action_code, effect, data_scope_kind
        ) VALUES (
          '01J1000000000000000001500A', ${tenantA}, ${controlRoleA},
          'platform.tenant.manage', 'DENY', 'PLATFORM'
        )
      `;
      await expect(
        control`
          SELECT * FROM control_plane_create_tenant(
            ${tenantA}, ${actorA}, '01J1000000000000000001510A',
            'platform-denied', 'Platform denied',
            'Asia/Shanghai', 'CNY',
            '01J1000000000000000001520A', 'platform-denied', ${'8'.repeat(64)}
          )
        `
      ).rejects.toMatchObject({ code: '42501' });

      const auditActions = await admin<{ action: string; id: string }[]>`
        SELECT id, action FROM audit_events
        WHERE id IN (
          '01J1000000000000000001300A',
          '01J1000000000000000001310A',
          '01J1000000000000000001340A'
        )
        ORDER BY id
      `;
      expect(auditActions).toEqual([
        { id: '01J1000000000000000001300A', action: 'platform.tenant.created' },
        { id: '01J1000000000000000001310A', action: 'platform.tenant.status-changed' },
        { id: '01J1000000000000000001340A', action: 'platform.tenant-entitlements.updated' },
      ]);

      await expect(
        control`
          SELECT * FROM control_plane_create_tenant(
            ${tenantA}, ${subjectA}, ${deniedTenantD}, 'tenant-d', 'Tenant D',
            'Asia/Shanghai', 'CNY',
            '01J1000000000000000001350A', 'control-denied-d', ${'5'.repeat(64)}
          )
        `
      ).rejects.toMatchObject({ code: '42501' });

      const [negative] = await admin<
        {
          audit_count: number;
          idempotency_count: number;
          outbox_count: number;
          tenant_count: number;
        }[]
      >`
        SELECT
          (SELECT count(*)::int FROM tenants WHERE id = ${deniedTenantD}) AS tenant_count,
          (SELECT count(*)::int FROM idempotency_records
            WHERE tenant_id = ${tenantA}
              AND idempotency_key IN ('control-stale-c', 'control-denied-d', 'platform-denied'))
            AS idempotency_count,
          (SELECT count(*)::int FROM audit_events
            WHERE id IN (
              '01J1000000000000000001320A',
              '01J1000000000000000001350A',
              '01J1000000000000000001520A'
            )) AS audit_count,
          (SELECT count(*)::int FROM outbox_events
            WHERE id IN (
              '01J1000000000000000001320A',
              '01J1000000000000000001350A',
              '01J1000000000000000001520A'
            )) AS outbox_count
      `;
      expect(negative).toEqual({
        tenant_count: 0,
        idempotency_count: 0,
        audit_count: 0,
        outbox_count: 0,
      });
    } finally {
      await control.end();
      await admin.unsafe('ALTER ROLE zhili_control_plane WITH NOLOGIN');
    }
  });

  it('returns one indistinguishable credential row for every pre-tenant auth miss', async () => {
    const [seedState] = await admin<{ seeded: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM tenants WHERE id = ${tenantA}) AS seeded
    `;
    if (!seedState?.seeded) await seedCrossDomainParents();

    await admin`
      INSERT INTO users (
        id, tenant_id, organization_id, login_name_normalized, display_name,
        password_hash, status
      ) VALUES (
        ${actorB}, ${tenantB}, ${organizationB}, 'actor.a', 'Actor B', ${realPasswordHash}, 'ACTIVE'
      )
    `;

    const [boundary] = await admin<
      {
        config: string[] | null;
        execute_allowed: boolean;
        public_execute_allowed: boolean;
        security_definer: boolean;
      }[]
    >`
      SELECT
        p.prosecdef AS security_definer,
        p.proconfig AS config,
        has_function_privilege(
          'zhili_auth',
          'public.auth_lookup_password(text,text)',
          'EXECUTE'
        ) AS execute_allowed,
        EXISTS (
          SELECT 1
          FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) function_acl
          WHERE function_acl.grantee = 0 AND function_acl.privilege_type = 'EXECUTE'
        ) AS public_execute_allowed
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'auth_lookup_password'
    `;
    expect(boundary).toEqual({
      security_definer: true,
      config: ['search_path=pg_catalog'],
      execute_allowed: true,
      public_execute_allowed: false,
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
      const lookup = async (account: string, tenantHint: string | null) =>
        auth<
          { password_hash: string; tenant_id: string; user_id: string }[]
        >`SELECT tenant_id, user_id, password_hash FROM auth_lookup_password(
          ${account}, ${tenantHint}
        )`;

      expect(await lookup('missing.user', null)).toEqual([dummyCredential]);
      expect(await lookup('actor.a', 'wrong-tenant')).toEqual([dummyCredential]);
      expect(await lookup('actor.a', null)).toEqual([dummyCredential]);

      const [credential] = await lookup('actor.a', 'tenant-a');
      expect(credential).toEqual({
        tenant_id: tenantA,
        user_id: actorA,
        password_hash: realPasswordHash,
      });

      await admin`UPDATE users SET status = 'DISABLED' WHERE tenant_id = ${tenantA} AND id = ${actorA}`;
      expect(await lookup('actor.a', 'tenant-a')).toEqual([dummyCredential]);
      await admin`UPDATE users SET status = 'ACTIVE' WHERE tenant_id = ${tenantA} AND id = ${actorA}`;

      await admin`UPDATE tenants SET status = 'SUSPENDED' WHERE id = ${tenantA}`;
      expect(await lookup('actor.a', 'tenant-a')).toEqual([dummyCredential]);
      await admin`UPDATE tenants SET status = 'ACTIVE' WHERE id = ${tenantA}`;

      const [restoredCredential] = await auth<
        { password_hash: string; tenant_id: string; user_id: string }[]
      >`SELECT tenant_id, user_id, password_hash FROM auth_lookup_password('actor.a', 'tenant-a')`;
      expect(restoredCredential).toEqual({
        tenant_id: tenantA,
        user_id: actorA,
        password_hash: realPasswordHash,
      });
      await expect(auth`SELECT id FROM users LIMIT 1`).rejects.toMatchObject({ code: '42501' });
    } finally {
      await auth.end();
      await admin.unsafe('ALTER ROLE zhili_auth WITH NOLOGIN');
    }
  });

  it('preserves pre-existing cluster roles, owned objects, and btree_gist dependencies on B1 down', async () => {
    const preservedContainer = await new PostgreSqlContainer('postgres:17-alpine').start();
    const preservedAdmin = postgres(preservedContainer.getConnectionUri(), { max: 1 });
    try {
      await preservedAdmin.unsafe(`
        CREATE ROLE zhili_auth NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
        CREATE ROLE zhili_control_plane
          NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
        CREATE EXTENSION btree_gist;
        CREATE SCHEMA unrelated_auth AUTHORIZATION zhili_auth;
        CREATE TABLE unrelated_auth.marker (id integer PRIMARY KEY);
        CREATE SCHEMA unrelated_control AUTHORIZATION zhili_control_plane;
        CREATE TABLE unrelated_control.marker (id integer PRIMARY KEY);
        CREATE TABLE public.unrelated_extension_probe (
          id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          external_key text NOT NULL,
          EXCLUDE USING gist (external_key WITH =)
        );
      `);
      await preservedAdmin.unsafe(
        await readFile(resolve(packageRoot, 'migrations/0000_foundation.sql'), 'utf8')
      );

      const captureClusterResources = async () => ({
        roles: await preservedAdmin<
          {
            rolbypassrls: boolean;
            rolcanlogin: boolean;
            rolcreatedb: boolean;
            rolcreaterole: boolean;
            rolinherit: boolean;
            rolname: string;
            rolsuper: boolean;
          }[]
        >`
          SELECT rolname, rolsuper, rolinherit, rolcreatedb, rolcreaterole,
                 rolcanlogin, rolbypassrls
          FROM pg_roles
          WHERE rolname IN ('zhili_auth', 'zhili_control_plane')
          ORDER BY rolname
        `,
        objects: await preservedAdmin<
          { object_name: string; object_owner: string; object_type: string }[]
        >`
          SELECT namespace_row.nspname AS object_name, owner_role.rolname AS object_owner,
                 'schema'::text AS object_type
          FROM pg_namespace namespace_row
          JOIN pg_roles owner_role ON owner_role.oid = namespace_row.nspowner
          WHERE namespace_row.nspname IN ('unrelated_auth', 'unrelated_control')
          UNION ALL
          SELECT namespace_row.nspname || '.' || class_row.relname,
                 owner_role.rolname, 'table'::text
          FROM pg_class class_row
          JOIN pg_namespace namespace_row ON namespace_row.oid = class_row.relnamespace
          JOIN pg_roles owner_role ON owner_role.oid = class_row.relowner
          WHERE namespace_row.nspname IN ('unrelated_auth', 'unrelated_control')
            AND class_row.relkind = 'r'
          ORDER BY object_type, object_name
        `,
        extension: await preservedAdmin<
          { extname: string; extowner: string; extversion: string; schema_name: string }[]
        >`
          SELECT extension_row.extname, extension_row.extversion,
                 owner_role.rolname AS extowner, namespace_row.nspname AS schema_name
          FROM pg_extension extension_row
          JOIN pg_roles owner_role ON owner_role.oid = extension_row.extowner
          JOIN pg_namespace namespace_row ON namespace_row.oid = extension_row.extnamespace
          WHERE extension_row.extname = 'btree_gist'
        `,
        dependency: await preservedAdmin<{ definition: string }[]>`
          SELECT pg_get_constraintdef(constraint_row.oid, true) AS definition
          FROM pg_constraint constraint_row
          WHERE constraint_row.conrelid = 'public.unrelated_extension_probe'::regclass
            AND constraint_row.contype = 'x'
        `,
      });

      const beforeB1 = await captureClusterResources();
      await preservedAdmin.unsafe(
        await readFile(resolve(packageRoot, 'migrations/0001_b1_domains.sql'), 'utf8')
      );
      await preservedAdmin.unsafe(await readFile(domainDownMigrationPath, 'utf8'));
      expect(await captureClusterResources()).toEqual(beforeB1);
    } finally {
      await preservedAdmin.end();
      await preservedContainer.stop();
    }
  }, 120_000);

  it('executes the checked-in B1 down migration, preserves foundation, and reapplies identically', async () => {
    const beforeDownFingerprint = firstFingerprint || (await schemaFingerprint());
    const alignmentDownSql = await readFile(alignmentDownMigrationPath, 'utf8');
    const domainDownSql = await readFile(domainDownMigrationPath, 'utf8');
    for (const downSql of [alignmentDownSql, domainDownSql]) {
      expect(downSql).not.toMatch(/DROP\s+SCHEMA/i);
      expect(downSql).not.toMatch(/DROP\s+(?:OWNED|ROLE|EXTENSION)/i);
      await admin.unsafe(downSql);
    }

    const remainingTables = await admin<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    expect(remainingTables.map(({ table_name }) => table_name)).toEqual([
      'audit_events',
      'idempotency_records',
      'outbox_events',
    ]);
    const remainingRoles = await admin<{ rolname: string }[]>`
      SELECT rolname FROM pg_roles WHERE rolname LIKE 'zhili_%' ORDER BY rolname
    `;
    expect(remainingRoles.map(({ rolname }) => rolname)).toEqual([
      'zhili_app',
      'zhili_auth',
      'zhili_auth_capability_owner',
      'zhili_control_capability_owner',
      'zhili_control_plane',
      'zhili_worker',
    ]);
    const remainingFunctions = await admin<{ proname: string }[]>`
      SELECT p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND NOT EXISTS (
          SELECT 1
          FROM pg_depend dependency_row
          JOIN pg_extension extension_row ON extension_row.oid = dependency_row.refobjid
          WHERE dependency_row.classid = 'pg_proc'::regclass
            AND dependency_row.objid = p.oid
            AND dependency_row.deptype = 'e'
        )
      ORDER BY p.proname
    `;
    expect(remainingFunctions.map(({ proname }) => proname)).toEqual([
      'prevent_audit_event_mutation',
    ]);
    const b1Extension = await admin<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
    `;
    expect(b1Extension).toEqual([{ extname: 'btree_gist' }]);

    await admin`DELETE FROM drizzle.__drizzle_migrations WHERE id IN (
      SELECT id FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 2
    )`;

    await migrateUp();

    const secondFingerprint = await schemaFingerprint();
    expect(secondFingerprint).toBe(beforeDownFingerprint);
  });
});
