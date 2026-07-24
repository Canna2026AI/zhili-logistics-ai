import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import type { DynamicModule, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { IncomingMessage } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '@zhili/config';
import { createLogger } from '@zhili/observability';
import { AppModule } from './app.module';
import { rewriteColonActionUrl } from './platform/action-route';

export const API_BODY_LIMIT_BYTES = 1024 * 1024;
export const API_GLOBAL_PREFIX = '/api/v1';

export function createApiFastifyAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    bodyLimit: API_BODY_LIMIT_BYTES,
    logger: false,
    rewriteUrl: (request: IncomingMessage) => rewriteColonActionUrl(request.url ?? '/'),
  });
}

export async function configureApiApplication(
  app: NestFastifyApplication,
  options: { readonly enableShutdownHooks?: boolean } = {}
): Promise<void> {
  await app.register(fastifyHelmet);
  await app.register(fastifyCookie);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  if (options.enableShutdownHooks !== false) app.enableShutdownHooks();
}

export async function createApiApplication(
  rootModule: Type<unknown> | DynamicModule = AppModule
): Promise<NestFastifyApplication> {
  loadEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    rootModule,
    createApiFastifyAdapter(),
    { bufferLogs: true }
  );
  await configureApiApplication(app);
  return app;
}

export async function bootstrap(): Promise<NestFastifyApplication> {
  const env = loadEnv();
  const app = await createApiApplication();
  await app.listen({ host: '0.0.0.0', port: env.PORT });
  return app;
}

function isEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return typeof entrypoint === 'string' && pathToFileURL(entrypoint).href === import.meta.url;
}

if (isEntrypoint()) {
  void bootstrap().catch((exception: unknown) => {
    createLogger({ name: 'zhili-api-bootstrap' }).fatal(
      { exception: { type: exception instanceof Error ? 'Error' : typeof exception } },
      'API bootstrap failed'
    );
    process.exitCode = 1;
  });
}
