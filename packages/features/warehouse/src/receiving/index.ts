import type { paths } from '@zhili/contracts';
import type { ZhiliApiClient } from '@zhili/api-client';

export interface MeasurementInput {
  expectedWeightKg: number;
  actualWeightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  volumeDivisor: number;
}

export interface DerivedMeasurement {
  discrepancyKg: number;
  discrepancyPercent: number;
  volumeM3: number;
  volumetricWeightKg: number;
  chargeableWeightKg: number;
}

const round = (value: number, precision: number) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function deriveMeasurement(input: MeasurementInput): DerivedMeasurement {
  if (input.expectedWeightKg <= 0 || input.volumeDivisor <= 0) {
    throw new Error('预报重量与材积系数必须大于 0');
  }
  const discrepancyKg = input.actualWeightKg - input.expectedWeightKg;
  const volumetricWeightKg =
    (input.lengthCm * input.widthCm * input.heightCm) / input.volumeDivisor;
  return {
    discrepancyKg: round(discrepancyKg, 2),
    discrepancyPercent: round((discrepancyKg / input.expectedWeightKg) * 100, 2),
    volumeM3: round((input.lengthCm * input.widthCm * input.heightCm) / 1_000_000, 3),
    volumetricWeightKg: round(volumetricWeightKg, 2),
    chargeableWeightKg: round(Math.max(input.actualWeightKg, volumetricWeightKg), 2),
  };
}

export const warehouseCapabilities = [
  { id: 'WH-01', operationId: 'receiveScan', path: '/warehouse/scans:receive' },
  {
    id: 'WH-02',
    operationId: 'recordMeasurement',
    path: '/warehouse/receipts/{receiptId}/measurements',
  },
  {
    id: 'WH-02',
    operationId: 'attachReceiptMedia',
    path: '/warehouse/receipts/{receiptId}/media',
  },
  {
    id: 'WH-03',
    operationId: 'confirmReceipt',
    path: '/warehouse/receipts/{receiptId}:confirm',
  },
  {
    id: 'WH-03',
    operationId: 'undoReceipt',
    path: '/warehouse/receipts/{receiptId}:undo',
  },
  { id: 'WH-04', operationId: 'moveInventory', path: '/warehouse/inventory:move' },
  { id: 'WH-04', operationId: 'commitStocktake', path: '/warehouse/stocktakes:commit' },
  { id: 'WH-05', operationId: 'routeWaybill', path: '/warehouse/waybills/{waybillId}:route' },
  { id: 'WH-06', operationId: 'createLoadUnit', path: '/linehaul/load-units' },
  {
    id: 'WH-06',
    operationId: 'attachWaybills',
    path: '/linehaul/load-units/{loadUnitId}:attach-waybills',
  },
  {
    id: 'WH-06',
    operationId: 'sealLoadUnit',
    path: '/linehaul/load-units/{loadUnitId}:seal',
  },
  {
    id: 'WH-07',
    operationId: 'dispatchLoadUnit',
    path: '/linehaul/load-units/{loadUnitId}:dispatch',
  },
] as const satisfies ReadonlyArray<{ id: string; operationId: string; path: keyof paths }>;

export type ReceiveScanBody =
  paths['/warehouse/scans:receive']['post']['requestBody']['content']['application/json'];

export function receiveScan(client: ZhiliApiClient, body: ReceiveScanBody, idempotencyKey: string) {
  return client.POST('/warehouse/scans:receive', {
    body,
    params: { header: { 'Idempotency-Key': idempotencyKey } },
  });
}
