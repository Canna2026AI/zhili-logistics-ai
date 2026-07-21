import type { paths } from '@zhili/contracts';
import type { ZhiliApiClient } from '@zhili/api-client';

export interface LoadCandidate {
  waybillNo: string;
  destination: string;
  dangerousGoods: boolean;
  held: boolean;
}

export interface CompatibilityIssue {
  waybillNo: string;
  reason: string;
}

export function validateLoadCompatibility(candidates: LoadCandidate[]) {
  const destination = candidates[0]?.destination;
  const issues: CompatibilityIssue[] = [];
  for (const candidate of candidates) {
    if (destination && candidate.destination !== destination) {
      issues.push({
        waybillNo: candidate.waybillNo,
        reason: `目的地 ${candidate.destination} 与装载单主目的地 ${destination} 不一致`,
      });
    }
    if (candidate.dangerousGoods) {
      issues.push({ waybillNo: candidate.waybillNo, reason: '危险品需单独的兼容规则与批准' });
    }
    if (candidate.held) {
      issues.push({ waybillNo: candidate.waybillNo, reason: '运单已扣货，不可加入装载单' });
    }
  }
  return { allowed: issues.length === 0, issues };
}

export const linehaulCapabilities = [
  { id: 'LINE-01', operationId: 'createBooking', path: '/linehaul/bookings' },
  { id: 'LINE-02', operationId: 'createBillOfLading', path: '/linehaul/bills-of-lading' },
  {
    id: 'LINE-03',
    operationId: 'validateLoadCompatibility',
    path: '/linehaul/load-compatibility:validate',
  },
  { id: 'LINE-04', operationId: 'linkFbaShipment', path: '/linehaul/fba-shipment-links' },
  { id: 'LM-01', operationId: 'createLastMileIntake', path: '/last-mile/intakes' },
  {
    id: 'LM-01',
    operationId: 'scanLastMileIntake',
    path: '/last-mile/intakes/{intakeId}:scan',
  },
  { id: 'LM-02', operationId: 'createDeliveryTask', path: '/last-mile/delivery-tasks' },
  {
    id: 'LM-03',
    operationId: 'updateDeliveryTaskStatus',
    path: '/last-mile/delivery-tasks/{deliveryTaskId}:transition',
  },
  {
    id: 'LM-04',
    operationId: 'captureProofOfDelivery',
    path: '/last-mile/delivery-tasks/{deliveryTaskId}/proof-of-delivery',
  },
  {
    id: 'LM-04',
    operationId: 'amendProofOfDelivery',
    path: '/last-mile/delivery-tasks/{deliveryTaskId}/proof-of-delivery:amend',
  },
  { id: 'LM-05', operationId: 'syncLastMilePartner', path: '/last-mile/partners:sync' },
  { id: 'LM-05', operationId: 'replayPartnerEvent', path: '/last-mile/partner-events:replay' },
  { id: 'LM-06', operationId: 'generateLastMileCharges', path: '/last-mile/charges:generate' },
] as const satisfies ReadonlyArray<{ id: string; operationId: string; path: keyof paths }>;

export type CreateBookingBody =
  paths['/linehaul/bookings']['post']['requestBody']['content']['application/json'];

export function createBooking(
  client: ZhiliApiClient,
  body: CreateBookingBody,
  idempotencyKey: string
) {
  return client.POST('/linehaul/bookings', {
    body,
    params: { header: { 'Idempotency-Key': idempotencyKey } },
  });
}
