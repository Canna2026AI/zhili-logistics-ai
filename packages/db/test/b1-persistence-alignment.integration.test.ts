import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');

const tenantA = '01J2000000000000000000000A';
const tenantB = '01J2000000000000000000000B';
const organizationA = '01J2000000000000000000010A';
const organizationB = '01J2000000000000000000010B';
const userA = '01J2000000000000000000020A';
const userB = '01J2000000000000000000020B';
const roleA = '01J2000000000000000000030A';
const grantA = '01J2000000000000000000031A';
const tenantGrantA = '01J2000000000000000000033A';
const impersonationGrantA = '01J2000000000000000000034A';
const assignmentA = '01J2000000000000000000032A';
const membershipA = '01J2000000000000000000040A';
const membershipB = '01J2000000000000000000040B';
const sessionA = '01J2000000000000000000050A';
const tokenFamilyA = '01J2000000000000000000051A';
const refreshTokenA = '01J2000000000000000000052A';
const oauthStateA = '01J2000000000000000000053A';
const throttleBucketA = '01J2000000000000000000060A';
const operationA = '01J2000000000000000000070A';
const staleOperationA = '01J2000000000000000000071A';
const entitlementB = '01J2000000000000000000080B';
const createdTenantC = '01J2000000000000000000081C';
const impersonationB = '01J2000000000000000000082B';
const createTenantOperationA = '01J2000000000000000000083A';
const startImpersonationOperationA = '01J2000000000000000000084A';
const endImpersonationOperationA = '01J2000000000000000000085A';
const deniedImpersonationB = '01J2000000000000000000086B';
const deniedImpersonationOperationB = '01J2000000000000000000087B';
const invalidTenantOperationA = '01J2000000000000000000088A';
const statusTenantOperationA = '01J2000000000000000000089A';
const sentinelTenantOperationA = '01J2000000000000000000089B';
const refreshHash = 'a'.repeat(64);
const loginHash = 'b'.repeat(64);
const oauthStateHash = 'e'.repeat(64);

let container: StartedPostgreSqlContainer;
let admin: Sql;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withStartupTimeout(120_000)
    .start();
  admin = postgres(container.getConnectionUri(), { max: 4 });
  await migrate(drizzle(admin), { migrationsFolder: resolve(packageRoot, 'migrations') });

  await admin`
    INSERT INTO tenants (id, slug, display_name) VALUES
      (${tenantA}, 'alignment-a', 'Alignment A'),
      (${tenantB}, 'alignment-b', 'Alignment B')
  `;
  await admin`
    INSERT INTO organizations (
      id, tenant_id, code, display_name, organization_type
    ) VALUES
      (${organizationA}, ${tenantA}, 'ROOT-A', 'Root A', 'TENANT_ROOT'),
      (${organizationB}, ${tenantB}, 'ROOT-B', 'Root B', 'TENANT_ROOT')
  `;
  await admin`
    INSERT INTO users (
      id, tenant_id, organization_id, login_name_normalized, display_name, status
    ) VALUES
      (${userA}, ${tenantA}, ${organizationA}, 'alignment.a', 'Alignment A', 'ACTIVE'),
      (${userB}, ${tenantB}, ${organizationB}, 'alignment.b', 'Alignment B', 'ACTIVE')
  `;
  await admin`
    INSERT INTO user_organization_memberships (
      id, tenant_id, user_id, organization_id, is_primary
    ) VALUES
      (${membershipA}, ${tenantA}, ${userA}, ${organizationA}, true),
      (${membershipB}, ${tenantB}, ${userB}, ${organizationB}, true)
  `;
  await admin`
    INSERT INTO roles (id, tenant_id, role_code, display_name)
    VALUES (${roleA}, ${tenantA}, 'ENTITLEMENT_CONTROL', 'Entitlement control')
  `;
  await admin`
    INSERT INTO role_grants (
      id, tenant_id, role_id, action_code, effect, data_scope_kind
    ) VALUES
      (${grantA}, ${tenantA}, ${roleA}, 'platform.entitlement.write', 'ALLOW', 'PLATFORM'),
      (${tenantGrantA}, ${tenantA}, ${roleA}, 'platform.tenant.manage', 'ALLOW', 'PLATFORM'),
      (${impersonationGrantA}, ${tenantA}, ${roleA}, 'platform.impersonate', 'ALLOW', 'PLATFORM')
  `;
  await admin`
    INSERT INTO user_role_assignments (id, tenant_id, user_id, role_id)
    VALUES (${assignmentA}, ${tenantA}, ${userA}, ${roleA})
  `;
  await admin`
    INSERT INTO sessions (
      id, tenant_id, user_id, authentication_method, expires_at
    ) VALUES (${sessionA}, ${tenantA}, ${userA}, 'PASSWORD', now() + interval '1 day')
  `;
  await admin`
    INSERT INTO refresh_token_families (id, tenant_id, session_id)
    VALUES (${tokenFamilyA}, ${tenantA}, ${sessionA})
  `;
  await admin`
    INSERT INTO refresh_tokens (
      id, tenant_id, family_id, token_hash, expires_at
    ) VALUES (${refreshTokenA}, ${tenantA}, ${tokenFamilyA}, ${refreshHash}, now() + interval '1 day')
  `;
  await admin`
    INSERT INTO oauth_states (
      id, tenant_id, provider, state_hash, pkce_verifier_ciphertext,
      encryption_key_version, encryption_nonce, redirect_uri, expires_at
    ) VALUES (
      ${oauthStateA}, ${tenantA}, 'WECHAT', ${oauthStateHash},
      decode(${'1'.repeat(64)}, 'hex'), 'key-v1', decode(${'2'.repeat(24)}, 'hex'),
      'https://example.test/oauth/callback', now() + interval '10 minutes'
    )
  `;
});

