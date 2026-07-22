import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Controller, Get, Module, Post } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { IdempotentCommand, SkipIdempotency } from '../src/platform/idempotency';
import {
  ContractOperation,
  assertOpenApiCoverage,
  collectApplicationOperations,
  collectControllerOperations,
} from '../src/platform/contract-operation';
import {
  API_HEALTH_PROBES,
  API_READINESS_TIMEOUT_MS,
  HealthController,
} from '../src/health.controller';

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

@Module({
  controllers: [HealthController, CoveredFeatureController],
  providers: [
    { provide: API_HEALTH_PROBES, useValue: [] },
    { provide: API_READINESS_TIMEOUT_MS, useValue: 10 },
  ],
})
class CoveredApplicationModule {}

async function openApiDocument(): Promise<unknown> {
  return parse(await readFile(openApiPath, 'utf8'));
}

describe('OpenAPI controller coverage guard', () => {
  it('discovers compiled controllers and combines every route metadata layer', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule, CoveredApplicationModule],
    }).compile();
    const operations = collectApplicationOperations(moduleRef.get(DiscoveryService), '/api/v1');
    await moduleRef.close();

    expect(operations).toEqual([
      {
        method: 'GET',
        path: '/api/v1/health/live',
        operationId: 'getServiceLiveness',
        idempotency: undefined,
      },
      {
        method: 'GET',
        path: '/api/v1/health/ready',
        operationId: 'getServiceReadiness',
        idempotency: undefined,
      },
      {
        method: 'GET',
        path: '/api/v1/waybills/{waybillId}',
        operationId: 'getWaybill',
        idempotency: undefined,
      },
      {
        method: 'POST',
        path: '/api/v1/customers',
        operationId: 'createCustomer',
        idempotency: true,
      },
      {
        method: 'POST',
        path: '/api/v1/auth/password/sessions',
        operationId: 'loginWithPassword',
        idempotency: false,
      },
    ]);
  });

  it('accepts implemented controllers only when route, operationId and idempotency classification match', async () => {
    const document = await openApiDocument();
    expect(() =>
      assertOpenApiCoverage(
        document,
        collectControllerOperations([HealthController, CoveredFeatureController], '/api/v1')
      )
    ).not.toThrow();
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

    const document = await openApiDocument();
    expect(() =>
      assertOpenApiCoverage(
        document,
        collectControllerOperations([UncontractedController], '/api/v1')
      )
    ).toThrow('GET /api/v1/not-in-contract');
    expect(() =>
      assertOpenApiCoverage(
        document,
        collectControllerOperations([WrongOperationController], '/api/v1')
      )
    ).toThrow('getServiceReadiness');
  });

  it('fails metadata true when OpenAPI does not declare Idempotency-Key', async () => {
    @Controller('auth/password')
    class IncorrectEnforcementController {
      @Post('sessions')
      @ContractOperation('loginWithPassword')
      @IdempotentCommand()
      login(): void {}
    }

    const document = await openApiDocument();
    expect(() =>
      assertOpenApiCoverage(
        document,
        collectControllerOperations([IncorrectEnforcementController], '/api/v1')
      )
    ).toThrow('metadata=true');
  });

  it('fails metadata false when OpenAPI declares Idempotency-Key', async () => {
    @Controller()
    class IncorrectSkipController {
      @Post('customers')
      @ContractOperation('createCustomer')
      @SkipIdempotency()
      createCustomer(): void {}
    }

    const document = await openApiDocument();
    expect(() =>
      assertOpenApiCoverage(
        document,
        collectControllerOperations([IncorrectSkipController], '/api/v1')
      )
    ).toThrow('metadata=false');
  });

  it('fails every unclassified implemented mutation even though runtime remains fail-closed', async () => {
    @Controller()
    class UnclassifiedMutationController {
      @Post('customers')
      @ContractOperation('createCustomer')
      createCustomer(): void {}
    }

    const document = await openApiDocument();
    expect(() =>
      assertOpenApiCoverage(
        document,
        collectControllerOperations([UnclassifiedMutationController], '/api/v1')
      )
    ).toThrow('must declare @IdempotentCommand() or @SkipIdempotency()');
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
