import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IndexedDbQueueStore, WebCryptoQueueCodec } from './queue-store';
import { OfflineQueue } from './offline-queue';
import { MediaQueue } from './media-queue';
import type { DeviceContext } from '../domain/types';

const context: DeviceContext = {
  deviceId: '01JDEVICE00000000000000003',
  tenantId: '01JTENANT0000000000000001',
  warehouseId: '01JWAREHOUSE00000000000001',
  subjectId: '01JSUBJECT0000000000000001',
  timezone: 'Asia/Shanghai',
  appVersion: '0.2.0',
};

afterEach(() => indexedDB.deleteDatabase('zhili-pda-test'));

describe('IndexedDbQueueStore', () => {
  it('persists the event queue across store instances', async () => {
    const firstStore = new IndexedDbQueueStore('zhili-pda-test');
    const firstRuntime = new OfflineQueue(firstStore, {
      createId: () => '01JY8Z8F6ME4F0Y9QH2X6D4R7',
    });
    await firstRuntime.restore();
    await firstRuntime.enqueue(context, {
      action: 'WAREHOUSE_RECEIVE',
      entityRef: 'S2505120004',
      payload: { weightKg: '123.50' },
      mediaRefs: [],
      baseVersion: 7,
    });
    firstStore.close();

    const secondStore = new IndexedDbQueueStore('zhili-pda-test');
    const restarted = new OfflineQueue(secondStore);
    expect((await restarted.restore()).events[0]?.envelope.localSequence).toBe(1);
    secondStore.close();
  });

  it('fails closed without replacing a missing key when encrypted records remain', async () => {
    const firstStore = new IndexedDbQueueStore('zhili-pda-test');
    const queue = new OfflineQueue(firstStore);
    await queue.restore();
    await queue.enqueue(context, {
      action: 'WAREHOUSE_RECEIVE',
      entityRef: 'S-KEY-LOSS',
      payload: { weightKg: '1.00' },
      mediaRefs: [],
      baseVersion: 1,
    });
    await firstStore.deleteStoredKeyForTest();
    firstStore.close();

    const restarted = new IndexedDbQueueStore('zhili-pda-test');
    await expect(new OfflineQueue(restarted).restore()).rejects.toThrow('本地加密密钥缺失');
    const raw = await restarted.inspectEncryptedRecordsForTest();
    expect(raw.events).toHaveLength(1);
    await expect(new OfflineQueue(restarted).restore()).rejects.toThrow('本地加密密钥缺失');
    restarted.close();
  });

  it('atomically persists an event and encrypted media without orphaning on capacity failure', async () => {
    const codec = await WebCryptoQueueCodec.generate();
    const store = new IndexedDbQueueStore('zhili-pda-test', codec);
    const queue = new OfflineQueue(store, { limit: 1 });
    const media = new MediaQueue(store);
    await Promise.all([queue.restore(), media.restore()]);
    const firstMedia = await media.prepare(
      context,
      '01JY8Z8F6ME4F0Y9QH2X6D4R7',
      new Blob(['atomic-photo']),
      'image/jpeg',
      'media-atomic'
    );
    await queue.enqueue(context, {
      eventId: firstMedia.eventId,
      action: 'CAPTURE_RECEIPT_PHOTO',
      entityRef: 'S1',
      payload: {},
      mediaRefs: [firstMedia.mediaId],
      mediaItems: [firstMedia],
      baseVersion: 1,
    });
    await media.restore();
    expect(queue.snapshot().events[0]?.envelope.mediaRefs).toEqual(['media-atomic']);
    expect(media.snapshot(context)).toHaveLength(1);
    const blockedMedia = await media.prepare(
      context,
      '01JY8Z8F6ME4F0Y9QH2X6D4R8',
      new Blob(['must-not-persist']),
      'image/jpeg',
      'media-orphan'
    );
    await expect(
      queue.enqueue(context, {
        eventId: blockedMedia.eventId,
        action: 'CAPTURE_RECEIPT_PHOTO',
        entityRef: 'S2',
        payload: {},
        mediaRefs: [blockedMedia.mediaId],
        mediaItems: [blockedMedia],
        baseVersion: 1,
      })
    ).rejects.toThrow('队列已满');
    await media.restore();
    expect(media.snapshot(context).map((item) => item.mediaId)).toEqual(['media-atomic']);
    const raw = await store.inspectEncryptedRecordsForTest();
    expect(JSON.stringify(raw)).not.toContain('atomic-photo');
    expect(JSON.stringify(raw)).not.toContain('must-not-persist');
    await queue.applySyncResults([
      {
        eventId: queue.snapshot().events[0]!.envelope.eventId,
        disposition: 'APPLIED',
        serverVersion: 2,
      },
    ]);
    const completed = await store.inspectEncryptedRecordsForTest();
    expect(completed.events).toEqual([]);
    expect(completed.media).toEqual([]);
    store.close();
  });

  it.each(['CONFLICT', 'REJECTED'] as const)(
    'preserves the original local dedupe identity when an event becomes %s',
    async (disposition) => {
      const store = new IndexedDbQueueStore('zhili-pda-test');
      const queue = new OfflineQueue(store);
      await queue.restore();
      const command = {
        action: 'WAREHOUSE_RECEIVE',
        entityRef: 'S2505120004',
        payload: { actualWeightKg: '123.50' },
        mediaRefs: [],
        baseVersion: 7,
      };
      const first = await queue.enqueue(context, command);
      await queue.applySyncResults([
        {
          eventId: first.envelope.eventId,
          disposition,
          conflictId: disposition === 'CONFLICT' ? '01JCONFLICT000000000000001' : undefined,
          errorCode: disposition === 'REJECTED' ? 'INVALID_STATE' : undefined,
        },
      ]);

      const repeated = await queue.enqueue(context, command);
      expect(repeated.enqueueDisposition).toBe('DUPLICATE');
      expect((await store.getEvents()).map((event) => event.envelope.eventId)).toEqual([
        first.envelope.eventId,
      ]);
      store.close();
    }
  );

  it('stores encrypted records and uses a non-exportable WebCrypto key', async () => {
    const codec = await WebCryptoQueueCodec.generate();
    const store = new IndexedDbQueueStore('zhili-pda-test', codec);
    const queue = new OfflineQueue(store, { createId: () => '01JY8Z8F6ME4F0Y9QH2X6D4R7' });
    await queue.restore();
    await queue.enqueue(context, {
      action: 'CAPTURE_POD',
      entityRef: 'S2505120004',
      payload: { recipientName: '陈女士' },
      mediaRefs: [],
      baseVersion: 7,
    });
    const media = new MediaQueue(store);
    await media.restore();
    const photo = await media.enqueue(
      context,
      '01JY8Z8F6ME4F0Y9QH2X6D4R7',
      new Blob(['private-photo-bytes']),
      'image/jpeg',
      'media-private'
    );
    await queue.enqueue(context, {
      eventId: '01JY8Z8F6ME4F0Y9QH2X6D4R8',
      action: 'CAPTURE_POD',
      entityRef: 'S2505120005',
      payload: { recipientName: '林先生' },
      mediaRefs: [photo.mediaId],
      baseVersion: 7,
    });

    const raw = await store.inspectEncryptedRecordsForTest();
    expect(JSON.stringify(raw)).not.toContain('S2505120004');
    expect(JSON.stringify(raw)).not.toContain('陈女士');
    expect(JSON.stringify(raw)).not.toContain('private-photo-bytes');
    const restoredMedia = await new MediaQueue(store).restore();
    const restoredEvents = (await new OfflineQueue(store).restore()).events;
    expect(await restoredMedia[0]!.blob.text()).toBe('private-photo-bytes');
    expect(restoredEvents[1]?.envelope.mediaRefs).toEqual(['media-private']);
    await expect(crypto.subtle.exportKey('raw', codec.key)).rejects.toThrow();
    store.close();
  });
});
