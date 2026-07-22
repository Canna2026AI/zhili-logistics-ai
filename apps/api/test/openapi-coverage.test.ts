import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Controller, Get, Module, Post, type Type } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { IdempotentCommand, SkipIdempotency } from '../src/platform/idempotency';
import {
  ContractOperation,
  assertOpenApiCoverage,
  collectApplicationOperations,
} from '../src/platform/contract-operation';
import { API_HEALTH_PROBES, API_READINESS_TIMEOUT_MS } from '../src/health.controller';
import { API_ENV, AppModule, registerFeatureModule } from '../src/app.module';
import { API_GLOBAL_PREFIX } from '../src/main';

const openApiPath = resolve(
  import.meta.dirname,
  '../../../packages/contracts/openapi/zhili.openapi.yaml'
);

@Controller()
class CoveredFeatureController {
  @Get('waybills/:waybillId')
  @ContractOperation('getWaybill')
  getWaybill(): void {}

  @Post('customers')
  @ContractOperation('createCustomer')
  @IdempotentCommand()
  createCustomer(): void {}

  @Post('auth/password/sessions')
  @ContractOperation('loginWithPassword')
  @SkipIdempotency()
  loginWithPassword(): void {}
}

@Module({ controllers: [CoveredFeatureController] })
class CoveredFeatureModule {}

async function openApiDocument(): Promise<unknown> {
  return parse(await readFile(openApiPath, 'utf8'));
}

async function composedOperations(featureModule?: Type<unknown>) {
  const rootModule = featureModule ? registerFeatureModule(featureModule) : AppModule;
  const moduleRef = await Test.createTestingModule({ imports: [rootModule] })
    .overrideProvider(API_ENV)
    .useValue({
      DATABASE_URL: 'postgresql://localhost/coverage',
      REDIS_URL: 'redis://localhost:6379',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_ACCESS_KEY: 'coverage-access',
      S3_SECRET_KEY: 'coverage-secret',
      SESSION_KEY: 'coverage-session',
      ENVELOPE_MASTER_KEY: 'coverage-envelope',
      NODE_ENV: 'test',
      PORT: 3000,
      LOG_LEVEL: 'info',
    })
    .overrideProvider(API_HEALTH_PROBES)
    .useValue([])
    .overrideProvider(API_READINESS_TIMEOUT_MS)
    .useValue(10)
    .compile();
  try {
    return collectApplicationOperations(moduleRef.get(DiscoveryService), API_GLOBAL_PREFIX);
  } finally {
    await moduleRef.close();
  }
}

