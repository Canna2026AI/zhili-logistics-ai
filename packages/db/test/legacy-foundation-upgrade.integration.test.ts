import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const currentMigrations = resolve(packageRoot, 'migrations');
const legacyFoundationFixture = resolve(packageRoot, 'test/fixtures/0000_foundation.r2.sql');

async function createLegacyMigrationFolder(): Promise<string> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'zhili-legacy-foundation-'));
  const migrationsDirectory = resolve(temporaryDirectory, 'migrations');
  await mkdir(resolve(migrationsDirectory, 'meta'), { recursive: true });
  await cp(legacyFoundationFixture, resolve(migrationsDirectory, '0000_foundation.sql'));
  await cp(
    resolve(currentMigrations, 'meta/0000_snapshot.json'),
    resolve(migrationsDirectory, 'meta/0000_snapshot.json')
  );
  const journal = JSON.parse(
    await readFile(resolve(currentMigrations, 'meta/_journal.json'), 'utf8')
  ) as { entries: unknown[] };
  await writeFile(
    resolve(migrationsDirectory, 'meta/_journal.json'),
    `${JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }, null, 2)}\n`
  );
  return temporaryDirectory;
}

async function capturePreservedResources(sql: Sql): Promise<unknown> {
  return {
    roles: await sql<
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
    objects: await sql<{ object_name: string; object_owner: string; object_type: string }[]>`
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
    extension: await sql<
      { extname: string; extowner: string; extversion: string; schema_name: string }[]
    >`
      SELECT extension_row.extname, extension_row.extversion,
             owner_role.rolname AS extowner, namespace_row.nspname AS schema_name
      FROM pg_extension extension_row
      JOIN pg_roles owner_role ON owner_role.oid = extension_row.extowner
      JOIN pg_namespace namespace_row ON namespace_row.oid = extension_row.extnamespace
      WHERE extension_row.extname = 'btree_gist'
    `,
    dependency: await sql<{ definition: string }[]>`
      SELECT pg_get_constraintdef(constraint_row.oid, true) AS definition
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = 'public.unrelated_extension_probe'::regclass
        AND constraint_row.contype = 'x'
    `,
  };
}

it('upgrades a recorded R2 foundation by creating only missing persistent prerequisites', async () => {
  const legacyDirectory = await createLegacyMigrationFolder();
  let container: StartedPostgreSqlContainer | undefined;
  try {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    const sql = postgres(container.getConnectionUri(), { max: 1 });
    try {
      await migrate(drizzle(sql), { migrationsFolder: resolve(legacyDirectory, 'migrations') });
      const missingBeforeUpgrade = await sql<{ resource_name: string }[]>`
        SELECT rolname AS resource_name FROM pg_roles
        WHERE rolname IN ('zhili_auth', 'zhili_control_plane')
        UNION ALL
        SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
      `;
      expect(missingBeforeUpgrade).toEqual([]);

      await migrate(drizzle(sql), { migrationsFolder: currentMigrations });

      const roles = await sql<
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
      `;
      expect(roles).toEqual([
        {
          rolname: 'zhili_auth',
          rolsuper: false,
          rolinherit: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolcanlogin: false,
          rolbypassrls: false,
        },
        {
          rolname: 'zhili_control_plane',
          rolsuper: false,
          rolinherit: false,
          rolcreatedb: false,
          rolcreaterole: false,
          rolcanlogin: false,
          rolbypassrls: false,
        },
      ]);
      expect(
        await sql<{ extname: string }[]>`
          SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
        `
      ).toEqual([{ extname: 'btree_gist' }]);
      const [migrationCount] = await sql<{ migration_count: number }[]>`
        SELECT count(*)::int AS migration_count FROM drizzle.__drizzle_migrations
      `;
      expect(migrationCount?.migration_count).toBe(3);

      await sql.unsafe(
        await readFile(
          resolve(currentMigrations, 'down/0002_b1_persistence_alignment.down.sql'),
          'utf8'
        )
      );
      await sql.unsafe(
        await readFile(resolve(currentMigrations, 'down/0001_b1_domains.down.sql'), 'utf8')
      );
      expect(
        await sql<{ resource_name: string }[]>`
          SELECT rolname AS resource_name FROM pg_roles
          WHERE rolname IN ('zhili_auth', 'zhili_control_plane')
          UNION ALL
          SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
          ORDER BY resource_name
        `
      ).toEqual([
        { resource_name: 'btree_gist' },
        { resource_name: 'zhili_auth' },
        { resource_name: 'zhili_control_plane' },
      ]);
    } finally {
      await sql.end();
    }
  } finally {
    if (container) await container.stop();
    await rm(legacyDirectory, { force: true, recursive: true });
  }
}, 120_000);

it('does not alter pre-existing prerequisite roles, owners, or extension dependencies on legacy upgrade', async () => {
  const legacyDirectory = await createLegacyMigrationFolder();
  let container: StartedPostgreSqlContainer | undefined;
  try {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    const sql = postgres(container.getConnectionUri(), { max: 1 });
    try {
      await sql.unsafe(`
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
      await migrate(drizzle(sql), { migrationsFolder: resolve(legacyDirectory, 'migrations') });
      const beforeUpgrade = await capturePreservedResources(sql);

      await migrate(drizzle(sql), { migrationsFolder: currentMigrations });
      await sql.unsafe(
        await readFile(
          resolve(currentMigrations, 'down/0002_b1_persistence_alignment.down.sql'),
          'utf8'
        )
      );
      await sql.unsafe(
        await readFile(resolve(currentMigrations, 'down/0001_b1_domains.down.sql'), 'utf8')
      );

      expect(await capturePreservedResources(sql)).toEqual(beforeUpgrade);
    } finally {
      await sql.end();
    }
  } finally {
    if (container) await container.stop();
    await rm(legacyDirectory, { force: true, recursive: true });
  }
}, 120_000);
