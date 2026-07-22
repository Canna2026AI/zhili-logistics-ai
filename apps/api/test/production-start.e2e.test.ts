import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

describe('production API artifact', () => {
  it('starts from a production-pruned deployment without tsx or other dev dependencies', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(repositoryRoot, 'apps/api/package.json'), 'utf8')
    ) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.start).toBe('node dist/main.js');
    expect(packageJson.dependencies).toMatchObject({
      'drizzle-orm': expect.any(String),
      postgres: expect.any(String),
    });

    await run('pnpm', ['--filter', '@zhili/api', 'build'], repositoryRoot);
    const deploymentRoot = await mkdtemp(resolve(tmpdir(), 'zhili-api-production-'));
    try {
      await run(
        'pnpm',
        [
          '--config.inject-workspace-packages=true',
          '--filter',
          '@zhili/api',
          'deploy',
          '--prod',
          deploymentRoot,
        ],
        repositoryRoot
      );
      await expect(access(resolve(deploymentRoot, 'node_modules/tsx'))).rejects.toThrow();
      await expect(access(resolve(deploymentRoot, 'node_modules/drizzle-orm'))).resolves.toBe(
        undefined
      );
      await expect(access(resolve(deploymentRoot, 'node_modules/postgres'))).resolves.toBe(
        undefined
      );

      const port = await availablePort();
      const child = spawn(process.execPath, ['dist/main.js'], {
        cwd: deploymentRoot,
        env: {
          ...process.env,
          DATABASE_URL: 'postgresql://production:production@127.0.0.1:1/production',
          REDIS_URL: 'redis://127.0.0.1:1',
          S3_ENDPOINT: 'http://127.0.0.1:1',
          S3_ACCESS_KEY: 'production-access',
          S3_SECRET_KEY: 'production-secret',
          SESSION_KEY: 'production-session',
          ENVELOPE_MASTER_KEY: 'production-envelope',
          NODE_ENV: 'production',
          PORT: String(port),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
      });

      try {
        const response = await waitForHttp(
          `http://127.0.0.1:${port}/api/v1/health/live`,
          child,
          () => output
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ data: { status: 'ok' } });
        child.kill('SIGTERM');
        const [exitCode, signal] = (await once(child, 'exit')) as [number | null, string | null];
        expect({ exitCode, signal, output }).toMatchObject({
          exitCode: null,
          signal: 'SIGTERM',
        });
      } finally {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
          await once(child, 'exit');
        }
      }
    } finally {
      await rm(deploymentRoot, { force: true, recursive: true });
    }
  }, 120_000);
});

async function run(command: string, arguments_: readonly string[], cwd: string): Promise<void> {
  const child = spawn(command, [...arguments_], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8');
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8');
  });
  const [exitCode] = (await once(child, 'exit')) as [number | null];
  if (exitCode !== 0) throw new Error(`${command} ${arguments_.join(' ')} failed:\n${output}`);
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not reserve API test port');
  await new Promise<void>((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose()))
  );
  return address.port;
}

async function waitForHttp(
  url: string,
  child: ReturnType<typeof spawn>,
  processOutput: () => string
): Promise<Response> {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Production API exited before it became ready:\n${processOutput()}`);
    }
    try {
      return await fetch(url);
    } catch {
      await delay(50);
    }
  }
  throw new Error(`Production API did not become ready before timeout:\n${processOutput()}`);
}
