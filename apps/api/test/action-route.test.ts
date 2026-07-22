import 'reflect-metadata';
import { Controller, Module, Param, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { API_GLOBAL_PREFIX, createApiFastifyAdapter } from '../src/main';
import { parseResourceActionSegment, selectRouteVariant } from '../src/platform/action-route';
import {
  ContractOperations,
  assertOpenApiCoverage,
  collectControllerOperations,
} from '../src/platform/contract-operation';
import { IdempotentCommand } from '../src/platform/idempotency';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';

@Controller('warehouse/receipts')
class ReceiptActionController {
  @Post(':receiptAction')
  @ContractOperations([
    { operationId: 'confirmReceipt', contractPath: ':receiptId:confirm' },
    { operationId: 'undoReceipt', contractPath: ':receiptId:undo' },
  ])
  @IdempotentCommand()
  dispatch(@Param('receiptAction') segment: string): object {
    return parseResourceActionSegment(segment, ['confirm', 'undo'] as const);
  }
}

@Controller('last-mile/delivery-tasks/:deliveryTaskId')
class PodActionController {
  @Post(':podVariant')
  @ContractOperations([
    { operationId: 'captureProofOfDelivery', contractPath: 'proof-of-delivery' },
    { operationId: 'amendProofOfDelivery', contractPath: 'proof-of-delivery:amend' },
  ])
  @IdempotentCommand()
  dispatch(@Param('podVariant') segment: string): object {
    return {
      variant: selectRouteVariant(segment, ['proof-of-delivery', 'proof-of-delivery:amend']),
    };
  }
}

@Module({ controllers: [ReceiptActionController, PodActionController] })
class ActionRouteModule {}

const applications: NestFastifyApplication[] = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

async function createApplication(): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [ActionRouteModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createApiFastifyAdapter());
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  await app.init();
  applications.push(app);
  return app;
}

describe('Fastify action-route dispatcher', () => {
  it('boots one runtime route and dispatches both colon-suffixed resource actions', async () => {
    const app = await createApplication();
    const fastify = app.getHttpAdapter().getInstance();

    const confirm = await fastify.inject({
      method: 'POST',
      url: `${API_GLOBAL_PREFIX}/warehouse/receipts/01J0000000000000000000000A:confirm`,
    });
    const undo = await fastify.inject({
      method: 'POST',
      url: `${API_GLOBAL_PREFIX}/warehouse/receipts/01J0000000000000000000000A:undo`,
    });
    const unknown = await fastify.inject({
      method: 'POST',
      url: `${API_GLOBAL_PREFIX}/warehouse/receipts/01J0000000000000000000000A:delete`,
    });

    expect(confirm.statusCode).toBe(201);
    expect(confirm.json()).toEqual({
      resourceId: '01J0000000000000000000000A',
      action: 'confirm',
    });
    expect(undo.statusCode).toBe(201);
    expect(undo.json()).toEqual({
      resourceId: '01J0000000000000000000000A',
      action: 'undo',
    });
    expect(unknown.statusCode).toBe(404);
  });

  it('dispatches a static segment and its colon action without duplicate Fastify routes', async () => {
    const app = await createApplication();
    const fastify = app.getHttpAdapter().getInstance();
    const base = `${API_GLOBAL_PREFIX}/last-mile/delivery-tasks/01J0000000000000000000000A`;

    const capture = await fastify.inject({ method: 'POST', url: `${base}/proof-of-delivery` });
    const amend = await fastify.inject({ method: 'POST', url: `${base}/proof-of-delivery:amend` });

    expect(capture.statusCode).toBe(201);
    expect(capture.json()).toEqual({ variant: 'proof-of-delivery' });
    expect(amend.statusCode).toBe(201);
    expect(amend.json()).toEqual({ variant: 'proof-of-delivery:amend' });
  });

  it('reports every external action path to the OpenAPI coverage guard', async () => {
    const operations = collectControllerOperations(
      [ReceiptActionController, PodActionController],
      API_GLOBAL_PREFIX
    );
    const document = parse(
      await readFile(
        resolve(import.meta.dirname, '../../../packages/contracts/openapi/zhili.openapi.yaml'),
        'utf8'
      )
    );

    expect(operations).toEqual([
      {
        method: 'POST',
        path: `${API_GLOBAL_PREFIX}/warehouse/receipts/{receiptId}:confirm`,
        operationId: 'confirmReceipt',
        idempotency: true,
      },
      {
        method: 'POST',
        path: `${API_GLOBAL_PREFIX}/warehouse/receipts/{receiptId}:undo`,
        operationId: 'undoReceipt',
        idempotency: true,
      },
      {
        method: 'POST',
        path: `${API_GLOBAL_PREFIX}/last-mile/delivery-tasks/{deliveryTaskId}/proof-of-delivery`,
        operationId: 'captureProofOfDelivery',
        idempotency: true,
      },
      {
        method: 'POST',
        path: `${API_GLOBAL_PREFIX}/last-mile/delivery-tasks/{deliveryTaskId}/proof-of-delivery:amend`,
        operationId: 'amendProofOfDelivery',
        idempotency: true,
      },
    ]);
    expect(() => assertOpenApiCoverage(document, operations)).not.toThrow();
  });
});
