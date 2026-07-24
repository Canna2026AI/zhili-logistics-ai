import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(workerRoot, '../..');
const temporaryOutput = resolve(workerRoot, '.build');
const productionOutput = resolve(workerRoot, 'dist');

await Promise.all([
  rm(temporaryOutput, { force: true, recursive: true }),
  rm(productionOutput, { force: true, recursive: true }),
]);

try {
  await run(resolve(repositoryRoot, 'node_modules/.bin/tsc'), [
    '-p',
    resolve(workerRoot, 'tsconfig.build.json'),
    '--outDir',
    temporaryOutput,
  ]);
  await build({
    entryPoints: [resolve(temporaryOutput, 'main.js')],
    bundle: true,
    external: [
      '@nestjs/common',
      '@nestjs/core',
      'bullmq',
      'ioredis',
      'pino',
      'postgres',
      'reflect-metadata',
      'rxjs',
      'rxjs/*',
    ],
    format: 'esm',
    outfile: resolve(productionOutput, 'main.js'),
    platform: 'node',
    sourcemap: true,
    target: 'node22',
  });
} finally {
  await rm(temporaryOutput, { force: true, recursive: true });
}

async function run(command, arguments_) {
  const child = spawn(command, arguments_, { cwd: workerRoot, stdio: 'inherit' });
  const [exitCode] = await once(child, 'exit');
  if (exitCode !== 0) process.exit(exitCode ?? 1);
}
