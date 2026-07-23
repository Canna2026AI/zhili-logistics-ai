import { createZhiliClient } from '@zhili/api-client';
import { describe, expect, it } from 'vitest';
import {
  createApiFulfillmentFinanceCommandPort,
  fulfillmentFinanceApiRoutes,
} from './api-command-port';
import type { FulfillmentFinanceOperationId } from './fulfillment-finance-workbench';

describe('API fulfillment finance command port', () => {
  it('routes every registered union command through its operation-specific contract path', async () => {
    const requests: Request[] = [];
    const client = createZhiliClient({
      baseUrl: 'https://api.zhili.test/v1',
      fetch: async (input) => {
        requests.push(new Request(input));
        return Response.json({
          data: { resourceId: 'REF-001', status: 'ACCEPTED', version: 2 },
          meta: {
            requestId: `REQ-${requests.length}`,
            timestamp: '2026-07-22T08:00:00Z',
          },
        });
      },
    });
    const port = createApiFulfillmentFinanceCommandPort(client);
    const operationIds = Object.keys(
      fulfillmentFinanceApiRoutes
    ) as FulfillmentFinanceOperationId[];

    for (const operationId of operationIds) {
      await port.execute({
        domain: 'finance',
        operationId,
        entityRef: 'REF-001',
        idempotencyKey: `${operationId}:REF-001:v1`,
        expectedVersion: 1,
        payload: { reason: '契约路由验证', impact: '仅用于端口测试' },
      });
    }

    expect(requests).toHaveLength(operationIds.length);
    for (const [index, operationId] of operationIds.entries()) {
      const route = fulfillmentFinanceApiRoutes[operationId];
      const expectedPath = route.path.replace(/\{[^}]+\}/g, 'REF-001');
      expect(requests[index]?.url).toBe(`https://api.zhili.test/v1${expectedPath}`);
      expect(requests[index]?.method).toBe(route.method);
    }
  });

  it('uses the generated unreview adapter with reason, If-Match and idempotency key', async () => {
    let request: Request | undefined;
    const client = createZhiliClient({
      baseUrl: 'https://api.zhili.test/v1',
      fetch: async (input) => {
        request = new Request(input);
        return Response.json({
          data: { resourceId: 'CHG-S2505120004', status: 'DRAFT', version: 12 },
          meta: { requestId: 'REQ-FIN-0098', timestamp: '2026-07-22T08:00:00Z' },
        });
      },
    });
    const port = createApiFulfillmentFinanceCommandPort(client);

    const result = await port.execute({
      domain: 'finance',
      operationId: 'unreviewCharge',
      entityRef: 'CHG-S2505120004',
      idempotencyKey: 'unreviewCharge:CHG-S2505120004:v11',
      expectedVersion: 11,
      payload: {
        reason: '承运商补传尾程费用',
        impact: '需要重新检查支付分配与期间',
        auditDestination: 'audit://finance/charges/CHG-S2505120004',
      },
    });

    expect(request?.url).toBe('https://api.zhili.test/v1/finance/charges/CHG-S2505120004:unreview');
    expect(request?.headers.get('If-Match')).toBe('"11"');
    expect(request?.headers.get('Idempotency-Key')).toBe('unreviewCharge:CHG-S2505120004:v11');
    await expect(request?.json()).resolves.toMatchObject({
      reason: '承运商补传尾程费用',
      version: 11,
    });
    expect(result).toEqual({ evidence: { kind: 'trace', requestId: 'REQ-FIN-0098' } });
  });

  it('sends WH-08 print through the generated client instead of local success', async () => {
    const requests: Request[] = [];
    const client = createZhiliClient({
      baseUrl: 'https://api.zhili.test/v1',
      fetch: async (input) => {
        requests.push(new Request(input));
        return Response.json({
          data: { resourceId: 'PRINT-S2505120004', status: 'QUEUED', version: 1 },
          meta: { requestId: 'REQ-PRINT-0001', timestamp: '2026-07-22T08:00:00Z' },
        });
      },
    });

    const result = await createApiFulfillmentFinanceCommandPort(client).execute({
      domain: 'warehouse',
      operationId: 'createPrintJob',
      entityRef: 'S2505120004',
      idempotencyKey: 'createPrintJob:S2505120004:v7',
      expectedVersion: 7,
      payload: { documentType: 'HANDOVER', copies: 1 },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.zhili.test/v1/documents/print-jobs');
    expect(requests[0]?.headers.get('Idempotency-Key')).toBe('createPrintJob:S2505120004:v7');
    await expect(requests[0]?.json()).resolves.toMatchObject({
      documentType: 'HANDOVER',
      copies: 1,
    });
    expect(result).toEqual({ evidence: { kind: 'trace', requestId: 'REQ-PRINT-0001' } });
  });

  it('returns a server-owned resource id for successful bare-resource responses', async () => {
    const client = createZhiliClient({
      baseUrl: 'https://api.zhili.test/v1',
      fetch: async () =>
        Response.json({
          id: 'TRACE-S2505120004',
          status: 'RECONCILED',
          version: 11,
        }),
    });

    await expect(
      createApiFulfillmentFinanceCommandPort(client).execute({
        domain: 'finance',
        operationId: 'getProfitTrace',
        entityRef: 'S2505120004',
        idempotencyKey: 'getProfitTrace:S2505120004:v11',
        expectedVersion: 11,
      })
    ).resolves.toEqual({
      evidence: { kind: 'resource', resourceId: 'TRACE-S2505120004' },
    });
  });

  it('marks only an explicit audit event identifier as audit evidence', async () => {
    const client = createZhiliClient({
      baseUrl: 'https://api.zhili.test/v1',
      fetch: async () =>
        Response.json({
          data: {
            resourceId: 'CHG-S2505120004',
            auditEventId: 'AUD-EVENT-0098',
            status: 'DRAFT',
            version: 12,
          },
          meta: { requestId: 'REQ-FIN-0098', timestamp: '2026-07-22T08:00:00Z' },
        }),
    });

    await expect(
      createApiFulfillmentFinanceCommandPort(client).execute({
        domain: 'finance',
        operationId: 'unreviewCharge',
        entityRef: 'CHG-S2505120004',
        idempotencyKey: 'unreviewCharge:CHG-S2505120004:v11',
        expectedVersion: 11,
        payload: { reason: '承运商补传尾程费用' },
      })
    ).resolves.toEqual({
      evidence: { kind: 'audit', auditId: 'AUD-EVENT-0098' },
    });
  });

  it('rejects the server problem without fabricating an audit id', async () => {
    const client = createZhiliClient({
      baseUrl: 'https://api.zhili.test/v1',
      fetch: async () =>
        Response.json(
          {
            type: 'https://errors.zhili.test/stale-version',
            title: '资源版本冲突',
            status: 409,
            detail: 'If-Match 7 已过期',
            requestId: 'REQ-STALE-0001',
          },
          { status: 409 }
        ),
    });

    await expect(
      createApiFulfillmentFinanceCommandPort(client).execute({
        domain: 'warehouse',
        operationId: 'createPrintJob',
        entityRef: 'S2505120004',
        idempotencyKey: 'createPrintJob:S2505120004:v7',
        expectedVersion: 7,
        payload: { documentType: 'HANDOVER', copies: 1 },
      })
    ).rejects.toThrow('If-Match 7 已过期');
  });
});
