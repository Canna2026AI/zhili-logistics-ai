import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import postgres, { type Sql } from 'postgres';
import { expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const migrationPath = (name: string) => resolve(packageRoot, 'migrations', name);
const reservedTenantId = '00000000000000000000000000';
const legacyDummyTenantId = '01J0000000000000000000000A';
const actorTenantId = '01J3000000000000000000000A';
const targetTenantId = '01J3000000000000000000000B';
const actorOrganizationId = '01J3000000000000000000010A';
const actorUserId = '01J3000000000000000000020A';
const actorRoleId = '01J3000000000000000000030A';
const actorGrantId = '01J3000000000000000000031A';
const actorAssignmentId = '01J3000000000000000000032A';
const statusOperationId = '01J3000000000000000000040A';
const realPasswordHash =
  '$argon2id$v=19$m=65536,t=3,p=1$emhpbGktYXV0aC1zZWN1cmU$MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';

function databaseUrl(baseUri: string, database: string, username: string, password: string): string {
  const url = new URL(baseUri);
  url.pathname = `/${database}`;
  url.username = username;
  url.password = password;
  return url.toString();
}

async function applySql(sql: Sql, relativePath: string): Promise<void> {
  await sql.unsafe(await readFile(migrationPath(relativePath), 'utf8'));
}

async function capabilityFunctions(sql: Sql) {
  return sql<
    {
      auth_execute_allowed: boolean;
      config: string[] | null;
      control_execute_allowed: boolean;
      identity_arguments: string;
      owner: string;
      proname: string;
      public_execute_allowed: boolean;
    }[]
  >`
    SELECT function_row.proname,
           pg_get_function_identity_arguments(function_row.oid) AS identity_arguments,
           owner_role.rolname AS owner,
           function_row.proconfig AS config,
           has_function_privilege('zhili_auth', function_row.oid, 'EXECUTE')
             AS auth_execute_allowed,
           has_function_privilege('zhili_control_plane', function_row.oid, 'EXECUTE')
             AS control_execute_allowed,
           EXISTS (
             SELECT 1
             FROM aclexplode(
               coalesce(function_row.proacl, acldefault('f', function_row.proowner))
             ) function_acl
             WHERE function_acl.grantee = 0
               AND function_acl.privilege_type = 'EXECUTE'
           ) AS public_execute_allowed
    FROM pg_proc function_row
    JOIN pg_namespace namespace_row ON namespace_row.oid = function_row.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid = function_row.proowner
    WHERE namespace_row.nspname = 'public'
      AND function_row.prosecdef
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend dependency_row
        JOIN pg_extension extension_row ON extension_row.oid = dependency_row.refobjid
        WHERE dependency_row.classid = 'pg_proc'::regclass
          AND dependency_row.objid = function_row.oid
          AND dependency_row.deptype = 'e'
      )
    ORDER BY function_row.proname, identity_arguments
  `;
}

it('hardens every capability against owner RLS bypass, public shadowing, and sentinel collision', async () => {
  let container: StartedPostgreSqlContainer | undefined;
  let clusterAdmin: Sql | undefined;
  let databaseAdmin: Sql | undefined;
  let deploy: Sql | undefined;
  let attacker: Sql | undefined;
  try {
    container = await new PostgreSqlContainer('postgres:17-alpine')
      .withStartupTimeout(120_000)
      .start();
    const baseUri = container.getConnectionUri();
    clusterAdmin = postgres(baseUri, { max: 1 });
    await clusterAdmin.unsafe(`
      CREATE ROLE b1_schema_deploy
        LOGIN PASSWORD 'deploy-secret' NOSUPERUSER CREATEDB CREATEROLE NOINHERIT NOBYPASSRLS;
      CREATE ROLE b1_legacy_attacker
        LOGIN PASSWORD 'attacker-secret' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
    `);
    await clusterAdmin.unsafe('CREATE DATABASE b1_capability_security OWNER b1_schema_deploy');

    const deployUri = databaseUrl(
      baseUri,
      'b1_capability_security',
      'b1_schema_deploy',
      'deploy-secret'
    );
    const containerAdminUrl = new URL(baseUri);
    const databaseAdminUri = databaseUrl(
      baseUri,
      'b1_capability_security',
      containerAdminUrl.username,
      containerAdminUrl.password
    );
    deploy = postgres(deployUri, { max: 1 });
    databaseAdmin = postgres(databaseAdminUri, { max: 2 });

    await applySql(deploy, '0000_foundation.sql');
    await applySql(deploy, '0001_b1_domains.sql');

    // Reproduce a legacy database where PUBLIC could write the public schema and an untrusted
    // principal had already installed an exact-name shadow before the security migration.
    await databaseAdmin.unsafe('GRANT USAGE, CREATE ON SCHEMA public TO PUBLIC');
    expect(
      await databaseAdmin`
        SELECT has_schema_privilege('b1_legacy_attacker', 'public', 'CREATE') AS can_create,
               has_schema_privilege('b1_legacy_attacker', 'public', 'USAGE') AS can_use
      `
    ).toEqual([{ can_create: true, can_use: true }]);
    attacker = postgres(
      databaseUrl(
        baseUri,
        'b1_capability_security',
        'b1_legacy_attacker',
        'attacker-secret'
      ),
      { max: 1 }
    );
    await attacker.unsafe(`
      CREATE FUNCTION public.lower(text)
      RETURNS text LANGUAGE sql IMMUTABLE
      AS 'SELECT ''shadowed-by-public''::text';
    `);

    await applySql(deploy, '0002_b1_persistence_alignment.sql');

    const [deployRole] = await databaseAdmin<
      {
        rolbypassrls: boolean;
        rolcreaterole: boolean;
        rolinherit: boolean;
        rolsuper: boolean;
      }[]
    >`
      SELECT rolsuper, rolcreaterole, rolinherit, rolbypassrls
      FROM pg_roles WHERE rolname = 'b1_schema_deploy'
    `;
    expect(deployRole).toEqual({
      rolsuper: false,
      rolcreaterole: true,
      rolinherit: false,
      rolbypassrls: false,
    });

    const owners = await databaseAdmin<
      {
        rolbypassrls: boolean;
        rolcanlogin: boolean;
        rolcreaterole: boolean;
        rolinherit: boolean;
        rolname: string;
        rolreplication: boolean;
        rolsuper: boolean;
      }[]
    >`
      SELECT rolname, rolsuper, rolcreaterole, rolcanlogin, rolinherit,
             rolreplication, rolbypassrls
      FROM pg_roles
      WHERE rolname IN ('zhili_auth_capability_owner', 'zhili_control_capability_owner')
      ORDER BY rolname
    `;
    expect(owners).toEqual([
      {
        rolname: 'zhili_auth_capability_owner',
        rolsuper: false,
        rolcreaterole: false,
        rolcanlogin: false,
        rolinherit: false,
        rolreplication: false,
        rolbypassrls: false,
      },
      {
        rolname: 'zhili_control_capability_owner',
        rolsuper: false,
        rolcreaterole: false,
        rolcanlogin: false,
        rolinherit: false,
        rolreplication: false,
        rolbypassrls: false,
      },
    ]);
    const memberships = await databaseAdmin<
      {
        admin_option: boolean;
        can_set: boolean;
        inherits: boolean;
        member_role: string;
        owner_role: string;
      }[]
    >`
      SELECT owner_role.rolname AS owner_role, member_role.rolname AS member_role,
             bool_or(membership.admin_option) AS admin_option,
             bool_or(membership.set_option) AS can_set,
             bool_or(membership.inherit_option) AS inherits
      FROM pg_auth_members membership
      JOIN pg_roles owner_role ON owner_role.oid = membership.roleid
      JOIN pg_roles member_role ON member_role.oid = membership.member
      WHERE owner_role.rolname IN (
        'zhili_auth_capability_owner', 'zhili_control_capability_owner'
      )
      GROUP BY owner_role.rolname, member_role.rolname
      ORDER BY owner_role.rolname
    `;
    expect(memberships).toEqual([
      {
        owner_role: 'zhili_auth_capability_owner',
        member_role: 'b1_schema_deploy',
        admin_option: true,
        can_set: true,
        inherits: false,
      },
      {
        owner_role: 'zhili_control_capability_owner',
        member_role: 'b1_schema_deploy',
        admin_option: true,
        can_set: true,
        inherits: false,
      },
    ]);
    const runtimeMemberships = await databaseAdmin<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM pg_auth_members membership
      JOIN pg_roles owner_role ON owner_role.oid = membership.roleid
      JOIN pg_roles member_role ON member_role.oid = membership.member
      WHERE owner_role.rolname IN (
        'zhili_auth_capability_owner', 'zhili_control_capability_owner'
      )
        AND member_role.rolname IN (
          'zhili_app', 'zhili_worker', 'zhili_auth', 'zhili_control_plane'
        )
    `;
    expect(runtimeMemberships).toEqual([{ count: 0 }]);

    const functions = await capabilityFunctions(databaseAdmin);
    expect(functions.map(({ proname }) => proname)).toEqual([
      'auth_consume_login_throttle',
      'auth_lookup_oauth_state',
      'auth_lookup_password',
      'auth_lookup_refresh_token',
      'auth_resolve_tenant',
      'control_plane_create_tenant',
      'control_plane_create_tenant_legacy',
      'control_plane_end_impersonation',
      'control_plane_replace_entitlements',
      'control_plane_set_entitlement',
      'control_plane_set_tenant_status',
      'control_plane_set_tenant_status_legacy',
      'control_plane_start_impersonation',
    ]);
    const callableByAuth = new Set([
      'auth_consume_login_throttle',
      'auth_lookup_oauth_state',
      'auth_lookup_password',
      'auth_lookup_refresh_token',
      'auth_resolve_tenant',
    ]);
    const callableByControl = new Set([
      'control_plane_create_tenant',
      'control_plane_end_impersonation',
      'control_plane_replace_entitlements',
      'control_plane_set_entitlement',
      'control_plane_set_tenant_status',
      'control_plane_start_impersonation',
    ]);
    for (const capability of functions) {
      expect(capability.config).toEqual(['search_path=pg_catalog']);
      expect(capability.owner).toBe(
        capability.proname.startsWith('auth_')
          ? 'zhili_auth_capability_owner'
          : 'zhili_control_capability_owner'
      );
      expect(capability.public_execute_allowed).toBe(false);
      expect(capability.auth_execute_allowed).toBe(callableByAuth.has(capability.proname));
      expect(capability.control_execute_allowed).toBe(callableByControl.has(capability.proname));
    }

    const [schemaAcl] = await databaseAdmin<{ public_can_create: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_namespace namespace_row,
             LATERAL aclexplode(
               coalesce(namespace_row.nspacl, acldefault('n', namespace_row.nspowner))
             ) schema_acl
        WHERE namespace_row.nspname = 'public'
          AND schema_acl.grantee = 0
          AND schema_acl.privilege_type = 'CREATE'
      ) AS public_can_create
    `;
    expect(schemaAcl).toEqual({ public_can_create: false });
    await expect(attacker`CREATE TABLE public.post_migration_shadow(id integer)`).rejects.toMatchObject(
      { code: '42501' }
    );

    await databaseAdmin`
      INSERT INTO tenants (id, slug, display_name) VALUES
        (${legacyDummyTenantId}, 'legacy-real', 'Legacy real tenant'),
        (${actorTenantId}, 'secure-actor', 'Secure actor tenant'),
        (${targetTenantId}, 'secure-target', 'Secure target tenant')
    `;
    await databaseAdmin`
      INSERT INTO organizations (
        id, tenant_id, code, display_name, organization_type
      ) VALUES (
        ${actorOrganizationId}, ${actorTenantId}, 'SECURE-ROOT',
        'Secure root', 'TENANT_ROOT'
      )
    `;
    await databaseAdmin`
      INSERT INTO users (
        id, tenant_id, organization_id, login_name_normalized,
        display_name, password_hash, status
      ) VALUES (
        ${actorUserId}, ${actorTenantId}, ${actorOrganizationId}, 'secure.user',
        'Secure user', ${realPasswordHash}, 'ACTIVE'
      )
    `;
    await databaseAdmin`
      INSERT INTO roles (id, tenant_id, role_code, display_name)
      VALUES (${actorRoleId}, ${actorTenantId}, 'SECURE_CONTROL', 'Secure control')
    `;
    await databaseAdmin`
      INSERT INTO role_grants (
        id, tenant_id, role_id, action_code, effect, data_scope_kind
      ) VALUES (
        ${actorGrantId}, ${actorTenantId}, ${actorRoleId},
        'platform.tenant.manage', 'ALLOW', 'PLATFORM'
      )
    `;
    await databaseAdmin`
      INSERT INTO user_role_assignments (id, tenant_id, user_id, role_id)
      VALUES (${actorAssignmentId}, ${actorTenantId}, ${actorUserId}, ${actorRoleId})
    `;
    await expect(
      databaseAdmin`
        INSERT INTO tenants (id, slug, display_name)
        VALUES (${reservedTenantId}, 'reserved-sentinel', 'Reserved sentinel')
      `
    ).rejects.toMatchObject({ code: '23514' });

    expect(await deploy`SELECT id FROM public.tenants ORDER BY id`).toEqual([]);
    await expect(
      deploy`
        INSERT INTO public.tenants (id, slug, display_name)
        VALUES ('01J3000000000000000000099D', 'deploy-direct', 'Deploy direct')
      `
    ).rejects.toMatchObject({ code: '42501' });

    await databaseAdmin.unsafe(`
      ALTER ROLE zhili_auth WITH LOGIN PASSWORD 'auth-secret';
      ALTER ROLE zhili_control_plane WITH LOGIN PASSWORD 'control-secret';
    `);
    const auth = postgres(
      databaseUrl(baseUri, 'b1_capability_security', 'zhili_auth', 'auth-secret'),
      { max: 1 }
    );
    const control = postgres(
      databaseUrl(baseUri, 'b1_capability_security', 'zhili_control_plane', 'control-secret'),
      { max: 1 }
    );
    try {
      // A public.lower(text) shadow exists, but pg_catalog-only lookup still finds the real tenant.
      expect(await auth`SELECT * FROM public.auth_resolve_tenant('LEGACY-REAL')`).toEqual([
        { tenant_id: legacyDummyTenantId, found: true },
      ]);
      expect(await auth`SELECT * FROM public.auth_resolve_tenant('missing')`).toEqual([
        { tenant_id: reservedTenantId, found: false },
      ]);
      await expect(auth.unsafe('SET ROLE zhili_auth_capability_owner')).rejects.toMatchObject({
        code: '42501',
      });
      const [missingPassword] = await auth`
        SELECT tenant_id, user_id FROM public.auth_lookup_password('missing', null)
      `;
      expect(missingPassword).toEqual({
        tenant_id: reservedTenantId,
        user_id: '00000000000000000000000001',
      });

      const statusResult = await control`
        SELECT tenant_id, display_name, slug, status, version::text, replayed
        FROM public.control_plane_set_tenant_status(
          ${actorTenantId}, ${actorUserId}, ${targetTenantId}, 1, 'SUSPENDED',
          ${statusOperationId}, 'secure-status-change', ${'a'.repeat(64)}
        )
      `;
      expect(statusResult).toEqual([
        {
          tenant_id: targetTenantId,
          display_name: 'Secure target tenant',
          slug: 'secure-target',
          status: 'SUSPENDED',
          version: '2',
          replayed: false,
        },
      ]);
      await expect(control`SELECT id FROM public.tenants LIMIT 1`).rejects.toMatchObject({
        code: '42501',
      });
      await expect(
        control.unsafe('SET ROLE zhili_control_capability_owner')
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await Promise.all([auth.end(), control.end()]);
      await databaseAdmin.unsafe(`
        ALTER ROLE zhili_auth WITH NOLOGIN;
        ALTER ROLE zhili_control_plane WITH NOLOGIN;
      `);
    }

    // The same non-superuser schema owner can execute down/up and reconstruct the final owner
    // boundary without adding any runtime or extra administrative member.
    await applySql(deploy, 'down/0002_b1_persistence_alignment.down.sql');
    await applySql(deploy, '0002_b1_persistence_alignment.sql');
    const reappliedFunctions = await capabilityFunctions(databaseAdmin);
    expect(reappliedFunctions).toEqual(functions);
    const membershipsAfterReapply = await databaseAdmin<
      { member_role: string; owner_role: string }[]
    >`
      SELECT DISTINCT owner_role.rolname AS owner_role, member_role.rolname AS member_role
      FROM pg_auth_members membership
      JOIN pg_roles owner_role ON owner_role.oid = membership.roleid
      JOIN pg_roles member_role ON member_role.oid = membership.member
      WHERE owner_role.rolname IN (
        'zhili_auth_capability_owner', 'zhili_control_capability_owner'
      )
      ORDER BY owner_role
    `;
    expect(membershipsAfterReapply).toEqual([
      { owner_role: 'zhili_auth_capability_owner', member_role: 'b1_schema_deploy' },
      { owner_role: 'zhili_control_capability_owner', member_role: 'b1_schema_deploy' },
    ]);
  } finally {
    await Promise.allSettled([
      attacker?.end(),
      deploy?.end(),
      databaseAdmin?.end(),
      clusterAdmin?.end(),
    ]);
    if (container) await container.stop();
  }
}, 120_000);
