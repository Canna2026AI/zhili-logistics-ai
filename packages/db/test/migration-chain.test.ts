import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, '..');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe('Drizzle migration chain', () => {
  it('generates the next migration from the foundation snapshot without recreating tables', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'zhili-db-migration-chain-'));
    temporaryDirectories.push(temporaryDirectory);
    const migrationOutput = resolve(temporaryDirectory, 'migrations');
    await cp(resolve(packageRoot, 'migrations'), migrationOutput, { recursive: true });

    await execFileAsync(
      resolve(packageRoot, 'node_modules/.bin/drizzle-kit'),
      [
        'generate',
        '--dialect',
        'postgresql',
        '--schema',
        resolve(packageRoot, 'src/schema/index.ts'),
        '--out',
        migrationOutput,
        '--name',
        'chain_probe',
      ],
      { cwd: packageRoot }
    );

    const migrationFiles = (await readdir(migrationOutput)).filter((file) => file.endsWith('.sql'));
    const nextMigrationFiles = migrationFiles.filter((file) => file !== '0000_foundation.sql');
    const nextMigrationSql = (
      await Promise.all(
        nextMigrationFiles.map((file) => readFile(resolve(migrationOutput, file), 'utf8'))
      )
    ).join('\n');

    expect(nextMigrationFiles).toEqual([]);
    expect(nextMigrationSql).not.toMatch(
      /CREATE TABLE "(?:audit_events|idempotency_records|outbox_events)"/
    );
  });
});
