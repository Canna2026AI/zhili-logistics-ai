import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import postgres from 'postgres';

const proposalDirectory = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = resolve(proposalDirectory, '../../..');
const foundationPath = resolve(repositoryRoot, 'packages/db/migrations/0000_foundation.sql');
const proposalPath = resolve(proposalDirectory, 'backend-identity-masterdata.sql');

const expectedTables = [
  'customer_addresses',
  'customers',
  'device_bindings',
  'device_tasks',
  'devices',
  'oauth_states',
  'organizations',
  'permission_actions',
  'refresh_token_families',
  'refresh_tokens',
  'role_grant_customer_scopes',
  'role_grant_field_policies',
  'role_grant_organization_scopes',
  'role_grant_warehouse_scopes',
  'role_grants',
  'roles',
  'sessions',
  'tenants',
  'user_role_assignments',
  'users',
  'warehouses',
];

const tenantOwnedTables = expectedTables.filter(
  (tableName) => !['permission_actions', 'tenants'].includes(tableName)
);

const foundationSql = await readFile(foundationPath, 'utf8');
const proposalSql = await readFile(proposalPath, 'utf8');

assert.ok(
  proposalSql.includes("current_setting('app.tenant_id', true)") ||
    proposalSql.includes("current_setting(''app.tenant_id'', true)"),
  'proposal must use the foundation app.tenant_id convention'
);
assert.doesNotMatch(proposalSql, /app\.current_tenant/);
assert.doesNotMatch(
  proposalSql,
  /\b(?:raw_password|password|refresh_token|oauth_state|pkce_verifier|client_secret|device_secret)\s+(?:text|varchar|bytea)\b/i,
  'sensitive values must only use explicitly hashed or encrypted columns'
);

const container = await new PostgreSqlContainer('postgres:17-alpine').start();
const sql = postgres(container.getConnectionUri(), { max: 1 });
let appSql;

