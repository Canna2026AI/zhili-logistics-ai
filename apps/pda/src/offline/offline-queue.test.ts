import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryQueueStore } from './queue-store';
import { OfflineQueue, QueueCapacityError } from './offline-queue';
import type { DeviceContext, SyncResult } from '../domain/types';

const context: DeviceContext = {
  deviceId: '01JDEVICE00000000000000003',
  tenantId: '01JTENANT0000000000000001',
  warehouseId: '01JWAREHOUSE00000000000001',
  subjectId: '01JSUBJECT0000000000000001',
  timezone: 'Asia/Shanghai',
  appVersion: '0.2.0',
};

let now = 0;
const createQueue = (store = new MemoryQueueStore()) =>
  new OfflineQueue(store, {
    now: () => new Date(1_753_152_932_000 + now++ * 1_000),
    createId: (sequence) => `01JY8Z8F6ME4F0Y9QH2X6${String(sequence).padStart(2, '0')}`,
  });

describe('OfflineQueue', () => {
  beforeEach(() => {
    now = 0;
  });

  it('creates a complete DeviceEventEnvelope with monotonic localSequence', async () => {
    const queue = createQueue();
    await queue.restore();
    const first = await queue.enqueue(context, {
      action: 'WAREHOUSE_RECEIVE',
      entityRef: 'S2505120004',
      payload: { actualWeightKg: '123.50' },
      mediaRefs: ['media-1'],
      baseVersion: 7,
    });
    const second = await queue.enqueue(context, {
      action: 'WAREHOUSE_MEASURE',
      entityRef: 'S2505120004',
      payload: { lengthCm: '60', widthCm: '40', heightCm: '35' },
      mediaRefs: [],
      baseVersion: 8,
    });

    expect(first.envelope).toMatchObject({
      eventId: expect.stringMatching(/^01J/),
      ...context,
      localSequence: 1,
      action: 'WAREHOUSE_RECEIVE',
      entityRef: 'S2505120004',
      payload: { actualWeightKg: '123.50' },
      mediaRefs: ['media-1'],
      baseVersion: 7,
      idempotencyKey: expect.stringMatching(/^pda:/),
      occurredAt: expect.stringMatching(/Z$/),
    });
    expect(second.envelope.localSequence).toBe(2);
  });

  it('restores persisted events after a simulated application restart', async () => {
    const backing = new MemoryQueueStore();
    const firstRuntime = createQueue(backing);
    await firstRuntime.restore();
    await firstRuntime.enqueue(context, {
      action: 'INVENTORY_MOVE',
      entityRef: 'S2505120004',
      payload: { location: 'A-01-03' },
      mediaRefs: [],
      baseVersion: 3,
    });

    const restarted = createQueue(backing);
    const snapshot = await restarted.restore();
    const next = await restarted.enqueue(context, {
      action: 'PICK',
      entityRef: 'S2505120005',
      payload: {},
      mediaRefs: [],
      baseVersion: 0,
    });

    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]?.envelope.entityRef).toBe('S2505120004');
    expect(next.envelope.localSequence).toBe(2);
  });

  it('deduplicates by eventId and idempotencyKey', async () => {
    const store = new MemoryQueueStore();
    const queue = createQueue(store);
    await queue.restore();
    const original = await queue.enqueue(context, {
      action: 'WAREHOUSE_RECEIVE',
      entityRef: 'S2505120004',
      payload: {},
      mediaRefs: [],
      baseVersion: 7,
      idempotencyKey: 'receive:S2505120004:123.50:20260722',
    });
    const duplicate = await queue.enqueue(context, {
      action: 'WAREHOUSE_RECEIVE',
      entityRef: 'S2505120004',
      payload: {},
      mediaRefs: [],
      baseVersion: 7,
      idempotencyKey: original.envelope.idempotencyKey,
    });

    expect(
      (await store.getEvents()).filter(
        (event) => event.envelope.idempotencyKey === original.envelope.idempotencyKey
      )
    ).toHaveLength(1);
    expect(duplicate.enqueueDisposition).toBe('DUPLICATE');
    expect(duplicate.envelope.eventId).toBe(original.envelope.eventId);
  });

  it('separates pending-scan dedupe from a new intent with different payload', async () => {
    const queue = createQueue();
    await queue.restore();
    const first = await queue.enqueue(context, {
      action: 'REWEIGH',
      entityRef: 'S2505120004',
      payload: { actualWeightKg: '122.00' },
      mediaRefs: [],
      baseVersion: 7,
    });
    const duplicate = await queue.enqueue(context, {
      action: 'REWEIGH',
      entityRef: 'S2505120004',
      payload: { actualWeightKg: '122.00' },
      mediaRefs: [],
      baseVersion: 7,
    });
    const corrected = await queue.enqueue(context, {
      action: 'REWEIGH',
      entityRef: 'S2505120004',
      payload: { actualWeightKg: '123.50' },
      mediaRefs: [],
      baseVersion: 7,
    });
    expect(duplicate.enqueueDisposition).toBe('DUPLICATE');
    expect(corrected.enqueueDisposition).toBe('QUEUED');
    expect(corrected.envelope.idempotencyKey).not.toBe(first.envelope.idempotencyKey);
    expect(queue.snapshot().events).toHaveLength(2);
  });

  it('serializes concurrent enqueue calls so sequence and eventId stay unique', async () => {
    const queue = createQueue();
    await queue.restore();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        queue.enqueue(context, {
          action: 'PICK',
          entityRef: `S-${index}`,
          payload: {},
          mediaRefs: [],
          baseVersion: 0,
        })
      )
    );
    expect(results.map((event) => event.envelope.localSequence)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
    expect(new Set(results.map((event) => event.envelope.eventId)).size).toBe(20);
  });

  it('warns at 183, blocks the 201st event and keeps plaintext export disabled', async () => {
    const queue = createQueue();
    await queue.restore();
    for (let index = 0; index < 182; index += 1) {
      await queue.enqueue(context, {
        action: 'STOCKTAKE',
        entityRef: `BIN-${index}`,
        payload: { count: index },
        mediaRefs: [],
        baseVersion: 0,
      });
    }
    expect(queue.snapshot().warning).toBe(false);
    await queue.enqueue(context, {
      action: 'STOCKTAKE',
      entityRef: 'BIN-182',
      payload: { count: 182 },
      mediaRefs: [],
      baseVersion: 0,
    });
    expect(queue.snapshot().warning).toBe(true);
    for (let index = 183; index < 200; index += 1) {
      await queue.enqueue(context, {
        action: 'STOCKTAKE',
        entityRef: `BIN-${index}`,
        payload: { count: index },
        mediaRefs: [],
        baseVersion: 0,
      });
    }
    expect(queue.snapshot().full).toBe(true);
    await expect(
      queue.enqueue(context, {
        action: 'PICK',
        entityRef: 'BLOCKED',
        payload: {},
        mediaRefs: [],
        baseVersion: 0,
      })
    ).rejects.toBeInstanceOf(QueueCapacityError);
    expect(queue.snapshot().events).toHaveLength(200);
    await expect(queue.exportQueue()).rejects.toThrow('明文队列导出永久禁用');
  });

  it('processes APPLIED, DUPLICATE, CONFLICT and REJECTED results per event', async () => {
    const queue = createQueue();
    await queue.restore();
    const events = [];
    for (const entityRef of ['OK', 'DUP', 'CONFLICT', 'REJECT']) {
      events.push(
        await queue.enqueue(context, {
          action: 'WAREHOUSE_RECEIVE',
          entityRef,
          payload: {},
          mediaRefs: [],
          baseVersion: 1,
        })
      );
    }
    const dispositions = ['APPLIED', 'DUPLICATE', 'CONFLICT', 'REJECTED'] as const;
    const results: SyncResult[] = events.map((event, index) => ({
      eventId: event.envelope.eventId,
      disposition: dispositions[index]!,
      claimedMediaRefs:
        dispositions[index] === 'APPLIED' || dispositions[index] === 'DUPLICATE'
          ? event.envelope.mediaRefs
          : [],
      serverVersion: 9,
      conflictId: dispositions[index] === 'CONFLICT' ? '01JCONFLICT000000000000001' : undefined,
      errorCode: dispositions[index] === 'REJECTED' ? 'INVALID_STATE' : undefined,
    }));

    const outcome = await queue.applySyncResults(results);

    expect(outcome).toEqual({ applied: 1, duplicate: 1, conflict: 1, rejected: 1 });
    expect(queue.snapshot().events.map((event) => event.state)).toEqual(['CONFLICT', 'REJECTED']);
    expect(queue.snapshot().events[0]?.conflict?.serverVersion).toBe(9);
    expect(queue.snapshot().events[0]?.conflict?.serverState).toBeUndefined();
    expect(queue.snapshot().events[0]?.conflict?.differences).toBeUndefined();
    expect(queue.snapshot().events[0]?.conflict?.snapshotNotice).toContain('契约未返回');
  });

  it.each(['APPLIED', 'DUPLICATE'] as const)(
    'atomically removes the event and local media after %s',
    async (disposition) => {
      const store = new MemoryQueueStore();
      const queue = createQueue(store);
      await queue.restore();
      const mediaId = `media-${disposition.toLowerCase()}`;
      const event = await queue.enqueue(context, {
        action: 'CAPTURE_RECEIPT_PHOTO',
        entityRef: 'S2505120004',
        payload: {},
        mediaRefs: [mediaId],
        mediaItems: [
          {
            mediaId,
            eventId: '01JY8Z8F6ME4F0Y9QH2X6D4R7',
            contentHash: 'sha256:photo',
            mimeType: 'image/png',
            blob: new Blob(['photo']),
            status: 'UPLOADED',
            remoteStatus: 'READY',
            progress: 100,
            attempts: 1,
            context,
          },
        ],
        baseVersion: 7,
      });

      await queue.applySyncResults([
        {
          eventId: event.envelope.eventId,
          disposition,
          claimedMediaRefs: [mediaId],
          serverVersion: 8,
        },
      ]);

      expect(await store.getEvents()).toEqual([]);
      expect(await store.getMedia()).toEqual([]);
    }
  );

  it.each(['CONFLICT', 'REJECTED'] as const)(
    'keeps the same local business intent deduplicated after %s',
    async (disposition) => {
      const queue = createQueue();
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
          errorCode: disposition === 'REJECTED' ? 'INVALID_STATE' : undefined,
        },
      ]);

      const duplicate = await queue.enqueue(context, command);
      expect(duplicate.enqueueDisposition).toBe('DUPLICATE');
      expect(queue.snapshot().events).toHaveLength(1);
    }
  );

  it('keeps all work when an authoritative receipt claims a different media set', async () => {
    const store = new MemoryQueueStore();
    const queue = createQueue(store);
    await queue.restore();
    const mediaId = 'media-exact-claim';
    const event = await queue.enqueue(context, {
      action: 'CAPTURE_POD',
      entityRef: 'LM250722001',
      payload: {},
      mediaRefs: [mediaId],
      mediaItems: [
        {
          mediaId,
          eventId: '01JY8Z8F6ME4F0Y9QH2X6D4R7',
          contentHash: '0'.repeat(64),
          mimeType: 'image/png',
          blob: new Blob(['photo']),
          status: 'PROCESSING',
          remoteStatus: 'UPLOADED',
          progress: 70,
          attempts: 1,
          context,
        },
      ],
      baseVersion: 7,
    });

    await expect(
      queue.confirmClaimedWork({
        eventId: event.envelope.eventId,
        disposition: 'APPLIED',
        claimedMediaRefs: ['media-other'],
        serverVersion: 8,
        operation: 'PROOF_OF_DELIVERY',
      })
    ).rejects.toThrow('媒体认领回执');
    expect(await store.getEvents()).toHaveLength(1);
    expect(await store.getMedia()).toHaveLength(1);
  });

  it('rejects a forged non-success disposition at runtime and retains local work', async () => {
    const store = new MemoryQueueStore();
    const queue = createQueue(store);
    await queue.restore();
    const event = await queue.enqueue(context, {
      action: 'PICK',
      entityRef: 'RUNTIME-GUARD',
      payload: {},
      mediaRefs: [],
      baseVersion: 1,
    });

    await expect(
      queue.confirmClaimedWork({
        eventId: event.envelope.eventId,
        disposition: 'REJECTED' as never,
        claimedMediaRefs: [],
        serverVersion: 2,
        operation: 'EVENT_SYNC',
      })
    ).rejects.toThrow('APPLIED/DUPLICATE');
    expect(await store.getEvents()).toHaveLength(1);
  });
});
