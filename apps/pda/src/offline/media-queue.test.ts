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
      .mockResolvedValueOnce({ status: 'UPLOADED' });

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
});
