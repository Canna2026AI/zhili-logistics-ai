// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_TASK_ACTIONS, type DeviceTaskAction } from '../domain/task-actions';
import type { DeviceTask } from '../domain/types';
import { MediaQueue } from '../offline/media-queue';
import { OfflineQueue } from '../offline/offline-queue';
import { IndexedDbQueueStore, MemoryQueueStore, type QueueCodec } from '../offline/queue-store';
import { MemoryPdaPort } from '../ports/memory-pda-port';
import { PdaApiError } from '../ports/pda-port';
import type { LocalDeviceSession } from '../session/session-guard';
import { ScannerScreen } from './scanner-screen';

const codec: QueueCodec = {
  async encode(value: unknown) {
    return {
      iv: [],
      ciphertext: new TextEncoder().encode(JSON.stringify(value)).buffer,
    };
  },
  async decode<T>(value: { ciphertext: ArrayBuffer }) {
    return JSON.parse(new TextDecoder().decode(value.ciphertext)) as T;
  },
};

const session: LocalDeviceSession = {
  deviceId: '01JDEVICE00000000000000003',
  tenantId: '01JTENANT0000000000000001',
  warehouseId: '01JWAREHOUSE00000000000001',
  subjectId: '01JSUBJECT0000000000000001',
  timezone: 'Asia/Shanghai',
  appVersion: '0.2.0',
  expiresAt: '2099-12-31T23:59:59.000Z',
  permissions: [
    'pda.use',
    'pda.sync',
    'pda.conflict.resolve',
    'lastmile.delivery.execute',
    'lastmile.pod.write',
  ],
};

function taskForAction(action: DeviceTaskAction): DeviceTask {
  const definition = DEVICE_TASK_ACTIONS.find((candidate) => candidate.id === action)!;
  return {
    id: `01JPDATASK${String(DEVICE_TASK_ACTIONS.findIndex((candidate) => candidate.id === action) + 1).padStart(16, '0')}`,
    type: definition.allowedTaskTypes[0],
    reference: `REF-${action}`,
    status: definition.allowedStatuses[0],
    priority: 'HIGH',
    version: 7,
  };
}