describe('OpenAPI controller coverage guard', () => {
  it('guards the real AppModule and production feature composition with one prefix constant', async () => {
    expect(await composedOperations()).toEqual([
      {
        method: 'GET',
        path: `${API_GLOBAL_PREFIX}/health/live`,
        operationId: 'getServiceLiveness',
        idempotency: undefined,
      },
      {
        method: 'GET',
        path: `${API_GLOBAL_PREFIX}/health/ready`,
        operationId: 'getServiceReadiness',
        idempotency: undefined,
      },
    ]);

    expect(await composedOperations(CoveredFeatureModule)).toEqual([
      {
        method: 'GET',
        path: `${API_GLOBAL_PREFIX}/health/live`,
        operationId: 'getServiceLiveness',
        idempotency: undefined,
      },
      {
        method: 'GET',
        path: `${API_GLOBAL_PREFIX}/health/ready`,
        operationId: 'getServiceReadiness',
        idempotency: undefined,
      },
      {
        method: 'GET',
        path: `${API_GLOBAL_PREFIX}/waybills/{waybillId}`,
        operationId: 'getWaybill',
        idempotency: undefined,
      },
      {
        method: 'POST',
        path: `${API_GLOBAL_PREFIX}/customers`,
        operationId: 'createCustomer',
        idempotency: true,
      },
      {
        method: 'POST',
        path: `${API_GLOBAL_PREFIX}/auth/password/sessions`,
        operationId: 'loginWithPassword',
        idempotency: false,
      },
    ]);
  });

  it('accepts implemented controllers only when route, operationId and idempotency classification match', async () => {
    const document = await openApiDocument();
    const baseOperations = await composedOperations();
    const featureOperations = await composedOperations(CoveredFeatureModule);
    expect(() => assertOpenApiCoverage(document, baseOperations)).not.toThrow();
    expect(() => assertOpenApiCoverage(document, featureOperations)).not.toThrow();
  });

  it('fails an uncontracted route and an operationId mismatch', async () => {
    @Controller('not-in-contract')
    class UncontractedController {
      @Get()
      @ContractOperation('inventedOperation')
      invented(): void {}
    }

    @Controller('health')
    class WrongOperationController {
      @Get('live')
      @ContractOperation('getServiceReadiness')
      live(): void {}
    }

    @Module({ controllers: [UncontractedController] })
    class UncontractedFeatureModule {}

    @Module({ controllers: [WrongOperationController] })
    class WrongOperationFeatureModule {}

    const document = await openApiDocument();
    const uncontractedOperations = await composedOperations(UncontractedFeatureModule);
    const wrongOperationOperations = await composedOperations(WrongOperationFeatureModule);
    expect(() => assertOpenApiCoverage(document, uncontractedOperations)).toThrow(
      `GET ${API_GLOBAL_PREFIX}/not-in-contract`
    );
    expect(() => assertOpenApiCoverage(document, wrongOperationOperations)).toThrow(
      'getServiceReadiness'
    );
  });

  it('fails metadata true when OpenAPI does not declare Idempotency-Key', async () => {
    @Controller('auth/password')
    class IncorrectEnforcementController {
      @Post('sessions')
      @ContractOperation('loginWithPassword')
      @IdempotentCommand()
      login(): void {}
    }

    @Module({ controllers: [IncorrectEnforcementController] })
    class IncorrectEnforcementFeatureModule {}

    const document = await openApiDocument();
    const operations = await composedOperations(IncorrectEnforcementFeatureModule);
    expect(() => assertOpenApiCoverage(document, operations)).toThrow('metadata=true');
  });

  it('fails metadata false when OpenAPI declares Idempotency-Key', async () => {
    @Controller()
    class IncorrectSkipController {
      @Post('customers')
      @ContractOperation('createCustomer')
      @SkipIdempotency()
      createCustomer(): void {}
    }

    @Module({ controllers: [IncorrectSkipController] })
    class IncorrectSkipFeatureModule {}

    const document = await openApiDocument();
    const operations = await composedOperations(IncorrectSkipFeatureModule);
    expect(() => assertOpenApiCoverage(document, operations)).toThrow('metadata=false');
  });

  it('fails every unclassified implemented mutation even though runtime remains fail-closed', async () => {
    @Controller()
    class UnclassifiedMutationController {
      @Post('customers')
      @ContractOperation('createCustomer')
      createCustomer(): void {}
    }

    @Module({ controllers: [UnclassifiedMutationController] })
    class UnclassifiedMutationFeatureModule {}

    const document = await openApiDocument();
    const operations = await composedOperations(UnclassifiedMutationFeatureModule);
    expect(() => assertOpenApiCoverage(document, operations)).toThrow(
      'must declare @IdempotentCommand() or @SkipIdempotency()'
    );
  });

  it('keeps emitted Problems compatible with the OpenAPI ErrorEnvelope fields', async () => {
    const document = (await openApiDocument()) as {
      components: { schemas: { ErrorEnvelope: { required: string[]; properties: object } } };
    };
    const schema = document.components.schemas.ErrorEnvelope;

    expect(schema.required).toEqual(['code', 'message', 'details', 'remediation', 'requestId']);
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['code', 'message', 'detail', 'details', 'remediation', 'requestId'])
    );
  });
});
