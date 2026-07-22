import { describe, expect, it } from 'vitest';
import { MemoryQueueStore } from '../offline/queue-store';
import { OfflineQueue } from '../offline/offline-queue';
import { SessionGuard, SessionExpiredError, UnsafeBindingChangeError } from './session-guard';
import type { LocalDeviceSession } from './session-guard';

const session = {
  deviceId: '01JDEVICE00000000000000003',
  tenantId: '01JTENANT0000000000000001',
  warehouseId: '01JWAREHOUSE00000000000001',
  subjectId: '01JSUBJECT0000000000000001',
  timezone: 'Asia/Shanghai',
  appVersion: '0.2.0',
  expiresAt: '2026-07-22T12:00:00.000Z',
  permissions: [
    'pda.use',
    'pda.sync',
    'pda.conflict.resolve',
    'lastmile.delivery.execute',
    'lastmile.pod.write',
  ],
} satisfies LocalDeviceSession;

describe('SessionGuard', () => {
  it('retains local data but blocks protected commands after expiry', async () => {
    const queue = new OfflineQueue(new MemoryQueueStore());
    await queue.restore();
    await queue.enqueue(session, {
      action: 'PICK',
      entityRef: 'S1',
      payload: {},
      mediaRefs: [],
      baseVersion: 1,
    });
    const guard = new SessionGuard(queue, () => new Date('2026-07-22T12:01:00.000Z'));
    guard.setSession(session);

    expect(() => guard.assertActive()).toThrow(SessionExpiredError);
    expect(queue.snapshot().events).toHaveLength(1);
    expect(() => guard.assertAllowed('EXPORT')).not.toThrow();
    expect(() => guard.assertAllowed('SYNC')).toThrow(SessionExpiredError);
    expect(() => guard.assertAllowed('REAUTHENTICATE')).not.toThrow();
    expect(() => guard.assertAllowed('NEW_BUSINESS_EVENT')).toThrow(SessionExpiredError);
  });

  it('blocks binding changes and keeps export fail closed while unsynced data exists', async () => {
    const queue = new OfflineQueue(new MemoryQueueStore());
    await queue.restore();
    await queue.enqueue(session, {
      action: 'MOVE',
      entityRef: 'S1',
      payload: {},
      mediaRefs: [],
      baseVersion: 1,
    });
    const guard = new SessionGuard(queue, () => new Date('2026-07-22T10:00:00.000Z'));
    guard.setSession(session);

    await expect(
      guard.changeBinding({ ...session, warehouseId: '01JWAREHOUSE00000000000002' })
    ).rejects.toBeInstanceOf(UnsafeBindingChangeError);
    await expect(guard.exportForAdminTakeover()).rejects.toThrow('禁止导出');
    await expect(
      guard.changeBinding({ ...session, warehouseId: '01JWAREHOUSE00000000000002' })
    ).rejects.toBeInstanceOf(UnsafeBindingChangeError);
  });

  it('persists and restores the bound device session from encrypted queue metadata', async () => {
    const queue = new OfflineQueue(new MemoryQueueStore());
    await queue.restore();
    const first = new SessionGuard(queue);
    await first.persistSession(session);
    const restarted = new SessionGuard(queue);
    await expect(restarted.restoreSession()).resolves.toEqual(session);
  });

  it('persists an invalid session after 401 and blocks sync until a fresh bind', async () => {
    const queue = new OfflineQueue(new MemoryQueueStore());
    await queue.restore();
    const guard = new SessionGuard(queue, () => new Date('2026-07-22T10:00:00.000Z'));
    await guard.persistSession(session);
    await guard.invalidate('API 401');
    expect(() => guard.assertAllowed('SYNC')).toThrow(SessionExpiredError);
    expect(() => guard.assertAllowed('NEW_BUSINESS_EVENT')).toThrow(SessionExpiredError);
    expect(() => guard.assertAllowed('REAUTHENTICATE')).not.toThrow();
    const restarted = new SessionGuard(queue);
    expect((await restarted.restoreSession())?.invalidReason).toBe('API 401');
  });
});