try {
  await sql.unsafe(foundationSql);
  await sql.unsafe(proposalSql);

  const tables = await sql`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = ANY(${expectedTables})
    ORDER BY tablename
  `;
  assert.deepEqual(
    tables.map(({ tablename }) => tablename),
    [...expectedTables].sort(),
    'proposal must create every identity/master-data contract table'
  );

  const tenantColumns = await sql`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
      AND table_name = ANY(${tenantOwnedTables})
    ORDER BY table_name
  `;
  assert.deepEqual(
    tenantColumns.map(({ table_name }) => table_name),
    [...tenantOwnedTables].sort(),
    'every tenant-owned table must carry tenant_id'
  );

  const versionedAuditableTables = await sql`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY(${tenantOwnedTables})
      AND column_name IN ('id', 'version', 'created_at', 'updated_at')
    GROUP BY table_name
    HAVING count(*) = 4
    ORDER BY table_name
  `;
  assert.deepEqual(
    versionedAuditableTables.map(({ table_name }) => table_name),
    [...tenantOwnedTables].sort(),
    'tenant-owned records need stable ids, optimistic versions, and audit timestamps'
  );

  const versionChecks = await sql`
    SELECT child.relname
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    WHERE c.contype = 'c'
      AND child.relname = ANY(${tenantOwnedTables})
      AND pg_get_constraintdef(c.oid) LIKE '%version >= 0%'
    ORDER BY child.relname
  `;
  assert.deepEqual(
    versionChecks.map(({ relname }) => relname),
    [...tenantOwnedTables].sort(),
    'every optimistic version must reject negative values'
  );

  const tenantColumnsOnTenant = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'tenant_id'
  `;
  assert.equal(tenantColumnsOnTenant.length, 0, 'tenants(id) is the tenant root');

  const tenantRootRls = await sql`
    SELECT relname
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = 'tenants'
      AND relrowsecurity
      AND relforcerowsecurity
  `;
  assert.equal(tenantRootRls.length, 1, 'tenant roots must not expose other tenant records');

  const tenantRootPolicy = await sql`
    SELECT tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenants'
      AND roles = ARRAY['zhili_app']::name[]
      AND cmd = 'ALL'
      AND qual LIKE '%current_setting(''app.tenant_id''::text, true)%'
      AND with_check LIKE '%current_setting(''app.tenant_id''::text, true)%'
  `;
  assert.equal(tenantRootPolicy.length, 1, 'tenant root policy must use app.tenant_id');

  const tenantSafeKeys = await sql`
    SELECT tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema
     AND kcu.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'UNIQUE'
      AND tc.table_name = ANY(${tenantOwnedTables})
    GROUP BY tc.table_name, tc.constraint_name
    HAVING array_agg(kcu.column_name::text ORDER BY kcu.ordinal_position) = ARRAY['tenant_id', 'id']
    ORDER BY tc.table_name
  `;
  assert.deepEqual(
    tenantSafeKeys.map(({ table_name }) => table_name),
    [...tenantOwnedTables].sort(),
    'tenant-owned tables need UNIQUE (tenant_id, id) reference keys'
  );

  const rlsTables = await sql`
    SELECT relname
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relname = ANY(${tenantOwnedTables})
      AND relrowsecurity
      AND relforcerowsecurity
    ORDER BY relname
  `;
  assert.deepEqual(
    rlsTables.map(({ relname }) => relname),
    [...tenantOwnedTables].sort(),
    'RLS must be enabled and forced on every tenant-owned table'
  );

  const tenantPolicies = await sql`
    SELECT tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(${tenantOwnedTables})
      AND roles = ARRAY['zhili_app']::name[]
      AND cmd = 'ALL'
      AND qual LIKE '%current_setting(''app.tenant_id''::text, true)%'
      AND with_check LIKE '%current_setting(''app.tenant_id''::text, true)%'
    ORDER BY tablename
  `;
  assert.deepEqual(
    tenantPolicies.map(({ tablename }) => tablename),
    [...tenantOwnedTables].sort(),
    'each tenant table needs a fail-closed zhili_app tenant policy'
  );

  const unsafeForeignKeys = await sql`
    SELECT c.conname, child.relname AS child_table, parent.relname AS parent_table,
           c.confdeltype, c.confupdtype,
           array_agg(child_attribute.attname ORDER BY child_key.ordinality) AS child_columns,
           array_agg(parent_attribute.attname ORDER BY child_key.ordinality) AS parent_columns
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    JOIN unnest(c.conkey) WITH ORDINALITY AS child_key(attnum, ordinality) ON true
    JOIN unnest(c.confkey) WITH ORDINALITY AS parent_key(attnum, ordinality)
      ON parent_key.ordinality = child_key.ordinality
    JOIN pg_attribute child_attribute
      ON child_attribute.attrelid = child.oid AND child_attribute.attnum = child_key.attnum
    JOIN pg_attribute parent_attribute
      ON parent_attribute.attrelid = parent.oid AND parent_attribute.attnum = parent_key.attnum
    WHERE c.contype = 'f'
      AND child.relname = ANY(${tenantOwnedTables})
    GROUP BY c.conname, child.relname, parent.relname, c.confdeltype, c.confupdtype
    HAVING c.confdeltype NOT IN ('c', 'r')
       OR c.confupdtype <> 'r'
       OR (
         parent.relname NOT IN ('permission_actions', 'tenants')
         AND NOT (
           'tenant_id' = ANY(array_agg(child_attribute.attname))
           AND 'tenant_id' = ANY(array_agg(parent_attribute.attname))
         )
       )
  `;
  assert.equal(
    unsafeForeignKeys.length,
    0,
    'foreign keys must be tenant-safe and explicitly use ON UPDATE RESTRICT plus ON DELETE CASCADE/RESTRICT'
  );

  const sensitiveColumns = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (table_name, column_name) IN (
        ('users', 'password_hash'),
        ('refresh_tokens', 'token_hash'),
        ('oauth_states', 'state_hash'),
        ('oauth_states', 'pkce_verifier_ciphertext'),
        ('devices', 'credential_hash')
      )
    ORDER BY table_name, column_name
  `;
  assert.deepEqual(
    [...sensitiveColumns],
    [
      { table_name: 'devices', column_name: 'credential_hash' },
      { table_name: 'oauth_states', column_name: 'pkce_verifier_ciphertext' },
      { table_name: 'oauth_states', column_name: 'state_hash' },
      { table_name: 'refresh_tokens', column_name: 'token_hash' },
      { table_name: 'users', column_name: 'password_hash' },
    ]
  );

  const normalizedPermissionForeignKeys = await sql`
    SELECT child.relname AS child_table, parent.relname AS parent_table
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    WHERE c.contype = 'f'
      AND (child.relname, parent.relname) IN (
        ('role_grants', 'roles'),
        ('role_grants', 'permission_actions'),
        ('role_grant_organization_scopes', 'role_grants'),
        ('role_grant_organization_scopes', 'organizations'),
        ('role_grant_customer_scopes', 'role_grants'),
        ('role_grant_customer_scopes', 'customers'),
        ('role_grant_warehouse_scopes', 'role_grants'),
        ('role_grant_warehouse_scopes', 'warehouses'),
        ('role_grant_field_policies', 'role_grants')
      )
    ORDER BY child_table, parent_table
  `;
  assert.equal(
    normalizedPermissionForeignKeys.length,
    9,
    'roles, actions, scopes, and field policies must be normalized through foreign keys'
  );

  const rotationRelationships = await sql`
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class child ON child.oid = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    WHERE c.contype = 'f'
      AND child.relname = 'refresh_tokens'
      AND parent.relname IN ('refresh_token_families', 'refresh_tokens')
  `;
  assert.equal(
    rotationRelationships.length,
    2,
    'refresh rotation needs family and parent-token links'
  );

  const tenantA = '01J0000000000000000000000A';
  const tenantB = '01J0000000000000000000000B';
  await sql`
    INSERT INTO tenants (id, slug, display_name) VALUES
      (${tenantA}, 'tenant-a', 'Tenant A'),
      (${tenantB}, 'tenant-b', 'Tenant B')
  `;
  await sql`
    INSERT INTO organizations (
      id, tenant_id, code, display_name, organization_type
    ) VALUES
      ('01J0000000000000000000010A', ${tenantA}, 'ROOT-A', 'Root A', 'TENANT_ROOT'),
      ('01J0000000000000000000010B', ${tenantB}, 'ROOT-B', 'Root B', 'TENANT_ROOT')
  `;
  await sql.unsafe("ALTER ROLE zhili_app WITH LOGIN PASSWORD 'proposal-verification-only'");

  const appUrl = new URL(container.getConnectionUri());
  appUrl.username = 'zhili_app';
  appUrl.password = 'proposal-verification-only';
  appSql = postgres(appUrl.toString(), { max: 1 });

  assert.equal(
    (await appSql`SELECT id FROM tenants`).length,
    0,
    'missing tenant context must fail closed'
  );
  const visibleRows = await appSql.begin(async (transaction) => {
    await transaction`SELECT set_config('app.tenant_id', ${tenantA}, true)`;
    return transaction`
      SELECT tenant_id, id
      FROM organizations
      ORDER BY id
    `;
  });
  assert.deepEqual([...visibleRows], [{ tenant_id: tenantA, id: '01J0000000000000000000010A' }]);

  console.log(
    `PASS backend identity/master-data proposal: ${expectedTables.length} tables, ${tenantOwnedTables.length + 1} forced RLS policies, tenant-safe foreign keys, normalized grants, protected credentials`
  );
} finally {
  if (appSql) await appSql.end();
  await sql.end();
  await container.stop();
}
