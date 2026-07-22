import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, '..');

it('generates the canonical Drizzle schema from foundation and applies it to PostgreSQL 17', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'zhili-fresh-drizzle-'));
  const migrationsDirectory = resolve(temporaryDirectory, 'migrations');
  let container: StartedPostgreSqlContainer | undefined;
  try {
    await mkdir(resolve(migrationsDirectory, 'meta'), { recursive: true });
    await cp(
      resolve(packageRoot, 'migrations/0000_foundation.sql'),
      resolve(migrationsDirectory, '0000_foundation.sql')
    );
    await cp(
      resolve(packageRoot, 'migrations/meta/0000_snapshot.json'),
      resolve(migrationsDirectory, 'meta/0000_snapshot.json')
    );
    const journal = JSON.parse(
      await readFile(resolve(packageRoot, 'migrations/meta/_journal.json'), 'utf8')
    ) as { entries: unknown[] };
    await writeFile(
      resolve(migrationsDirectory, 'meta/_journal.json'),
      `${JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }, null, 2)}\n`
    );

    await execFileAsync(
      resolve(packageRoot, 'node_modules/.bin/drizzle-kit'),
      [
        'generate',
        '--dialect',
        'postgresql',
        '--schema',
        resolve(packageRoot, 'src/schema/index.ts'),
        '--out',
        'migrations',
        '--name',
        'fresh_schema',
      ],
      { cwd: temporaryDirectory }
    );

    const generatedFiles = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();
    expect(generatedFiles).toEqual(['0000_foundation.sql', '0001_fresh_schema.sql']);

    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    const sql = postgres(container.getConnectionUri(), { max: 1 });
    try {
      await migrate(drizzle(sql), { migrationsFolder: migrationsDirectory });
      const [inventory] = await sql<{ table_count: number }[]>`
        SELECT count(*)::int AS table_count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `;
      expect(inventory?.table_count).toBe(75);
    } finally {
      await sql.end();
    }
  } finally {
    if (container) await container.stop();
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}, 120_000);