afterAll(async () => {
  if (admin) await admin.end();
  if (container) await container.stop();
});

describe('B1 persistence alignment behavior', () => {
  it('enforces compound tenant ownership and RLS on normalized aggregates', async () => {
    await admin`
      INSERT INTO permission_simulations (
        id, tenant_id, actor_user_id, subject_user_id, proposed_policy, expires_at
      ) VALUES (
        '01J2000000000000000000092A', ${tenantA}, ${userA}, ${userA},
        '{"statements":[]}'::jsonb, now() + interval '1 minute'
      )
    `;
    await expect(
      admin`
        INSERT INTO permission_simulations (
          id, tenant_id, actor_user_id, subject_user_id, proposed_policy, expires_at
        ) VALUES (
          '01J2000000000000000000093A', ${tenantA}, ${userA}, ${userA},
          '{"statements":[]}'::jsonb, now() + interval '31 minutes'
        )
      `
    ).rejects.toMatchObject({ code: '23514' });

    await expect(
      admin`
        INSERT INTO user_organization_memberships (
          id, tenant_id, user_id, organization_id
        ) VALUES ('01J2000000000000000000090A', ${tenantA}, ${userB}, ${organizationA})
      `
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      admin`
        INSERT INTO tenants (id, slug, display_name)
        VALUES ('00000000000000000000000000', 'reserved-sentinel', 'Reserved sentinel')
      `
    ).rejects.toMatchObject({ code: '23514' });

    await admin.unsafe("ALTER ROLE zhili_app WITH LOGIN PASSWORD 'alignment-app'");
    const appUrl = new URL(container.getConnectionUri());
    appUrl.username = 'zhili_app';
    appUrl.password = 'alignment-app';
    const app = postgres(appUrl.toString(), { max: 1 });
    try {
      await app`SELECT set_config('app.tenant_id', ${tenantA}, false)`;
      const visible = await app<{ id: string; tenant_id: string }[]>`
        SELECT id, tenant_id FROM user_organization_memberships ORDER BY id
      `;
      expect(visible).toEqual([{ id: membershipA, tenant_id: tenantA }]);
      await expect(
        app`
          INSERT INTO user_organization_memberships (
            id, tenant_id, user_id, organization_id
          ) VALUES ('01J2000000000000000000091B', ${tenantB}, ${userB}, ${organizationB})
        `
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await app.end();
      await admin.unsafe('ALTER ROLE zhili_app WITH NOLOGIN');
    }
  });

  it('exposes opaque refresh lookup and atomic distributed login throttling only as auth capabilities', async () => {
    await admin.unsafe("ALTER ROLE zhili_auth WITH LOGIN PASSWORD 'alignment-auth'");
    const authUrl = new URL(container.getConnectionUri());
    authUrl.username = 'zhili_auth';
    authUrl.password = 'alignment-auth';
    const auth = postgres(authUrl.toString(), { max: 1 });
    try {
      const authBoundaries = await admin<
        {
          config: string[];
          execute_allowed: boolean;
          proname: string;
          public_execute_allowed: boolean;
          security_definer: boolean;
        }[]
      >`
        SELECT p.proname, p.prosecdef AS security_definer, p.proconfig AS config,
          has_function_privilege('zhili_auth', p.oid, 'EXECUTE') AS execute_allowed,
          EXISTS (
            SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
            WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
          ) AS public_execute_allowed
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN (
          'auth_resolve_tenant', 'auth_lookup_oauth_state',
          'auth_lookup_refresh_token', 'auth_consume_login_throttle'
        )
        ORDER BY p.proname
      `;
      expect(authBoundaries).toHaveLength(4);
      for (const boundary of authBoundaries) {
        expect(boundary).toMatchObject({
          security_definer: true,
          config: ['search_path=pg_catalog'],
          execute_allowed: true,
          public_execute_allowed: false,
        });
      }

      const [realToken] = await auth<
        {
          family_id: string;
          family_version: string;
          family_status: string;
          expires_at: Date;
          session_id: string;
          tenant_id: string;
          token_id: string;
          token_status: string;
          token_version: string;
        }[]
      >`
        SELECT token_id, tenant_id, family_id, session_id, token_status, family_status,
               expires_at, token_version::text, family_version::text
        FROM auth_lookup_refresh_token(${refreshHash.toUpperCase()})
      `;
      expect(realToken).toMatchObject({
        token_id: refreshTokenA,
        tenant_id: tenantA,
        family_id: tokenFamilyA,
        session_id: sessionA,
        token_status: 'ACTIVE',
        family_status: 'ACTIVE',
        token_version: '1',
        family_version: '1',
      });
      expect(realToken?.expires_at).toBeInstanceOf(Date);

      const missingToken = await auth<{ token_id: string; token_status: string }[]>`
        SELECT token_id, token_status FROM auth_lookup_refresh_token(${'f'.repeat(64)})
      `;
      expect(missingToken).toHaveLength(1);
      expect(missingToken[0]).toMatchObject({ token_status: 'REVOKED' });

      expect(await auth`SELECT * FROM auth_resolve_tenant('alignment-a')`).toEqual([
        { tenant_id: tenantA, found: true },
      ]);
      expect(await auth`SELECT * FROM auth_resolve_tenant('missing')`).toEqual([
        { tenant_id: '00000000000000000000000000', found: false },
      ]);
      expect(
        await auth`
          SELECT * FROM auth_lookup_oauth_state(${oauthStateHash})
        `
      ).toEqual([{ tenant_id: tenantA, found: true }]);
      expect(
        await auth`
          SELECT * FROM auth_lookup_oauth_state(${'f'.repeat(64)})
        `
      ).toEqual([{ tenant_id: '00000000000000000000000000', found: false }]);

      const attempts: {
        allowed: boolean;
        bucket_version: string;
        failure_count: number;
        retry_after_seconds: number;
      }[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const [result] = await auth<typeof attempts>`
          SELECT * FROM auth_consume_login_throttle(
            ${throttleBucketA}, ${loginHash}, ${tenantA}, false,
            '2026-07-22T00:00:00Z'::timestamptz
          )
        `;
        if (result) attempts.push(result);
      }
      expect(attempts.at(0)).toMatchObject({
        allowed: true,
        failure_count: 1,
        bucket_version: '1',
      });
      expect(attempts.at(-1)).toMatchObject({
        allowed: false,
        failure_count: 5,
        retry_after_seconds: 900,
        bucket_version: '5',
      });

      const cleared = await auth<
        { allowed: boolean; failure_count: number; retry_after_seconds: number }[]
      >`
        SELECT allowed, failure_count, retry_after_seconds
        FROM auth_consume_login_throttle(
          ${throttleBucketA}, ${loginHash}, ${tenantA}, true,
          '2026-07-22T00:00:01Z'::timestamptz
        )
      `;
      expect(cleared).toEqual([{ allowed: true, failure_count: 0, retry_after_seconds: 0 }]);

      await expect(auth`SELECT id FROM refresh_tokens LIMIT 1`).rejects.toMatchObject({
        code: '42501',
      });
      await expect(auth`SELECT id FROM login_throttle_buckets LIMIT 1`).rejects.toMatchObject({
        code: '42501',
      });
      await expect(auth`SELECT id FROM oauth_states LIMIT 1`).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await auth.end();
      await admin.unsafe('ALTER ROLE zhili_auth WITH NOLOGIN');
    }
  });

  it('atomically replaces tenant entitlements with CAS and idempotent replay', async () => {
    await admin.unsafe(
      "ALTER ROLE zhili_control_plane WITH LOGIN PASSWORD 'alignment-control'"
    );
    const controlUrl = new URL(container.getConnectionUri());
    controlUrl.username = 'zhili_control_plane';
    controlUrl.password = 'alignment-control';
    const control = postgres(controlUrl.toString(), { max: 1 });
    const modules = [
      {
        id: entitlementB,
        moduleCode: 'warehouse',
        enabled: true,
        quotas: { users: 10 },
      },
    ];
    const responseModules = [{ moduleCode: 'warehouse', enabled: true, quotas: { users: 10 } }];
    try {
      const executeReplacement = () =>
        control<
          {
            modules: typeof responseModules;
            replayed: boolean;
            tenant_id: string;
            tenant_version: string;
          }[]
        >`
          SELECT tenant_id, modules, tenant_version::text, replayed
          FROM control_plane_replace_entitlements(
            ${tenantA}, ${userA}, ${tenantB}, 1,
            ${control.json(modules)}::jsonb,
            ${operationA}, 'replace-entitlements-a', ${'c'.repeat(64)}
          )
        `;

      const created = await executeReplacement();
      expect(created).toEqual([
        { tenant_id: tenantB, modules: responseModules, tenant_version: '2', replayed: false },
      ]);
      const replayed = await executeReplacement();
      expect(replayed).toEqual([
        { tenant_id: tenantB, modules: responseModules, tenant_version: '2', replayed: true },
      ]);

      await expect(
        control`
          SELECT * FROM control_plane_replace_entitlements(
            ${tenantA}, ${userA}, ${tenantB}, 1,
            ${control.json([
              { ...modules[0], id: '01J2000000000000000000081B' },
            ])}::jsonb,
            ${staleOperationA}, 'replace-entitlements-stale', ${'d'.repeat(64)}
          )
        `
      ).rejects.toMatchObject({ code: '40001' });
      await expect(control`SELECT id FROM tenant_entitlements LIMIT 1`).rejects.toMatchObject({
        code: '42501',
      });

      const [effects] = await admin<
        {
          audit_count: number;
          actor_subject_id: string;
          actor_tenant_id: string;
          entitlement_count: number;
          idempotency_count: number;
          outbox_count: number;
          stale_receipt_count: number;
        }[]
      >`
        SELECT
          (SELECT count(*)::int FROM tenant_entitlements WHERE tenant_id = ${tenantB})
            AS entitlement_count,
          (SELECT created_by_actor_tenant_id FROM tenant_entitlements
            WHERE tenant_id = ${tenantB}) AS actor_tenant_id,
          (SELECT created_by_actor_subject_id FROM tenant_entitlements
            WHERE tenant_id = ${tenantB}) AS actor_subject_id,
          (SELECT count(*)::int FROM audit_events WHERE id = ${operationA}) AS audit_count,
          (SELECT count(*)::int FROM outbox_events WHERE id = ${operationA}) AS outbox_count,
          (SELECT count(*)::int FROM idempotency_records WHERE id = ${operationA})
            AS idempotency_count,
          (SELECT count(*)::int FROM idempotency_records WHERE id = ${staleOperationA})
            AS stale_receipt_count
      `;
      expect(effects).toEqual({
        entitlement_count: 1,
        actor_tenant_id: tenantA,
        actor_subject_id: userA,
        audit_count: 1,
        outbox_count: 1,
        idempotency_count: 1,
        stale_receipt_count: 0,
      });

      await expect(
        control`
          SELECT * FROM control_plane_create_tenant(
            ${tenantA}, ${userA}, '01J2000000000000000000090C',
            'invalid-timezone', 'Invalid timezone', 'Mars/Olympus', 'CNY',
            ${invalidTenantOperationA}, 'invalid-timezone', ${'3'.repeat(64)}
          )
        `
      ).rejects.toMatchObject({ code: '22023' });

      await expect(
        control`
          SELECT * FROM control_plane_start_impersonation(
            ${tenantB}, ${userB}, ${tenantA}, ${deniedImpersonationB},
            'Unauthorized support impersonation', 15, ${deniedImpersonationOperationB},
            'denied-impersonation-b', ${'4'.repeat(64)}
          )
        `
      ).rejects.toMatchObject({ code: '42501' });

      const createTenant = () =>
        control<
          {
            default_currency: string;
            default_timezone: string;
            display_name: string;
            replayed: boolean;
            slug: string;
            status: string;
            tenant_id: string;
            version: string;
          }[]
        >`
        SELECT tenant_id, display_name, slug, status, default_timezone, default_currency,
               version::text, replayed
        FROM control_plane_create_tenant(
          ${tenantA}, ${userA}, ${createdTenantC}, 'alignment-c', 'Alignment C',
          'Asia/Shanghai', 'CNY', ${createTenantOperationA},
          'create-alignment-c', ${'1'.repeat(64)}
        )
      `;
      const [createdTenant] = await createTenant();
      expect(createdTenant).toEqual({
        tenant_id: createdTenantC,
        display_name: 'Alignment C',
        slug: 'alignment-c',
        status: 'ACTIVE',
        default_timezone: 'Asia/Shanghai',
        default_currency: 'CNY',
        version: '1',
        replayed: false,
      });
      expect(await createTenant()).toEqual([{ ...createdTenant, replayed: true }]);
      const [persistedDefaults] = await admin<
        { default_currency: string; default_timezone: string }[]
      >`
        SELECT default_timezone, default_currency FROM tenants WHERE id = ${createdTenantC}
      `;
      expect(persistedDefaults).toEqual({
        default_timezone: 'Asia/Shanghai',
        default_currency: 'CNY',
      });

      const changedStatus = await control`
        SELECT tenant_id, display_name, slug, status, version::text, replayed
        FROM control_plane_set_tenant_status(
          ${tenantA}, ${userA}, ${createdTenantC}, 1, 'SUSPENDED',
          ${statusTenantOperationA}, 'suspend-alignment-c', ${'5'.repeat(64)}
        )
      `;
      expect(changedStatus).toEqual([
        {
          tenant_id: createdTenantC,
          display_name: 'Alignment C',
          slug: 'alignment-c',
          status: 'SUSPENDED',
          version: '2',
          replayed: false,
        },
      ]);
      await expect(
        control`
          SELECT * FROM control_plane_create_tenant(
            ${tenantA}, ${userA}, '00000000000000000000000000',
            'reserved-sentinel', 'Reserved sentinel', 'Asia/Shanghai', 'CNY',
            ${sentinelTenantOperationA}, 'reserved-sentinel', ${'6'.repeat(64)}
          )
        `
      ).rejects.toMatchObject({ code: '23514' });

      const [started] = await control<
        {
          actor_id: string;
          expires_at: Date;
          impersonation_id: string;
          reason: string;
          replayed: boolean;
          tenant_id: string;
          version: string;
        }[]
      >`
        SELECT impersonation_id, tenant_id, actor_id, reason, expires_at,
               version::text, replayed
        FROM control_plane_start_impersonation(
          ${tenantA}, ${userA}, ${tenantB}, ${impersonationB},
          'Investigate tenant support incident', 15, ${startImpersonationOperationA},
          'start-impersonation-b', ${'2'.repeat(64)}
        )
      `;
      expect(started).toMatchObject({
        impersonation_id: impersonationB,
        tenant_id: tenantB,
        actor_id: userA,
        reason: 'Investigate tenant support incident',
        version: '1',
        replayed: false,
      });
      expect(started?.expires_at).toBeInstanceOf(Date);

      const [ended] = await control<
        { impersonation_id: string; tenant_id: string; version: string }[]
      >`
        SELECT impersonation_id, tenant_id, version::text
        FROM control_plane_end_impersonation(
          ${tenantA}, ${userA}, ${tenantB}, ${impersonationB},
          ${endImpersonationOperationA}, 'Operator ended impersonation'
        )
      `;
      expect(ended).toEqual({ impersonation_id: impersonationB, tenant_id: tenantB, version: '2' });
      const [impersonationEffects] = await admin<
        { audit_count: number; outbox_count: number; status: string }[]
      >`
        SELECT
          (SELECT status FROM impersonation_sessions WHERE id = ${impersonationB}) AS status,
          (SELECT count(*)::int FROM audit_events
            WHERE id IN (${startImpersonationOperationA}, ${endImpersonationOperationA}))
            AS audit_count,
          (SELECT count(*)::int FROM outbox_events
            WHERE id IN (${startImpersonationOperationA}, ${endImpersonationOperationA}))
            AS outbox_count
      `;
      expect(impersonationEffects).toEqual({ status: 'ENDED', audit_count: 2, outbox_count: 2 });
      await expect(control`SELECT id FROM impersonation_sessions LIMIT 1`).rejects.toMatchObject({
        code: '42501',
      });
      const [negativeEffects] = await admin<
        { denied_session_count: number; receipt_count: number; tenant_count: number }[]
      >`
        SELECT
          (SELECT count(*)::int FROM tenants
            WHERE id = '01J2000000000000000000090C') AS tenant_count,
          (SELECT count(*)::int FROM impersonation_sessions
            WHERE id = ${deniedImpersonationB}) AS denied_session_count,
          (SELECT count(*)::int FROM idempotency_records
            WHERE id IN (${invalidTenantOperationA}, ${deniedImpersonationOperationB}))
            AS receipt_count
      `;
      expect(negativeEffects).toEqual({
        tenant_count: 0,
        denied_session_count: 0,
        receipt_count: 0,
      });
    } finally {
      await control.end();
      await admin.unsafe('ALTER ROLE zhili_control_plane WITH NOLOGIN');
    }
  });
});
