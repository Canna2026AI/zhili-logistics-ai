import { http, HttpResponse, type HttpHandler } from 'msw';
import type { components } from '@zhili/contracts';

export type MockScenario = 'normal' | 'empty' | 'failed' | 'forbidden' | 'stale' | 'partial';

type AllowedAction = components['schemas']['AllowedAction'];
type ErrorCode = components['schemas']['ErrorCode'];
type ErrorDetail = components['schemas']['ErrorDetail'];
type ErrorEnvelope = components['schemas']['ErrorEnvelope'];
type Waybill = components['schemas']['Waybill'];
type WaybillResponse = components['schemas']['WaybillResponse'];

const canonicalWaybill = {
  id: '01J00000000000000000000000',
  waybillNo: 'S2505120004',
  masterNo: 'MAWB-20260722-01',
  customerName: '智立华南客户',
  customerCode: 'CUST-SOUTH-001',
  contactName: '张伟',
  contactPhone: '138****2468',
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
  allowedActions: [
    { action: 'warehouse.route', enabled: true },
    { action: 'waybill.cancel', enabled: false, disabledReason: '已完成收货' },
  ],
  version: 7,
} satisfies Waybill;

const meta = {
  requestId: 'req-mock-zhili',
  timestamp: '2026-07-22T00:00:00.000Z',
};

const error = (code: ErrorCode, message: string, status: number, details: ErrorDetail[] = []) => {
  const body = {
    code,
    message,
    requestId: meta.requestId,
    details,
    remediation: '保留当前输入，按提示修复后重试。',
  } satisfies ErrorEnvelope;

  return HttpResponse.json(body, { status });
};

export function createScenarioHandlers(scenario: MockScenario = 'normal'): HttpHandler[] {
  return [
    http.get('*/api/v1/waybills/:waybillId', () => {
      switch (scenario) {
        case 'normal':
          return HttpResponse.json({ data: canonicalWaybill, meta } satisfies WaybillResponse, {
            headers: { ETag: '"7"' },
          });
        case 'empty':
          return error('NOT_FOUND', '未找到匹配运单', 404, [
            { field: 'waybillId', reason: '资源不存在或不在当前数据权限范围内' },
          ]);
        case 'failed':
          return error('INTERNAL_ERROR', '读取运单失败', 500, [
            { reason: '服务暂时不可用，请稍后重试' },
          ]);
        case 'forbidden':
          return error('PERMISSION_DENIED', '缺少 waybill.read 权限', 403, [
            { field: 'permission', reason: 'waybill.read' },
          ]);
        case 'stale':
          return error('STALE_VERSION', '数据已被其他终端更新', 412, [
            { field: 'version', reason: '本地版本 6，服务端版本 7', rejectedValue: 6 },
          ]);
        case 'partial':
          return HttpResponse.json(
            {
              data: {
                ...canonicalWaybill,
                allowedActions: [
                  {
                    action: 'warehouse.route',
                    enabled: false,
                    disabledReason: '关联报价暂不可用，请刷新后重试',
                  } satisfies AllowedAction,
                ],
              },
              meta,
            } satisfies WaybillResponse,
            { status: 200 }
          );
      }
    }),
  ];
}

export const defaultHandlers = createScenarioHandlers('normal');
export { canonicalWaybill };
