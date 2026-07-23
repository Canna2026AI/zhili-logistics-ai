import { describe, expect, it, vi } from 'vitest';
import { MemoryQueueStore } from './queue-store';
import { MediaQueue } from './media-queue';
import type { DeviceContext } from '../domain/types';

const context: DeviceContext = {
  deviceId: 'D1',
  tenantId: 'T1',
  warehouseId: 'W1',
  subjectId: 'S1',
  timezone: 'Asia/Shanghai',
  appVersion: '0.2.0',
};

describe('MediaQueue', () => {
  it('stores media separately with a content hash and restores pending uploads', async () => {
    const store = new MemoryQueueStore();
    const queue = new MediaQueue(store);
    const item = await queue.enqueue(
      context,
      '01JY8Z8F6ME4F0Y9QH2X6D4R7',
      new Blob(['photo']),
      'image/jpeg'
    );
    const restored = await new MediaQueue(store).restore();

    expect(item.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(restored[0]).toMatchObject({
      mediaId: item.mediaId,
      status: 'PENDING',
      progress: 0,
      attempts: 0,
    });
  });

  it('rejects an upload receipt that belongs to another media reservation', async () => {
    const store = new MemoryQueueStore();
    const queue = new MediaQueue(store);
    const item = await queue.enqueue(
      context,
      '01JY8Z8F6ME4F0Y9QH2X6D4R7',
      new Blob(['photo'], { type: 'image/jpeg' }),
      'image/jpeg',
      'media-expected'
    );

    await queue.uploadRefs(context, [item.mediaId], async () => ({
      mediaId: 'media-other',
      eventId: item.eventId,
      scope: context,
      status: 'READY',
      objectRef: 'pda/media-other',
      expiresAt: '2099-12-31T23:59:59.000Z',
    }));

    expect(queue.snapshot()[0]).toMatchObject({ status: 'RETRY' });
    expect(queue.snapshot()[0]?.remoteStatus).toBeUndefined();
  });

  it('does not consume the 200 business-event capacity', async () => {
    const store = new MemoryQueueStore();
    const queue = new MediaQueue(store);
    for (let index = 0; index < 205; index += 1) {
      await queue.enqueue(
        context,
        '01JY8Z8F6ME4F0Y9QH2X6D4R7',
        new Blob([String(index)]),
        'image/jpeg'
      );
    }
    expect(queue.snapshot()).toHaveLength(205);
  });

  it('retries failures but never reuploads a server-accepted reservation', async () => {
    const store = new MemoryQueueStore();
    const queue = new MediaQueue(store);
    await queue.enqueue(context, '01JY8Z8F6ME4F0Y9QH2X6D4R7', new Blob(['photo']), 'image/jpeg');
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementationOnce(async (item) => ({
        mediaId: item.mediaId,
        eventId: item.eventId,
        scope: context,
        status: 'UPLOADED',
        objectRef: `pda/${item.mediaId}`,
        expiresAt: '2099-12-31T23:59:59.000Z',
      }));

    await queue.uploadPending(upload);
    expect(queue.snapshot()[0]).toMatchObject({ status: 'RETRY', attempts: 1, progress: 0 });
    await queue.uploadPending(upload);
    expect(queue.snapshot()[0]).toMatchObject({
      status: 'PROCESSING',
      remoteStatus: 'UPLOADED',
      attempts: 2,
      progress: 70,
    });
    await queue.uploadPending(upload);
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('restores an expired reservation as retryable work and renews it before claiming', async () => {
    const store = new MemoryQueueStore();
    const first = new MediaQueue(store, () => new Date('2026-07-22T10:00:00.000Z'));
    const item = await first.enqueue(
      context,
      '01JY8Z8F6ME4F0Y9QH2X6D4R7',
      new Blob(['photo']),
      'image/jpeg',
      'media-expiring'
    );
    await first.uploadRefs(context, [item.mediaId], async () => ({
      mediaId: item.mediaId,
      eventId: item.eventId,
      scope: context,
      status: 'READY',
      objectRef: 'pda/media-expiring-v1',
      expiresAt: '2026-07-22T10:05:00.000Z',
    }));
    expect(first.snapshot()[0]).toMatchObject({
      remoteStatus: 'READY',
      remoteExpiresAt: '2026-07-22T10:05:00.000Z',
    });

    const restarted = new MediaQueue(store, () => new Date('2026-07-22T10:06:00.000Z'));
    await restarted.restore();
    expect(restarted.areReserved([item.mediaId])).toBe(false);
    const renew = vi.fn().mockResolvedValue({
      mediaId: item.mediaId,
      eventId: item.eventId,
      scope: context,
      status: 'READY',
      objectRef: 'pda/media-expiring-v2',
      expiresAt: '2026-07-22T10:11:00.000Z',
    });

    await restarted.uploadRefs(context, [item.mediaId], renew);

    expect(renew).toHaveBeenCalledTimes(1);
    expect(restarted.areReserved([item.mediaId])).toBe(true);
    expect(restarted.snapshot()[0]).toMatchObject({
      status: 'UPLOADED',
      remoteStatus: 'READY',
      remoteExpiresAt: '2026-07-22T10:11:00.000Z',
      attempts: 2,
    });
  });
});
