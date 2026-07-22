import { describe, expect, it, vi } from 'vitest';
import { OfflineQueue } from '../offline/offline-queue';
import { MediaQueue } from '../offline/media-queue';
import { MemoryQueueStore } from '../offline/queue-store';
import { MemoryPdaPort } from '../ports/memory-pda-port';
import { PdaApiError } from '../ports/pda-port';
import { PdaSyncService } from './pda-sync-service';
import type { DeviceContext } from '../domain/types';

const context: DeviceContext = {
  deviceId: '01JDEVICE00000000000000003',
  tenantId: '01JTENANT0000000000000001',
  warehouseId: '01JWAREHOUSE00000000000001',
  subjectId: '01JSUBJECT0000000000000001',
  timezone: 'Asia/Shanghai',
  appVersion: '0.2.0',
};
const syncContext = {
  ...context,
  expiresAt: '2099-12-31T23:59:59.000Z',
  permissions: ['pda.sync'],
};

describe('PdaSyncService', () => {
  it('resumes ordered batches of 100 and handles four dispositions independently', async () => {
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await queue.restore();
    await media.restore();
    for (let index = 0; index < 200; index += 1) {
      const suffix = index === 50 ? 'CONFLICT' : index === 51 ? 'REJECT' : `OK-${index}`;
      await queue.enqueue(context, {
        action: 'PICK',
        entityRef: suffix,
        payload: {},
        mediaRefs: [],
        baseVersion: 1,
      });
    }
    const port = new MemoryPdaPort();
    const seenBatches: number[][] = [];
    const original = port.syncDeviceEvents.bind(port);
    port.syncDeviceEvents = async (events, key) => {
      seenBatches.push(events.map((event) => event.localSequence));
      return original(events, key);
    };

    const outcome = await new PdaSyncService(queue, media, port).synchronize(syncContext);

    expect(seenBatches).toHaveLength(2);
    expect(seenBatches[0]).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    expect(seenBatches[1]).toEqual(Array.from({ length: 100 }, (_, index) => index + 101));
    expect(outcome).toMatchObject({ applied: 198, conflict: 1, rejected: 1 });
    expect(queue.snapshot().events).toHaveLength(2);
  });

  it('retains pending siblings when a network batch rejects', async () => {
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await queue.restore();
    await media.restore();
    await queue.enqueue(context, {
      action: 'PICK',
      entityRef: 'S1',
      payload: {},
      mediaRefs: [],
      baseVersion: 1,
    });
    await queue.enqueue(context, {
      action: 'PICK',
      entityRef: 'S2',
      payload: {},
      mediaRefs: [],
      baseVersion: 1,
    });
    const port = new MemoryPdaPort();
    port.syncDeviceEvents = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(new PdaSyncService(queue, media, port).synchronize(syncContext)).rejects.toThrow(
      'Failed to fetch'
    );
    expect(queue.snapshot().events).toHaveLength(2);
  });

  it('fails closed before any port call when event or media context differs', async () => {
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await Promise.all([queue.restore(), media.restore()]);
    const foreign = { ...context, warehouseId: 'W-FOREIGN' };
    const item = await media.prepare(foreign, '01JFOREIGNEVENT00000000001', new Blob(['foreign']));
    await queue.enqueue(foreign, {
      eventId: item.eventId,
      action: 'PICK',
      entityRef: 'FOREIGN',
      payload: {},
      mediaRefs: [item.mediaId],
      mediaItems: [item],
      baseVersion: 1,
    });
    await media.restore();
    const port = new MemoryPdaPort();
    const sync = vi.spyOn(port, 'syncDeviceEvents');
    const upload = vi.spyOn(port, 'uploadDeviceMedia');
    await expect(new PdaSyncService(queue, media, port).synchronize(syncContext)).rejects.toThrow(
      '不匹配'
    );
    expect(sync).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads retained media idempotently before synchronizing events', async () => {
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await queue.restore();
    await media.restore();
    const mediaItem = await media.prepare(
      context,
      '01JEVENTMEDIA00000000000001',
      new Blob(['photo'], { type: 'image/jpeg' })
    );
    await queue.enqueue(context, {
      eventId: '01JEVENTMEDIA00000000000001',
      action: 'CAPTURE_RECEIPT_PHOTO',
      entityRef: 'S1',
      payload: {},
      mediaRefs: [mediaItem.mediaId],
      mediaItems: [mediaItem],
      baseVersion: 1,
    });
    await media.restore();
    const item = media.snapshot(context)[0]!;
    const port = new MemoryPdaPort();
    port.uploadFailures.add(item.mediaId);
    const service = new PdaSyncService(queue, media, port);

    await service.synchronize(syncContext);
    expect(media.snapshot()[0]).toMatchObject({ status: 'RETRY', attempts: 1 });
    await service.synchronize(syncContext);
    expect(media.snapshot()).toEqual([]);
    expect(queue.snapshot().events).toEqual([]);
    expect(port.uploadedMedia.has(item.mediaId)).toBe(true);
  });

  it('syncs an uploaded reservation and waits for the event receipt to claim it READY', async () => {
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await queue.restore();
    await media.restore();
    const item = await media.prepare(context, '01JEVENTMEDIA00000000000001', new Blob(['photo']));
    await queue.enqueue(context, {
      eventId: '01JEVENTMEDIA00000000000001',
      action: 'CAPTURE_POD',
      entityRef: 'LM1',
      payload: {},
      mediaRefs: [item.mediaId],
      mediaItems: [item],
      baseVersion: 1,
    });
    const port = new MemoryPdaPort();
    port.uploadDeviceMedia = vi
      .fn()
      .mockResolvedValue({ mediaId: item.mediaId, status: 'SCANNING', objectRef: 'pda/photo' });
    const sync = vi.spyOn(port, 'syncDeviceEvents');

    await media.restore();
    await new PdaSyncService(queue, media, port).synchronize(syncContext);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(queue.snapshot().events).toEqual([]);
    expect(media.snapshot()).toEqual([]);
  });

  it('resolves KEEP_SERVER REAPPLY_LOCAL SUBMIT_MANUAL only after a valid audited API decision', async () => {
    for (const resolution of ['KEEP_SERVER', 'REAPPLY_LOCAL', 'SUBMIT_MANUAL'] as const) {
      const store = new MemoryQueueStore();
      const queue = new OfflineQueue(store);
      const media = new MediaQueue(store);
      await queue.restore();
      await media.restore();
      const event = await queue.enqueue(context, {
        action: 'PICK',
        entityRef: 'CONFLICT',
        payload: {},
        mediaRefs: [],
        baseVersion: 7,
      });
      await queue.applySyncResults([
        {
          eventId: event.envelope.eventId,
          disposition: 'CONFLICT',
          claimedMediaRefs: [],
          conflictId: '01JCONFLICT000000000000001',
          serverVersion: 9,
          conflictVersion: 1,
        },
      ]);
      const port = new MemoryPdaPort();
      const service = new PdaSyncService(queue, media, port);

      await expect(
        service.resolveConflict(event.envelope.eventId, resolution, '理由太短')
      ).rejects.toThrow('至少 5');
      await service.resolveConflict(event.envelope.eventId, resolution, '经现场复核后确认处理');
      expect(port.conflictResolutions[0]).toMatchObject({
        resolution,
        reason: '经现场复核后确认处理',
      });
      expect(queue.snapshot().events).toHaveLength(0);
    }
  });

  it('preserves the complete 409 envelope after refreshing the newest conflict snapshot', async () => {
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await Promise.all([queue.restore(), media.restore()]);
    const event = await queue.enqueue(context, {
      action: 'PICK',
      entityRef: 'CONFLICT',
      payload: {},
      mediaRefs: [],
      baseVersion: 7,
    });
    await queue.applySyncResults([
      {
        eventId: event.envelope.eventId,
        disposition: 'CONFLICT',
        claimedMediaRefs: [],
        conflictId: '01JCONFLICT000000000000001',
        serverVersion: 9,
        conflictVersion: 1,
      },
    ]);
    const port = new MemoryPdaPort();
    const originalSnapshot = port.getDeviceConflict.bind(port);
    let reads = 0;
    port.getDeviceConflict = async (conflictId) => {
      const result = await originalSnapshot(conflictId);
      reads += 1;
      return reads === 2
        ? {
            ...result,
            etag: '"4"',
            conflict: { ...result.conflict, serverVersion: 10, version: 4 },
          }
        : result;
    };
    port.resolveDeviceConflict = vi
      .fn()
      .mockRejectedValue(
        new PdaApiError(
          '版本过期',
          409,
          'STALE_VERSION',
          'req-conflict-409',
          '读取最新 ETag 后重试',
          [{ field: 'If-Match', reason: 'expected version 4' }]
        )
      );
    const service = new PdaSyncService(queue, media, port);

    let captured: unknown;
    try {
      await service.resolveConflict(event.envelope.eventId, 'KEEP_SERVER', '现场主管复核确认');
    } catch (error) {
      captured = error;
    }
    expect(captured).toMatchObject({
      status: 409,
      code: 'STALE_VERSION',
      requestId: 'req-conflict-409',
      remediation: '读取最新 ETag 后重试',
      details: [{ field: 'If-Match', reason: 'expected version 4' }],
    });
    expect((captured as Error).message).toContain('已刷新差异');
    expect(service.getEvent(event.envelope.eventId)?.conflict).toMatchObject({
      serverVersion: 10,
      version: 4,
      etag: '"4"',
    });
    expect(queue.snapshot().events).toHaveLength(1);
  });
});
