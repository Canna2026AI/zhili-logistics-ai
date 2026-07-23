import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IndexedDbQueueStore, WebCryptoQueueCodec } from './queue-store';
import { OfflineQueue } from './offline-queue';
import { MediaQueue } from './media-queue';
import type { DeviceContext, MediaQueueItem, QueuedEvent } from '../domain/types';
import type { DeviceTakeoverExportReceipt } from '../domain/types';
import { hashTakeoverManifest, type TakeoverManifest } from '../takeover/manifest';

const context: DeviceContext = {
  deviceId: '01JDEVICE00000000000000003',
  tenantId: '01JTENANT0000000000000001',
  warehouseId: '01JWAREHOUSE00000000000001',
  subjectId: '01JSUBJECT0000000000000001',
  timezone: 'Asia/Shanghai',
  appVersion: '0.2.0',
};

const takeoverReceipt: DeviceTakeoverExportReceipt = {
  exportId: '01JTAKEOVEREXPORT0000000001',
  authorizationId: '01JTAKEOVERAUTH00000000001',
  deviceId: context.deviceId,
  scope: {
    deviceId: context.deviceId,
    tenantId: context.tenantId,
    warehouseId: context.warehouseId,
    subjectId: context.subjectId,
  },
  manifestHash: 'a'.repeat(64),
  ciphertextHash: 'b'.repeat(64),
  eventCount: 1,
  mediaCount: 1,
  checksumAlgorithm: 'SHA-256',
  status: 'VERIFIED',
  receivedAt: '2026-07-23T01:00:00.000Z',
  verifiedAt: '2026-07-23T01:00:01.000Z',
};

