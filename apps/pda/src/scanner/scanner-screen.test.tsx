// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DEVICE_TASK_ACTIONS, type DeviceTaskAction } from '../domain/task-actions';
import type { DeviceTask } from '../domain/types';
import { MediaQueue } from '../offline/media-queue';
import { OfflineQueue } from '../offline/offline-queue';
import { IndexedDbQueueStore, type QueueCodec } from '../offline/queue-store';
import { MemoryPdaPort } from '../ports/memory-pda-port';
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
          onTaskUpdated={() => undefined}
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
});
