import { describe, expect, it } from 'vitest';
import type { DeviceTask } from './types';
import {
  DEVICE_TASK_ACTIONS,
  TaskActionValidationError,
  assertTaskActionAllowed,
  buildTaskPayload,
  resolveTaskForAction,
  type DeviceTaskAction,
} from './task-actions';

const task = (overrides: Partial<DeviceTask> = {}): DeviceTask => ({
  id: '01JPDATASK0000000000000001',
  type: 'RECEIVE',
  reference: 'S2505120004',
  status: 'READY',
  priority: 'HIGH',
  version: 7,
  ...overrides,
});

describe('PDA task action schemas', () => {
  it('defines permission, compatible task types, statuses and required fields for every action', () => {
    expect(DEVICE_TASK_ACTIONS).toHaveLength(19);
    for (const action of DEVICE_TASK_ACTIONS) {
      expect(action.requiredPermission).toMatch(/^(pda\.use|lastmile\.)/);
      expect(action.allowedTaskTypes.length).toBeGreaterThan(0);
      expect(action.allowedStatuses.length).toBeGreaterThan(0);
      expect(action.requiredFields).toBeInstanceOf(Array);
    }
  });

  it.each([
    ['WAREHOUSE_RECEIVE', { scannedCode: 'S-1' }, { scannedCode: 'S-1' }],
    ['REWEIGH', { scannedCode: 'S-1', weight: '12.75' }, { actualWeightKg: 12.75 }],
    [
      'MEASURE_DIMENSIONS',
      { scannedCode: 'S-1', length: '60', width: '40', height: '35' },
      { lengthCm: 60, widthCm: 40, heightCm: 35 },
    ],
    ['CAPTURE_RECEIPT_PHOTO', { scannedCode: 'S-1' }, { scannedCode: 'S-1' }],
    ['PUTAWAY', { scannedCode: 'S-1', location: 'A-09-02' }, { locationCode: 'A-09-02' }],
    ['INVENTORY_MOVE', { scannedCode: 'S-1', location: 'B-02-08' }, { locationCode: 'B-02-08' }],
    [
      'SORT',
      { scannedCode: 'P-1', operationCode: 'CHUTE-08' },
      { parcelCode: 'P-1', destinationChuteCode: 'CHUTE-08' },
    ],
    [
      'PICK',
      { scannedCode: 'P-1', operationCode: 'A-01-09', quantity: '3' },
      { parcelCode: 'P-1', sourceLocationCode: 'A-01-09', quantity: 3 },
    ],
    [
      'BAG',
      { scannedCode: 'P-1', operationCode: 'BAG-901' },
      { parcelCode: 'P-1', bagCode: 'BAG-901' },
    ],
    [
      'PALLETIZE',
      { scannedCode: 'LU-1', operationCode: 'PALLET-77' },
      { loadUnitCode: 'LU-1', palletCode: 'PALLET-77' },
    ],
    [
      'CONTAINERIZE',
      { scannedCode: 'LU-1', operationCode: 'CONTAINER-22' },
      { loadUnitCode: 'LU-1', containerCode: 'CONTAINER-22' },
    ],
    [
      'DISPATCH',
      { scannedCode: 'LU-1', operationCode: 'DISPATCH-66' },
      { loadUnitCode: 'LU-1', dispatchCode: 'DISPATCH-66' },
    ],
    ['STOCKTAKE', { scannedCode: 'SKU-1', count: '0' }, { countedQuantity: 0 }],
    [
      'LAST_MILE_INTAKE',
      { scannedCode: 'LM-1', operationCode: 'STATION-6' },
      { waybillCode: 'LM-1', stationCode: 'STATION-6' },
    ],
    [
      'LAST_MILE_LOAD',
      { scannedCode: 'LM-1', operationCode: 'VEHICLE-8' },
      { deliveryTaskCode: 'LM-1', vehicleCode: 'VEHICLE-8' },
    ],
    [
      'LAST_MILE_DELIVER',
      { scannedCode: 'LM-1' },
      { deliveryTaskCode: 'LM-1', checkpoint: 'OUT_FOR_DELIVERY' },
    ],
    [
      'LAST_MILE_EXCEPTION',
      { scannedCode: 'LM-1', exceptionCode: 'DAMAGED', note: '外包装明显破损' },
      { exceptionCode: 'DAMAGED', note: '外包装明显破损' },
    ],
    [
      'CAPTURE_POD',
      {
        scannedCode: 'LM-1',
        recipientName: '陈女士',
        signedAt: '2026-07-22T10:00',
        latitude: '22.5431',
        longitude: '114.0579',
        signature: '签名痕迹',
      },
      {
        recipientName: '陈女士',
        signedAt: '2026-07-22T10:00',
        latitude: 22.5431,
        longitude: 114.0579,
        signature: '签名痕迹',
      },
    ],
  ] as Array<[DeviceTaskAction, Record<string, string>, Record<string, string | number>]>)(
    'builds validated %s payload without placeholder values',
    (action, values, expected) => {
      expect(buildTaskPayload(action, values)).toEqual(expected);
    }
  );

  it.each([
    ['WAREHOUSE_RECEIVE', {}],
    ['REWEIGH', { scannedCode: 'S-1', weight: '' }],
    ['MEASURE_DIMENSIONS', { scannedCode: 'S-1', length: '60', width: '', height: '35' }],
    ['CAPTURE_RECEIPT_PHOTO', { scannedCode: '' }],
    ['PUTAWAY', { scannedCode: 'S-1', location: '' }],
    ['INVENTORY_MOVE', { scannedCode: 'S-1', location: '   ' }],
    ['SORT', { scannedCode: 'P-1', operationCode: '' }],
    ['PICK', { scannedCode: 'P-1', operationCode: 'A-1', quantity: '' }],
    ['BAG', { scannedCode: 'P-1', operationCode: '' }],
    ['PALLETIZE', { scannedCode: 'LU-1', operationCode: '' }],
    ['CONTAINERIZE', { scannedCode: 'LU-1', operationCode: '' }],
    ['DISPATCH', { scannedCode: 'LU-1', operationCode: '' }],
    ['STOCKTAKE', { scannedCode: 'SKU-1', count: '' }],
    ['LAST_MILE_INTAKE', { scannedCode: 'LM-1', operationCode: '' }],
    ['LAST_MILE_LOAD', { scannedCode: 'LM-1', operationCode: '' }],
    ['LAST_MILE_DELIVER', { scannedCode: '' }],
    ['LAST_MILE_EXCEPTION', { scannedCode: 'LM-1', exceptionCode: '', note: '' }],
    ['CAPTURE_POD', { scannedCode: 'LM-1', recipientName: '', signedAt: '' }],
  ] as Array<[DeviceTaskAction, Record<string, string>]>)(
    'rejects empty required business values for %s',
    (action, values) => {
      expect(() => buildTaskPayload(action, values)).toThrow(TaskActionValidationError);
    }
  );

  it('keeps LAST_MILE_PALLETIZE fail closed until the contract is extended', () => {
    expect(() =>
      buildTaskPayload('LAST_MILE_PALLETIZE', {
        scannedCode: 'LM-1',
        operationCode: 'PALLET-9',
      })
    ).toThrow(/契约待扩展/);
  });

  it('rejects zero pick quantity and malformed POD time instead of normalizing placeholders', () => {
    expect(() =>
      buildTaskPayload('PICK', {
        scannedCode: 'P-1',
        operationCode: 'A-1',
        quantity: '0',
      })
    ).toThrow(/大于 0/);
    expect(() =>
      buildTaskPayload('CAPTURE_POD', {
        scannedCode: 'LM-1',
        recipientName: '陈女士',
        signedAt: 'not-a-date',
      })
    ).toThrow(/签收时间/);
  });

  it('enforces task type, status and permission at the domain boundary', () => {
    expect(() =>
      assertTaskActionAllowed('LAST_MILE_DELIVER', task(), ['lastmile.delivery.execute'])
    ).toThrow(/任务类型/);
    expect(() =>
      assertTaskActionAllowed(
        'LAST_MILE_DELIVER',
        task({ type: 'LAST_MILE_DELIVERY', status: 'PLANNED' }),
        ['lastmile.delivery.execute']
      )
    ).toThrow(/任务状态/);
    expect(() =>
      assertTaskActionAllowed(
        'LAST_MILE_DELIVER',
        task({ type: 'LAST_MILE_DELIVERY', status: 'LOADED' }),
        []
      )
    ).toThrow(/lastmile\.delivery\.execute/);
  });

  it('resolves a clicked task only when the full selected snapshot still matches', () => {
    const selected = task({
      id: '01JPDATASK0000000000000002',
      type: 'LAST_MILE_DELIVERY',
      reference: 'LM-SECOND',
      status: 'LOADED',
      version: 9,
    });
    const tasks = [
      task({
        id: '01JPDATASK0000000000000001',
        type: 'LAST_MILE_DELIVERY',
        reference: 'LM-FIRST',
        status: 'LOADED',
        version: 4,
      }),
      selected,
    ];

    expect(resolveTaskForAction(tasks, 'LAST_MILE_DELIVER', 'LM-SECOND', selected)).toEqual(
      selected
    );
    expect(() => resolveTaskForAction(tasks, 'LAST_MILE_DELIVER', 'LM-FIRST', selected)).toThrow(
      /选中任务/
    );
    expect(() =>
      resolveTaskForAction(
        tasks.map((candidate) =>
          candidate.id === selected.id ? { ...candidate, version: 10 } : candidate
        ),
        'LAST_MILE_DELIVER',
        'LM-SECOND',
        selected
      )
    ).toThrow(/已变化/);
  });

  it('fails closed when a manual reference has zero or multiple compatible scoped tasks', () => {
    const duplicate = task({ id: '01JPDATASK0000000000000009' });
    expect(() => resolveTaskForAction([task()], 'WAREHOUSE_RECEIVE', 'MISSING')).toThrow(
      /没有唯一匹配/
    );
    expect(() =>
      resolveTaskForAction([task(), duplicate], 'WAREHOUSE_RECEIVE', 'S2505120004')
    ).toThrow(/没有唯一匹配/);
  });
});