async function takeoverFixture(events: QueuedEvent[], media: MediaQueueItem[]) {
  const manifest: TakeoverManifest = {
    schemaVersion: 1,
    scope: takeoverReceipt.scope,
    eventCount: events.length,
    mediaCount: media.length,
    events: events.map((event) => ({
      eventId: event.envelope.eventId,
      localSequence: event.envelope.localSequence,
      idempotencyKey: event.envelope.idempotencyKey,
      mediaRefs: event.envelope.mediaRefs,
    })),
    media: media.map((item) => ({
      mediaId: item.mediaId,
      eventId: item.eventId,
      contentHash: item.contentHash,
      mimeType: item.mimeType,
    })),
  };
  return {
    manifest,
    receipt: {
      ...takeoverReceipt,
      manifestHash: await hashTakeoverManifest(manifest),
      eventCount: events.length,
      mediaCount: media.length,
    },
  };
}

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
    firstMedia.status = 'UPLOADED';
    firstMedia.remoteStatus = 'READY';
    firstMedia.remoteExpiresAt = '2099-12-31T23:59:59.000Z';
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
    expect(media.snapshot(context)[0]).toMatchObject({
      mediaId: 'media-atomic',
      remoteStatus: 'READY',
      remoteExpiresAt: '2099-12-31T23:59:59.000Z',
    });
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
        claimedMediaRefs: ['media-atomic'],
        serverVersion: 2,
      },
    ]);
    const completed = await store.inspectEncryptedRecordsForTest();
    expect(completed.events).toEqual([]);
    expect(completed.media).toEqual([]);
    store.close();
  });

  it('persists the authoritative media reservation expiry across an encrypted restart', async () => {
    const firstStore = new IndexedDbQueueStore('zhili-pda-test');
    const first = new MediaQueue(firstStore);
    await first.restore();
    const item = await first.enqueue(
      context,
      '01JMEDIAEXPIRYEVENT00000001',
      new Blob(['reservation-photo']),
      'image/jpeg',
      'media-expiry-persisted'
    );
    await first.uploadRefs(context, [item.mediaId], async () => ({
      mediaId: item.mediaId,
      eventId: item.eventId,
      scope: context,
      status: 'UPLOADED',
      objectRef: 'pda/media-expiry-persisted',
      expiresAt: '2099-12-31T23:59:59.000Z',
    }));
    firstStore.close();

    const secondStore = new IndexedDbQueueStore('zhili-pda-test');
    const restored = await new MediaQueue(secondStore).restore();

    expect(restored[0]).toMatchObject({
      mediaId: item.mediaId,
      remoteStatus: 'UPLOADED',
      remoteExpiresAt: '2099-12-31T23:59:59.000Z',
    });
    secondStore.close();
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
          claimedMediaRefs: [],
          conflictId: disposition === 'CONFLICT' ? '01JCONFLICT000000000000001' : undefined,
          serverVersion: disposition === 'CONFLICT' ? 9 : undefined,
          conflictVersion: disposition === 'CONFLICT' ? 1 : undefined,
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

  it('atomically clears only the takeover-authorized snapshot and preserves later work', async () => {
    const store = new IndexedDbQueueStore('zhili-pda-test');
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await Promise.all([queue.restore(), media.restore()]);
    const firstEventId = '01JTAKEOVERSNAPSHOT00000001';
    const secondEventId = '01JAFTERAUTHORIZATION000001';
    const firstMedia = await media.prepare(
      context,
      firstEventId,
      new Blob(['authorized-photo']),
      'image/jpeg',
      'media-authorized'
    );
    const secondMedia = await media.prepare(
      context,
      secondEventId,
      new Blob(['later-photo']),
      'image/jpeg',
      'media-later'
    );
    await queue.enqueue(context, {
      eventId: firstEventId,
      action: 'CAPTURE_POD',
      entityRef: 'AUTHORIZED',
      payload: {},
      mediaRefs: [firstMedia.mediaId],
      mediaItems: [firstMedia],
      baseVersion: 1,
    });
    await queue.enqueue(context, {
      eventId: secondEventId,
      action: 'WAREHOUSE_RECEIVE',
      entityRef: 'AFTER-AUTHORIZATION',
      payload: {},
      mediaRefs: [secondMedia.mediaId],
      mediaItems: [secondMedia],
      baseVersion: 1,
    });

    await queue.clearTakeoverPackage([firstEventId], [firstMedia.mediaId]);

    expect((await store.getEvents()).map((event) => event.envelope.eventId)).toEqual([
      secondEventId,
    ]);
    expect((await store.getMedia()).map((item) => item.mediaId)).toEqual([secondMedia.mediaId]);
    const raw = await store.inspectEncryptedRecordsForTest();
    expect(raw.events).toHaveLength(1);
    expect(raw.media).toHaveLength(1);
    store.close();
  });

  it('atomically writes the VERIFIED receipt and removes only its takeover package', async () => {
    const store = new IndexedDbQueueStore('zhili-pda-test');
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await Promise.all([queue.restore(), media.restore()]);
    const eventId = '01JFINALIZEEVENT00000000001';
    const laterEventId = '01JFINALIZELATER0000000001';
    const evidence = await media.prepare(
      context,
      eventId,
      new Blob(['verified-evidence']),
      'image/jpeg',
      'media-finalize'
    );
    await queue.enqueue(context, {
      eventId,
      action: 'CAPTURE_POD',
      entityRef: 'TAKEOVER-FINALIZE',
      payload: {},
      mediaRefs: [evidence.mediaId],
      mediaItems: [evidence],
      baseVersion: 1,
    });
    await queue.enqueue(context, {
      eventId: laterEventId,
      action: 'WAREHOUSE_RECEIVE',
      entityRef: 'LATER-WORK',
      payload: {},
      mediaRefs: [],
      baseVersion: 1,
    });
    const event = queue.snapshot().events.find((item) => item.envelope.eventId === eventId)!;
    const { manifest, receipt } = await takeoverFixture([event], [evidence]);
    await store.setMeta('pending-takeover-finalize', {
      receipt,
      manifest,
      eventIds: [eventId],
      mediaIds: [evidence.mediaId],
    });

    await store.finalizeTakeoverPackage(receipt, [eventId], [evidence.mediaId], manifest);

    expect(await store.getMeta('last-takeover-export-receipt')).toEqual(receipt);
    expect(await store.getMeta('pending-takeover-finalize')).toBeUndefined();
    expect((await store.getEvents()).map((event) => event.envelope.eventId)).toEqual([
      laterEventId,
    ]);
    expect(await store.getMedia()).toEqual([]);
    store.close();
  });

  it('leaves receipt, events and media unchanged when finalize validation fails', async () => {
    const store = new IndexedDbQueueStore('zhili-pda-test');
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await Promise.all([queue.restore(), media.restore()]);
    const eventId = '01JFINALIZEFAIL000000000001';
    const evidence = await media.prepare(
      context,
      eventId,
      new Blob(['must-remain']),
      'image/jpeg',
      'media-finalize-fail'
    );
    await queue.enqueue(context, {
      eventId,
      action: 'CAPTURE_POD',
      entityRef: 'FINALIZE-FAIL',
      payload: {},
      mediaRefs: [evidence.mediaId],
      mediaItems: [evidence],
      baseVersion: 1,
    });
    const event = queue.snapshot().events.find((item) => item.envelope.eventId === eventId)!;
    const { manifest, receipt } = await takeoverFixture([event], [evidence]);

    await expect(
      store.finalizeTakeoverPackage(
        receipt,
        [eventId, 'missing-event'],
        [evidence.mediaId],
        manifest
      )
    ).rejects.toThrow('接管清理清单');

    expect(await store.getMeta('last-takeover-export-receipt')).toBeUndefined();
    expect((await store.getEvents()).map((event) => event.envelope.eventId)).toEqual([eventId]);
    expect((await store.getMedia()).map((item) => item.mediaId)).toEqual([evidence.mediaId]);
    store.close();
  });

  it('rolls back receipt, pending markers, events and media when the finalization transaction aborts', async () => {
    const store = new IndexedDbQueueStore('zhili-pda-test');
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await Promise.all([queue.restore(), media.restore()]);
    const eventId = '01JFINALIZEABORT00000000001';
    const evidence = await media.prepare(
      context,
      eventId,
      new Blob(['must-survive-abort']),
      'image/jpeg',
      'media-finalize-abort'
    );
    await queue.enqueue(context, {
      eventId,
      action: 'CAPTURE_POD',
      entityRef: 'FINALIZE-ABORT',
      payload: {},
      mediaRefs: [evidence.mediaId],
      mediaItems: [evidence],
      baseVersion: 1,
    });
    const event = queue.snapshot().events.find((item) => item.envelope.eventId === eventId)!;
    const { manifest, receipt } = await takeoverFixture([event], [evidence]);
    const pendingFinalize = {
      receipt,
      manifest,
      eventIds: [eventId],
      mediaIds: [evidence.mediaId],
    };
    const pendingUpload = { authorizationId: receipt.authorizationId };
    await Promise.all([
      store.setMeta('pending-takeover-finalize', pendingFinalize),
      store.setMeta('pending-takeover-upload', pendingUpload),
    ]);
    let faultInjected = false;
    Object.assign(store, {
      beforeFinalizeCommit: (abort: () => void) => {
        faultInjected = true;
        abort();
      },
    });

    await expect(
      store.finalizeTakeoverPackage(receipt, [eventId], [evidence.mediaId], manifest)
    ).rejects.toThrow();

    expect(faultInjected).toBe(true);
    expect(await store.getMeta('last-takeover-export-receipt')).toBeUndefined();
    expect(await store.getMeta('pending-takeover-finalize')).toEqual(pendingFinalize);
    expect(await store.getMeta('pending-takeover-upload')).toEqual(pendingUpload);
    expect((await store.getEvents()).map((event) => event.envelope.eventId)).toEqual([eventId]);
    expect((await store.getMedia()).map((item) => item.mediaId)).toEqual([evidence.mediaId]);
    store.close();
  });

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
