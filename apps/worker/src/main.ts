import 'reflect-metadata';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { pathToFileURL } from 'node:url';
import { loadWorkerEnv } from '@zhili/config';
import { createLogger } from '@zhili/observability';
import { WorkerModule } from './worker.module';

export async function createWorkerApplication(): Promise<INestApplicationContext> {
  loadWorkerEnv();
  const application = await NestFactory.createApplicationContext(WorkerModule, {
    logger: false,
  });
  application.enableShutdownHooks();
  return application;
}

export async function bootstrap(): Promise<INestApplicationContext> {
  const application = await createWorkerApplication();
  createLogger({ name: 'zhili-outbox-worker' }).info('Outbox worker started');
  return application;
}

function isEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return typeof entrypoint === 'string' && pathToFileURL(entrypoint).href === import.meta.url;
}

if (isEntrypoint()) {
  void bootstrap().catch((exception: unknown) => {
    createLogger({ name: 'zhili-outbox-worker-bootstrap' }).fatal(
      { exception: { type: exception instanceof Error ? 'Error' : typeof exception } },
      'Outbox worker bootstrap failed'
    );
    process.exitCode = 1;
  });
}
