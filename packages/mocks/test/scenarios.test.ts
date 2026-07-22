import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import type { components } from '@zhili/contracts';
import { createScenarioHandlers, type MockScenario } from '../src';

type ErrorEnvelope = components['schemas']['ErrorEnvelope'];
type WaybillResponse = components['schemas']['WaybillResponse'];

const cases: Array<[MockScenario, number, string]> = [
  ['normal', 200, 'S2505120004'],
  ['empty', 404, 'NOT_FOUND'],
  ['failed', 500, 'INTERNAL_ERROR'],
  ['forbidden', 403, 'PERMISSION_DENIED'],
  ['stale', 412, 'STALE_VERSION'],
  ['partial', 200, '关联报价暂不可用'],
];

const errorCodes = new Set<components['schemas']['ErrorCode']>([
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'PERMISSION_DENIED',
  'STALE_VERSION',
]);

function expectErrorEnvelope(body: unknown): asserts body is ErrorEnvelope {
  expect(body).toEqual({
    code: expect.any(String),
    message: expect.any(String),
    details: expect.any(Array),
    remediation: expect.any(String),
    requestId: expect.any(String),
  });

  const errorBody = body as ErrorEnvelope;
  expect(errorCodes.has(errorBody.code)).toBe(true);
  for (const detail of errorBody.details) {
    expect(detail.reason).toEqual(expect.any(String));
  }
}

function expectWaybillResponse(body: unknown): asserts body is WaybillResponse {
  expect(body).toEqual({
    data: {
      id: expect.any(String),
      waybillNo: 'S2505120004',
      masterNo: 'MAWB-20260722-01',
      customerName: {
        access: 'READ',
        rawValue: '智立华南客户',
        displayValue: '智立华南客户',
        copyAllowed: true,
        exportAllowed: true,
      },
      customerCode: {
        access: 'READ',
        rawValue: 'CUST-SOUTH-001',
        displayValue: 'CUST-SOUTH-001',
        copyAllowed: true,
        exportAllowed: true,
      },
      contactName: {
        access: 'READ',
        rawValue: '张伟',
        displayValue: '张伟',
        copyAllowed: true,
        exportAllowed: true,
      },
      senderPhone: {
        access: 'MASK',
        displayValue: '0755****6600',
        copyAllowed: false,
        exportAllowed: false,
      },
      recipientPhone: {
        access: 'MASK',
        displayValue: '138****2468',
        copyAllowed: false,
        exportAllowed: false,
      },
      consigneeAddress: { access: 'DENY', copyAllowed: false, exportAllowed: false },
      route: 'SZX-LAX',
      service: '智立空运专线',
      transport: 'AIR',
      forecastWeightKg: '18.50',
      actualWeightKg: '18.80',
      volumeM3: '0.126',
      pieces: 3,
      createdAt: '2026-07-22T02:10:00.000Z',
      state: 'RECEIVED',
      branch: '深圳分公司',
      timeline: ['10:10 创建运单', '11:20 完成收货'],
      allowedActions: expect.any(Array),
      version: 7,
    },
    meta: expect.any(Object),
  });

  const waybillBody = body as WaybillResponse;
  for (const action of waybillBody.data.allowedActions) {
    expect(action).toEqual({
      action: expect.any(String),
      enabled: expect.any(Boolean),
      ...(action.disabledReason === undefined ? {} : { disabledReason: expect.any(String) }),
    });
  }
}

describe('contract mock scenarios', () => {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  it.each(cases)('%s returns an explicit recoverable state', async (scenario, status, evidence) => {
    server.use(...createScenarioHandlers(scenario));
    const response = await fetch('http://localhost/api/v1/waybills/01J00000000000000000000000');
    expect(response.status).toBe(status);
    const body: unknown = await response.json();
    expect(JSON.stringify(body)).toContain(evidence);

    if (response.ok) {
      expectWaybillResponse(body);
    } else {
      expectErrorEnvelope(body);
    }
  });
});
