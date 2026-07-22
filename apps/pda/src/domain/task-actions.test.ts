import { describe, expect, it } from 'vitest';
import { DEVICE_TASK_ACTIONS, buildTaskPayload } from './task-actions';

describe('PDA task actions', () => {
  it('exposes every required warehouse and last-mile device action as a real queueable command', () => {
    expect(DEVICE_TASK_ACTIONS.map((action) => action.id)).toEqual(
      expect.arrayContaining([
        'WAREHOUSE_RECEIVE',
        'REWEIGH',
        'MEASURE_DIMENSIONS',
        'CAPTURE_RECEIPT_PHOTO',
        'PUTAWAY',
        'INVENTORY_MOVE',
        'SORT',
        'PICK',
        'BAG',
        'PALLETIZE',
        'CONTAINERIZE',
        'DISPATCH',
        'STOCKTAKE',
        'LAST_MILE_INTAKE',
        'LAST_MILE_PALLETIZE',
        'LAST_MILE_LOAD',
        'LAST_MILE_DELIVER',
        'LAST_MILE_EXCEPTION',
        'CAPTURE_POD',
      ])
    );
  });

  it('builds measured and POD payloads with evidence rather than static success text', () => {
    expect(
      buildTaskPayload('MEASURE_DIMENSIONS', { length: '60', width: '40', height: '35' })
    ).toEqual({ lengthCm: '60', widthCm: '40', heightCm: '35' });
    expect(
      buildTaskPayload('CAPTURE_POD', {
        recipientName: '陈女士',
        signedAt: '2026-07-22T10:00',
        latitude: '22.5431',
        longitude: '114.0579',
        signature: 'data:image/png;base64,abc',
        mediaId: 'media-pod',
      })
    ).toMatchObject({
      recipientName: '陈女士',
      evidenceRefs: ['media-pod'],
      signature: expect.stringContaining('data:image/png'),
    });
  });

  it.each([
    ['SORT', 'destinationChuteCode'],
    ['PICK', 'sourceLocationCode'],
    ['BAG', 'bagCode'],
    ['PALLETIZE', 'palletCode'],
    ['CONTAINERIZE', 'containerCode'],
    ['DISPATCH', 'dispatchCode'],
    ['LAST_MILE_INTAKE', 'stationCode'],
    ['LAST_MILE_LOAD', 'vehicleCode'],
    ['LAST_MILE_DELIVER', 'checkpoint'],
  ] as const)('builds an action-specific %s payload', (action, field) => {
    const payload = buildTaskPayload(action, {
      scannedCode: 'SCAN-001',
      operationCode: 'OP-001',
    });
    expect(payload).toMatchObject({ [field]: expect.any(String) });
    expect(payload).not.toEqual({ scannedCode: 'SCAN-001' });
  });
});
