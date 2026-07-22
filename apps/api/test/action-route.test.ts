import 'reflect-metadata';
import { Controller, Module, Param, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { API_GLOBAL_PREFIX, createApiFastifyAdapter } from '../src/main';
import { internalActionPath, rewriteColonActionUrl } from '../src/platform/action-route';
import {
  ContractOperation,
  assertOpenApiCoverage,
  collectControllerOperations,
} from '../src/platform/contract-operation';
import { IdempotentCommand } from '../src/platform/idempotency';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { RequirePermissions } from '@zhili/auth';

@Controller('warehouse/receipts')
class ReceiptActionController {
  @Post(internalActionPath(':receiptId', 'confirm'))
  @ContractOperation('confirmReceipt', ':receiptId:confirm')
  @RequirePermissions('warehouse.receipt.confirm')
  @IdempotentCommand()
  confirm(@Param('receiptId') receiptId: string): object {
    return { receiptId, action: 'confirm' };
  }

  @Post(internalActionPath(':receiptId', 'undo'))
  @ContractOperation('undoReceipt', ':receiptId:undo')
  @RequirePermissions('warehouse.receipt.confirm')
  @IdempotentCommand()
  undo(@Param('receiptId') receiptId: string): object {
    return { receiptId, action: 'undo' };
  }
}

@Controller('last-mile/delivery-tasks/:deliveryTaskId')
class PodActionController {
  @Post('proof-of-delivery')
  @ContractOperation('captureProofOfDelivery')
  @RequirePermissions('lastmile.pod.write')
  @IdempotentCommand()
  capture(): object {
    return { action: 'capture' };
  }

  @Post(internalActionPath('proof-of-delivery', 'amend'))
  @ContractOperation('amendProofOfDelivery', 'proof-of-delivery:amend')
  @RequirePermissions('lastmile.pod.write')
  @IdempotentCommand()
  amend(): object {
    return { action: 'amend' };
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

describe('Fastify colon-action URL rewriting', () => {
  it.each([
    ['/api/v1/orders/order-1:submit', '/api/v1/orders/order-1/__zhili_action__/submit'],
    [
      '/api/v1/tasks/task-1/proof-of-delivery:amend?locale=zh-CN',
      '/api/v1/tasks/task-1/proof-of-delivery/__zhili_action__/amend?locale=zh-CN',
    ],
    ['/api/v1/auth/sessions:refresh', '/api/v1/auth/sessions/__zhili_action__/refresh'],
    ['/api/v1/waybills/order-1', '/api/v1/waybills/order-1'],
  ])('rewrites only a path action and preserves the query: %s', (external, internal) => {
    expect(rewriteColonActionUrl(external)).toBe(internal);
  });

  it('boots distinct handlers and serves every external colon-action URL', async () => {
    const app = await createApplication();
    const fastify = app.getHttpAdapter().getInstance();
    const resourceId = '01J0000000000000000000000A';

    const confirm = await fastify.inject({
      method: 'POST',
      url: `${API_GLOBAL_PREFIX}/warehouse/receipts/${resourceId}:confirm`,
    });
    const undo = await fastify.inject({
      method: 'POST',
      url: `${API_GLOBAL_PREFIX}/warehouse/receipts/${resourceId}:undo`,
    });
    const capture = await fastify.inject({
      method: 'POST',
      url: `${API_GLOBAL_PREFIX}/last-mile/delivery-tasks/${resourceId}/proof-of-delivery`,
    });
    const amend = await fastify.inject({
      method: 'POST',
      url: `${API_GLOBAL_PREFIX}/last-mile/delivery-tasks/${resourceId}/proof-of-delivery:amend`,
    });

    expect(confirm.json()).toEqual({ receiptId: resourceId, action: 'confirm' });
    expect(undo.json()).toEqual({ receiptId: resourceId, action: 'undo' });
    expect(capture.json()).toEqual({ action: 'capture' });
    expect(amend.json()).toEqual({ action: 'amend' });
  });

  it.each(['__zhili_action__', '__zhili%5Faction%5F%5F'])(
    'keeps the internal routing namespace unreachable from a direct client request: %s',
    async (reservedSegment) => {
      const app = await createApplication();
      const fastify = app.getHttpAdapter().getInstance();
      const direct = await fastify.inject({
        method: 'POST',
        url: `${API_GLOBAL_PREFIX}/warehouse/receipts/01J0000000000000000000000A/${reservedSegment}/confirm`,
      });

      expect(direct.statusCode).toBe(404);
    }
  );

  it('reports external paths, operation IDs and idempotency to the OpenAPI guard', async () => {
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
        permissions: ['warehouse.receipt.confirm'],
      },
      {
        method: 'POST',
        path: `${API_GLOBAL_PREFIX}/warehouse/receipts/{receiptId}:undo`,
        operationId: 'undoReceipt',
        idempotency: true,
        permissions: ['warehouse.receipt.confirm'],
      },
      {
        method: 'POST',
        path: `${API_GLOBAL_PREFIX}/last-mile/delivery-tasks/{deliveryTaskId}/proof-of-delivery`,
        operationId: 'captureProofOfDelivery',
        idempotency: true,
        permissions: ['lastmile.pod.write'],
      },
      {
        method: 'POST',
        path: `${API_GLOBAL_PREFIX}/last-mile/delivery-tasks/{deliveryTaskId}/proof-of-delivery:amend`,
        operationId: 'amendProofOfDelivery',
        idempotency: true,
        permissions: ['lastmile.pod.write'],
      },
    ]);
    expect(() => assertOpenApiCoverage(document, operations)).not.toThrow();
  });
});
