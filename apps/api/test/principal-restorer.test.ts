import 'reflect-metadata';
import { Controller, Get, Module, Req } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthenticatedPrincipal } from '@zhili/auth';
import { API_ENV, registerFeatureModule } from '../src/app.module';
import { API_HEALTH_PROBES, API_READINESS_TIMEOUT_MS } from '../src/health.controller';
import { configureApiApplication, createApiFastifyAdapter } from '../src/main';
import {
  API_PRINCIPAL_RESTORER,
  type ApiPrincipalRestorer,
} from '../src/platform/principal-restorer';

const handler = vi.fn((request: FastifyRequest) => ({ subjectId: request.principal?.subjectId }));

@Controller('restorer-test')
class RestorerTestController {
  @Get()
  get(@Req() request: FastifyRequest): object {
    return handler(request);
  }
}

const applications: NestFastifyApplication[] = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
  handler.mockClear();
});

async function createApplication(restorer: ApiPrincipalRestorer): Promise<NestFastifyApplication> {
  @Module({
    controllers: [RestorerTestController],
    providers: [{ provide: API_PRINCIPAL_RESTORER, useValue: restorer }],
    exports: [API_PRINCIPAL_RESTORER],
  })
  class RestorerFeatureModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [registerFeatureModule(RestorerFeatureModule)],
  })
    .overrideProvider(API_ENV)
    .useValue({
      DATABASE_URL: 'postgresql://localhost/restorer-test',
      REDIS_URL: 'redis://localhost:6379',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_ACCESS_KEY: 'restorer-test-access',
      S3_SECRET_KEY: 'restorer-test-secret',
      SESSION_KEY: 'restorer-test-session-key-32-bytes',
      ENVELOPE_MASTER_KEY: 'restorer-test-envelope-key-32-bytes',
      NODE_ENV: 'test',
      PORT: 3000,
      LOG_LEVEL: 'info',
    })
    .overrideProvider(API_HEALTH_PROBES)
    .useValue([])
    .overrideProvider(API_READINESS_TIMEOUT_MS)
    .useValue(10)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createApiFastifyAdapter());
  await configureApiApplication(app, { enableShutdownHooks: false });
  await app.init();
  applications.push(app);
  return app;
}

describe('principal restoration before global authentication', () => {
  it('uses an exported feature restorer before authentication and permission guards', async () => {
    const restore = vi.fn<ApiPrincipalRestorer['restore']>(async (request) => {
      if (request.headers.authorization !== 'Bearer restored-session') return;
      request.principal = createAuthenticatedPrincipal({
        tenantId: '01J0000000000000000000000A',
        subjectId: '01J0000000000000000000000B',
        permissions: [],
      });
    });
    const app = await createApplication({ restore });
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/api/v1/restorer-test',
        headers: { authorization: 'Bearer restored-session' },
      });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ subjectId: '01J0000000000000000000000B' });
    expect(restore).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  it('fails closed without executing a handler when restoration throws', async () => {
    const app = await createApplication({
      restore: vi.fn(async () => {
        throw new Error('session store unavailable');
      }),
    });
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/api/v1/restorer-test',
        headers: { authorization: 'Bearer unavailable-session' },
      });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'UNAUTHORIZED' });
    expect(handler).not.toHaveBeenCalled();
  });
});
