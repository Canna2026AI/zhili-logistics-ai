import { describe, expect, it } from 'vitest';
import { createZhiliClient } from '@zhili/api-client';
import { validateInventoryMove } from '../../inventory';
import { canDispatch } from '../../loading-dispatch';
import { deriveMeasurement, receiveScan, warehouseCapabilities } from '../index';

describe('warehouse receiving', () => {
  it('derives discrepancy, volume and chargeable weight from the canonical receipt', () => {
    expect(
      deriveMeasurement({
        expectedWeightKg: 122,
        actualWeightKg: 123.5,
        lengthCm: 100,
        widthCm: 80,
        heightCm: 60,
        volumeDivisor: 6000,
      })
    ).toEqual({
      discrepancyKg: 1.5,
      discrepancyPercent: 1.23,
      volumeM3: 0.48,
      volumetricWeightKg: 80,
      chargeableWeightKg: 123.5,
    });
  });

  it('publishes every warehouse command required by F1B', () => {
    expect(warehouseCapabilities.map((item) => item.operationId)).toEqual([
      'receiveScan',
      'recordMeasurement',
      'attachReceiptMedia',
      'confirmReceipt',
      'undoReceipt',
      'moveInventory',
      'commitStocktake',
      'routeWaybill',
      'createLoadUnit',
      'attachWaybills',
      'sealLoadUnit',
      'dispatchLoadUnit',
      'createPrintJob',
      'reprintDocument',
    ]);
  });

  it('blocks same-location moves and incomplete dispatch preflight', () => {
    expect(() =>
      validateInventoryMove({
        waybillNo: 'S2505120004',
        fromLocation: 'A-01-15',
        toLocation: 'A-01-15',
        quantity: 1,
        expectedVersion: 7,
      })
    ).toThrow('目标库位不能与原库位相同');
    expect(
      canDispatch({
        waybillCount: 42,
        totalWeightKg: 5187.2,
        unresolvedIssueCount: 1,
        missingChargeCount: 2,
        printState: 'PENDING',
      })
    ).toEqual({
      allowed: false,
      blockers: ['1 个问题件未关闭', '2 票费用不完整', '交接文档未打印完成'],
    });
  });

  it('sends the scan idempotency key and canonical evidence through OpenAPI fetch', async () => {
    let captured: Request | undefined;
    const client = createZhiliClient({
      baseUrl: 'https://api.zhili.test/v1',
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return new Response(
          JSON.stringify({
            data: {
              disposition: 'APPLIED',
              receipt: {
                id: '01JYRECEIPT00000000000000',
                waybillId: '01JYWAYBILL0000000000000',
                status: 'SCANNED',
                actualWeightKg: '123.50',
                discrepancies: [],
                version: 7,
              },
            },
            meta: { requestId: 'REQ-WH-1' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    });

    await receiveScan(
      client,
      {
        eventId: '01JY8Z8F6ME4F0Y9QH2X6D4R7A',
        deviceId: '01JYPDASZX030000000000000',
        warehouseId: '01JYWHSZX010000000000000',
        waybillNo: 'S2505120004',
        actualWeightKg: '123.50',
        occurredAt: '2026-07-22T09:15:32+08:00',
        timezone: 'Asia/Shanghai',
      },
      'receive:S2505120004:123.50:20260722T091532+0800'
    );

    expect(captured?.headers.get('Idempotency-Key')).toBe(
      'receive:S2505120004:123.50:20260722T091532+0800'
    );
    await expect(captured?.json()).resolves.toMatchObject({ actualWeightKg: '123.50' });
  });
});