describe('ScannerScreen action safety', () => {
  afterEach(cleanup);

  it.each(DEVICE_TASK_ACTIONS.map((definition) => definition.id))(
    'does not write IndexedDB when %s is missing required business values',
    async (action) => {
      const databaseName = `pda-action-safety-${action}-${crypto.randomUUID()}`;
      const store = new IndexedDbQueueStore(databaseName, codec);
      const queue = new OfflineQueue(store);
      const media = new MediaQueue(store);
      await Promise.all([queue.restore(), media.restore()]);
      const selectedTask = taskForAction(action);
      render(
        <ScannerScreen
          session={session}
          queue={queue}
          media={media}
          port={new MemoryPdaPort()}
          online={false}
          tasks={[selectedTask]}
          selectedTask={selectedTask}
          initialCode={selectedTask.reference}
          assertBusinessAllowed={() => undefined}
          onChanged={() => undefined}
          onTaskUpdated={async () => undefined}
          onTasksRefreshed={async () => undefined}
          onUnauthorized={async () => undefined}
        />
      );

      fireEvent.change(screen.getByLabelText('作业动作'), { target: { value: action } });
      if (action === 'WAREHOUSE_RECEIVE' || action === 'LAST_MILE_DELIVER')
        await userEvent.clear(screen.getByLabelText('扫描码 / 运单号'));
      const submit = screen.getByRole('button', { name: '确认作业' });
      if (!submit.hasAttribute('disabled')) await userEvent.click(submit);

      await waitFor(async () => {
        const records = await store.inspectEncryptedRecordsForTest();
        expect(records.events).toHaveLength(0);
        expect(records.media).toHaveLength(0);
      });
      store.close();
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  );

  it('submits PALLETIZED with the exact device event and clears only its authoritative receipt', async () => {
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await Promise.all([queue.restore(), media.restore()]);
    const selectedTask: DeviceTask = {
      id: '01JPDATASK0000000000000002',
      type: 'LAST_MILE_DELIVERY',
      reference: 'LM-PALLET',
      status: 'PLANNED',
      priority: 'HIGH',
      version: 7,
    };
    const port = new MemoryPdaPort();
    const transition = vi.spyOn(port, 'updateDeliveryTaskStatus');
    const onTaskUpdated = vi.fn();
    render(
      <ScannerScreen
        session={session}
        queue={queue}
        media={media}
        port={port}
        online
        tasks={[selectedTask]}
        selectedTask={selectedTask}
        initialCode={selectedTask.reference}
        assertBusinessAllowed={() => undefined}
        onChanged={() => undefined}
        onTaskUpdated={onTaskUpdated}
        onTasksRefreshed={async () => undefined}
        onUnauthorized={async () => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText('作业动作'), {
      target: { value: 'LAST_MILE_PALLETIZE' },
    });
    await userEvent.type(screen.getByLabelText('托盘码'), 'PALLET-9');
    await userEvent.click(screen.getByRole('button', { name: '确认作业' }));

    await screen.findByText(/服务端已确认 尾程打托/);
    const body = transition.mock.calls[0]![3];
    expect(body).toMatchObject({
      deviceEventId: expect.stringMatching(/^01J/),
      targetStatus: 'PALLETIZED',
      mediaRefs: [],
      scanEvidence: { scannedCode: 'LM-PALLET', palletId: 'PALLET-9' },
    });
    expect(onTaskUpdated).toHaveBeenCalledWith(selectedTask.id, 'PALLETIZED', 8);
    expect(queue.snapshot().events).toEqual([]);
  });

  it('uses the POD authoritative version and atomically deletes the claimed evidence', async () => {
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await Promise.all([queue.restore(), media.restore()]);
    const selectedTask: DeviceTask = {
      id: '01JPDATASK0000000000000002',
      type: 'LAST_MILE_DELIVERY',
      reference: 'LM-POD',
      status: 'OUT_FOR_DELIVERY',
      priority: 'HIGH',
      version: 8,
    };
    const port = new MemoryPdaPort();
    const capture = vi
      .spyOn(port, 'captureProofOfDelivery')
      .mockImplementation(async (deliveryTaskId, _etag, _key, body) => ({
        deviceEventId: body.deviceEventId,
        disposition: 'APPLIED',
        deliveryTask: {
          id: deliveryTaskId,
          taskNo: 'LM-POD',
          status: 'COMPLETED',
          waybillCount: 1,
          version: 63,
        },
        proofOfDelivery: {
          id: '01JPOD0000000000000000001',
          deliveryTaskId,
          versionNo: 4,
          recipientName: body.recipientName,
          signedAt: body.signedAt,
          evidenceRefs: body.evidenceRefs,
        },
        claimedMediaRefs: body.evidenceRefs,
      }));
    const onTaskUpdated = vi.fn();
    render(
      <ScannerScreen
        session={session}
        queue={queue}
        media={media}
        port={port}
        online
        tasks={[selectedTask]}
        selectedTask={selectedTask}
        initialCode={selectedTask.reference}
        assertBusinessAllowed={() => undefined}
        onChanged={() => undefined}
        onTaskUpdated={onTaskUpdated}
        onTasksRefreshed={async () => undefined}
        onUnauthorized={async () => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText('作业动作'), { target: { value: 'CAPTURE_POD' } });
    await userEvent.type(screen.getByLabelText('签收姓名'), '陈女士');
    fireEvent.change(screen.getByLabelText('签收时间'), {
      target: { value: '2026-07-22T10:00' },
    });
    await userEvent.upload(
      screen.getByLabelText('拍照或选择图片'),
      new File(['pod-photo'], 'pod.jpg', { type: 'image/jpeg' })
    );
    await userEvent.click(screen.getByRole('button', { name: '确认作业' }));

    await screen.findByText(/POD 已由服务端创建不可变版本/);
    expect(capture.mock.calls[0]![3]).toMatchObject({
      deviceEventId: expect.stringMatching(/^01J/),
      recipientName: '陈女士',
      evidenceRefs: [expect.stringMatching(/^media-/)],
    });
    expect(onTaskUpdated).toHaveBeenCalledWith(selectedTask.id, 'COMPLETED', 63);
    expect(queue.snapshot().events).toEqual([]);
    expect(media.snapshot()).toEqual([]);
    expect(await store.getMedia()).toEqual([]);
  });

  it('refreshes tasks and preserves the complete error envelope when POD returns 409', async () => {
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await Promise.all([queue.restore(), media.restore()]);
    const selectedTask: DeviceTask = {
      id: '01JPDATASK0000000000000002',
      type: 'LAST_MILE_DELIVERY',
      reference: 'LM-POD-409',
      status: 'OUT_FOR_DELIVERY',
      priority: 'HIGH',
      version: 8,
    };
    const refreshed = [{ ...selectedTask, status: 'COMPLETED', version: 9 }];
    const port = new MemoryPdaPort();
    port.captureProofOfDelivery = vi
      .fn()
      .mockRejectedValue(
        new PdaApiError(
          'POD 版本冲突',
          409,
          'STALE_VERSION',
          'req-pod-409',
          '刷新任务后复核签收状态',
          [{ field: 'If-Match', reason: 'expected version 9' }]
        )
      );
    port.getDeviceTasks = vi.fn().mockResolvedValue(refreshed);
    const onTaskUpdated = vi.fn();
    const onTasksRefreshed = vi.fn().mockResolvedValue(undefined);
    render(
      <ScannerScreen
        session={session}
        queue={queue}
        media={media}
        port={port}
        online
        tasks={[selectedTask]}
        selectedTask={selectedTask}
        initialCode={selectedTask.reference}
        assertBusinessAllowed={() => undefined}
        onChanged={() => undefined}
        onTaskUpdated={onTaskUpdated}
        onTasksRefreshed={onTasksRefreshed}
        onUnauthorized={async () => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText('作业动作'), { target: { value: 'CAPTURE_POD' } });
    await userEvent.type(screen.getByLabelText('签收姓名'), '陈女士');
    fireEvent.change(screen.getByLabelText('签收时间'), {
      target: { value: '2026-07-22T10:00' },
    });
    await userEvent.upload(
      screen.getByLabelText('拍照或选择图片'),
      new File(['pod-photo'], 'pod.jpg', { type: 'image/jpeg' })
    );
    await userEvent.click(screen.getByRole('button', { name: '确认作业' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('已刷新服务器任务快照');
    expect(alert).toHaveTextContent('刷新任务后复核签收状态');
    expect(alert).toHaveTextContent('expected version 9');
    expect(alert).toHaveTextContent('req-pod-409');
    expect(onTasksRefreshed).toHaveBeenCalledWith(refreshed);
    expect(onTaskUpdated).not.toHaveBeenCalled();
    expect(queue.snapshot().events).toHaveLength(1);
    expect(media.snapshot()).toHaveLength(1);
  });
});
