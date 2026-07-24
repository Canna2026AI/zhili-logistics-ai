import { describe, expect, it } from 'vitest';
import type { DeviceTakeoverExportReceipt, QueuedEvent } from '../domain/types';
import { MemoryQueueStore } from './queue-store';
import { hashTakeoverManifest, type TakeoverManifest } from '../takeover/manifest';

const receipt: DeviceTakeoverExportReceipt = {
  exportId: '01JMEMORYEXPORT000000000001',
  authorizationId: '01JMEMORYAUTH0000000000001',
  deviceId: '01JDEVICE00000000000000003',
  scope: {
    deviceId: '01JDEVICE00000000000000003',
    tenantId: '01JTENANT0000000000000001',
    warehouseId: '01JWAREHOUSE00000000000001',
    subjectId: '01JSUBJECT0000000000000001',
  },
  manifestHash: 'a'.repeat(64),
  ciphertextHash: 'b'.repeat(64),
  eventCount: 1,
  mediaCount: 0,
  checksumAlgorithm: 'SHA-256',
  status: 'VERIFIED',
  receivedAt: '2026-07-23T01:00:00.000Z',
  verifiedAt: '2026-07-23T01:00:01.000Z',
};

const event: QueuedEvent = {
  state: 'PENDING',
  envelope: {
    eventId: '01JMEMORYEVENT000000000001',
    deviceId: receipt.deviceId,
    localSequence: 1,
    tenantId: receipt.scope.tenantId,
    warehouseId: receipt.scope.warehouseId,
    subjectId: receipt.scope.subjectId,
    action: 'WAREHOUSE_RECEIVE',
    entityRef: 'MEMORY-FINALIZE',
    payload: {},
    mediaRefs: [],
    baseVersion: 1,
    idempotencyKey: 'pda:memory:finalize',
    occurredAt: '2026-07-23T01:00:00.000Z',
    timezone: 'Asia/Shanghai',
    appVersion: '0.2.0',
  },
};

const manifest: TakeoverManifest = {
  schemaVersion: 1,
  scope: receipt.scope,
  eventCount: 1,
  mediaCount: 0,
  events: [
    {
      eventId: event.envelope.eventId,
      localSequence: event.envelope.localSequence,
      idempotencyKey: event.envelope.idempotencyKey,
      mediaRefs: event.envelope.mediaRefs,
    },
  ],
  media: [],
};

async function boundReceipt() {
  return { ...receipt, manifestHash: await hashTakeoverManifest(manifest) };
}

describe('MemoryQueueStore takeover finalization', () => {
  it('commits the receipt and authorized deletion as one state change', async () => {
    const store = new MemoryQueueStore();
    await store.putEvent(event);
    const verifiedReceipt = await boundReceipt();
    await store.setMeta('pending-takeover-finalize', {
      receipt: verifiedReceipt,
      manifest,
      eventIds: [event.envelope.eventId],
      mediaIds: [],
    });

    await store.finalizeTakeoverPackage(verifiedReceipt, [event.envelope.eventId], [], manifest);

    expect(await store.getEvents()).toEqual([]);
    expect(await store.getMeta('last-takeover-export-receipt')).toEqual(verifiedReceipt);
    expect(await store.getMeta('pending-takeover-finalize')).toBeUndefined();
  });

  it('does not write a receipt or delete work when any target is missing', async () => {
    const store = new MemoryQueueStore();
    await store.putEvent(event);
    const verifiedReceipt = await boundReceipt();

    await expect(
      store.finalizeTakeoverPackage(
        verifiedReceipt,
        [event.envelope.eventId, 'missing-event'],
        [],
        manifest
      )
    ).rejects.toThrow('接管清理清单');

    expect(await store.getEvents()).toEqual([event]);
    expect(await store.getMeta('last-takeover-export-receipt')).toBeUndefined();
  });

  it('rejects a receipt whose authoritative counts do not match the cleanup list', async () => {
    const store = new MemoryQueueStore();
    await store.putEvent(event);
    const verifiedReceipt = await boundReceipt();

    await expect(
      store.finalizeTakeoverPackage(
        { ...verifiedReceipt, eventCount: 2 },
        [event.envelope.eventId],
        [],
        manifest
      )
    ).rejects.toThrow('接管清理清单');

    expect(await store.getEvents()).toEqual([event]);
    expect(await store.getMeta('last-takeover-export-receipt')).toBeUndefined();
  });
});
