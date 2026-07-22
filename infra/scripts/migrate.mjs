import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const GROUP_ROLES_SQL_FILE = '/app/infra/postgres/init/00-roles.sql';
const LOGIN_ROLES = [
  { name: 'zhili_api_login', group: 'zhili_app', forbiddenGroup: 'zhili_worker' },
  { name: 'zhili_worker_login', group: 'zhili_worker', forbiddenGroup: 'zhili_app' },
];

class MigrationFailure extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

let admin;

try {
  const adminUrl = parseDatabaseUrl('ADMIN_DATABASE_URL');
  const apiUrl = parseDatabaseUrl('DATABASE_URL', 'zhili_api_login');
  const workerUrl = parseDatabaseUrl('WORKER_DATABASE_URL', 'zhili_worker_login');
  const migrationsFolder = requiredEnvironment('MIGRATIONS_FOLDER');
  assertSameDatabase(adminUrl, apiUrl);
  assertSameDatabase(adminUrl, workerUrl);

  admin = postgres(adminUrl.toString(), {
    max: 1,
    connection: { application_name: 'zhili-compose-migrate' },
    onnotice: () => undefined,
  });
  const groupRolesSql = await runStage('GROUP_ROLE_FILE_FAILED', () =>
    readFile(GROUP_ROLES_SQL_FILE, 'utf8')
  );
  await runStage('GROUP_ROLE_BOOTSTRAP_FAILED', () => admin.unsafe(groupRolesSql));
  await runStage('DRIZZLE_MIGRATION_FAILED', () => migrate(drizzle(admin), { migrationsFolder }));

  await runStage('ROLE_PROVISION_FAILED', () =>
    normalizeLogin(LOGIN_ROLES[0], databasePassword(apiUrl))
  );
  await runStage('ROLE_PROVISION_FAILED', () =>
    normalizeLogin(LOGIN_ROLES[1], databasePassword(workerUrl))
  );
  await assertRoles();
  console.log('MIGRATE_OK');
} catch (error) {
  const reason = error instanceof MigrationFailure ? error.reason : 'MIGRATION_FAILED';
  console.error(`MIGRATE_ERROR:${reason}`);
  process.exitCode = 1;
} finally {
  if (admin) await admin.end({ timeout: 5 }).catch(() => undefined);
}

async function normalizeLogin(role, password) {
  const existing = await admin`SELECT 1 FROM pg_roles WHERE rolname = ${role.name}`;
  if (existing.length === 0) {
    const createStatement = await runStage('ROLE_STATEMENT_FAILED', () =>
      roleStatement('CREATE ROLE %I LOGIN PASSWORD %L', role.name, password)
    );
    await runStage('ROLE_CREATE_FAILED', () => admin.unsafe(createStatement));
  }
  const alterStatement = await runStage('ROLE_STATEMENT_FAILED', () =>
    roleStatement(
      'ALTER ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L',
      role.name,
      password
    )
  );
  await runStage('ROLE_ALTER_FAILED', () => admin.unsafe(alterStatement));
  await runStage(
    'ROLE_MEMBERSHIP_REVOKE_FAILED',
    () => admin`REVOKE ${admin(role.forbiddenGroup)} FROM ${admin(role.name)}`
  );
  await runStage(
    'ROLE_MEMBERSHIP_GRANT_FAILED',
    () => admin`GRANT ${admin(role.group)} TO ${admin(role.name)}`
  );
}

async function roleStatement(format, roleName, password) {
  const rows = await admin`
    SELECT format(${format}::text, ${roleName}::text, ${password}::text) AS statement
  `;
  const statement = rows[0]?.statement;
  if (typeof statement !== 'string') throw new MigrationFailure('ROLE_STATEMENT_INVALID');
  return statement;
}

async function runStage(reason, work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof MigrationFailure) throw error;
    throw new MigrationFailure(reason);
  }
}

async function assertRoles() {
  const roles = await admin`
    SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
           rolinherit, rolreplication, rolbypassrls
    FROM pg_roles
    WHERE rolname IN ('zhili_api_login', 'zhili_worker_login')
    ORDER BY rolname
  `;
  if (
    roles.length !== 2 ||
    roles.some(
      (role) =>
        role.rolcanlogin !== true ||
        role.rolsuper !== false ||
        role.rolcreatedb !== false ||
        role.rolcreaterole !== false ||
        role.rolinherit !== true ||
        role.rolreplication !== false ||
        role.rolbypassrls !== false
    )
  ) {
    throw new MigrationFailure('ROLE_FLAGS_INVALID');
  }

  const memberships = await admin`
    SELECT member_role.rolname AS member_name, group_role.rolname AS role_name
    FROM pg_auth_members AS membership
    JOIN pg_roles AS group_role ON group_role.oid = membership.roleid
    JOIN pg_roles AS member_role ON member_role.oid = membership.member
    WHERE member_role.rolname IN ('zhili_api_login', 'zhili_worker_login')
    ORDER BY member_name, role_name
  `;
  const actual = memberships.map(({ member_name, role_name }) => `${member_name}:${role_name}`);
  const expected = ['zhili_api_login:zhili_app', 'zhili_worker_login:zhili_worker'];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new MigrationFailure('ROLE_MEMBERSHIP_INVALID');
  }
}

function parseDatabaseUrl(name, expectedUsername) {
  let url;
  try {
    url = new URL(requiredEnvironment(name));
  } catch {
    throw new MigrationFailure('DATABASE_URL_INVALID');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname) {
    throw new MigrationFailure('DATABASE_URL_INVALID');
  }
  if (!url.password) throw new MigrationFailure('DATABASE_PASSWORD_MISSING');
  if (expectedUsername && decodeURIComponent(url.username) !== expectedUsername) {
    throw new MigrationFailure('DATABASE_LOGIN_INVALID');
  }
  return url;
}

function assertSameDatabase(adminUrl, candidateUrl) {
  if (
    adminUrl.hostname !== candidateUrl.hostname ||
    normalizedPort(adminUrl) !== normalizedPort(candidateUrl) ||
    adminUrl.pathname !== candidateUrl.pathname
  ) {
    throw new MigrationFailure('DATABASE_TARGET_MISMATCH');
  }
}

function databasePassword(url) {
  try {
    return decodeURIComponent(url.password);
  } catch {
    throw new MigrationFailure('DATABASE_URL_INVALID');
  }
}

function normalizedPort(url) {
  return url.port || '5432';
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new MigrationFailure('ENVIRONMENT_MISSING');
  return value;
}
