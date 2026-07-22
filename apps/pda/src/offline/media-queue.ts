import type { DeviceContext, MediaQueueItem } from '../domain/types';
import type { QueueStore } from './queue-store';
import { readBlobBytes } from './blob-bytes';

async function contentHash(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await readBlobBytes(blob));
  const value = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return value;
}

function sameContext(left: DeviceContext | undefined, right: DeviceContext) {
  return (
    left !== undefined &&
    left.deviceId === right.deviceId &&
    left.tenantId === right.tenantId &&
    left.warehouseId === right.warehouseId &&
    left.subjectId === right.subjectId
  );
}

export class MediaQueue {
  private items: MediaQueueItem[] = [];

  constructor(private readonly store: QueueStore) {}

  async restore() {
    this.items = await this.store.getMedia();
    return this.snapshot();
  }

  snapshot(context?: DeviceContext) {
    return this.items.filter((item) => !context || sameContext(item.context, context));
  }

  async prepare(
    context: DeviceContext,
    eventId: string,
    blob: Blob,
    mimeType = blob.type || 'application/octet-stream',
    mediaId = `media-${crypto.randomUUID()}`
  ): Promise<MediaQueueItem> {
    return {
      mediaId,
      eventId,
      contentHash: await contentHash(blob),
      mimeType,
      blob,
      status: 'PENDING',
      progress: 0,
      attempts: 0,
      context,
    };
  }

  async enqueue(
    context: DeviceContext,
    eventId: string,
    blob: Blob,
    mimeType = blob.type || 'application/octet-stream',
    mediaId = `media-${crypto.randomUUID()}`
  ) {
    const item = await this.prepare(context, eventId, blob, mimeType, mediaId);
    await this.store.putMedia(item);
    this.items = await this.store.getMedia();
    return item;
  }

  async uploadPending(
    upload: (
      item: MediaQueueItem
    ) => Promise<{ status: 'UPLOADED' | 'SCANNING' | 'READY' | 'REJECTED' }>
  ) {
    return this.uploadSelected(() => true, upload);
  }

  async uploadRefs(
    context: DeviceContext,
    mediaRefs: string[],
    upload: (
      item: MediaQueueItem
    ) => Promise<{ status: 'UPLOADED' | 'SCANNING' | 'READY' | 'REJECTED' }>
  ) {
    const refs = new Set(mediaRefs);
    const foreign = this.items.find(
      (item) => refs.has(item.mediaId) && !sameContext(item.context, context)
    );
    if (foreign) throw new Error(`媒体 ${foreign.mediaId} 与当前设备会话不匹配，已停止上传。`);
    return this.uploadSelected(
      (item) => refs.has(item.mediaId) && sameContext(item.context, context),
      upload
    );
  }

  private async uploadSelected(
    select: (item: MediaQueueItem) => boolean,
    upload: (
      item: MediaQueueItem
    ) => Promise<{ status: 'UPLOADED' | 'SCANNING' | 'READY' | 'REJECTED' }>
  ) {
    for (const item of this.items.filter(
      (candidate) =>
        select(candidate) && ['PENDING', 'RETRY', 'PROCESSING'].includes(candidate.status)
    )) {
      item.status = 'UPLOADING';
      item.progress = 10;
      item.attempts += 1;
      await this.store.putMedia(item);
      try {
        const result = await upload(item);
        item.remoteStatus = result.status;
        item.status =
          result.status === 'READY'
            ? 'UPLOADED'
            : result.status === 'REJECTED'
              ? 'REJECTED'
              : 'PROCESSING';
        item.progress = result.status === 'READY' ? 100 : result.status === 'REJECTED' ? 0 : 70;
        item.errorMessage = undefined;
      } catch (error) {
        item.status = 'RETRY';
        item.progress = 0;
        item.errorMessage = error instanceof Error ? error.message : '媒体上传失败';
      }
      await this.store.putMedia(item);
    }
    this.items = await this.store.getMedia();
    return this.snapshot();
  }

  assertContext(context: DeviceContext) {
    const mismatch = this.items.find((item) => !sameContext(item.context, context));
    if (mismatch)
      throw new Error(`本地媒体 ${mismatch.mediaId} 与当前设备会话不匹配，已停止同步。`);
  }

  areReady(mediaRefs: string[]) {
    return mediaRefs.every(
      (mediaId) => this.items.find((item) => item.mediaId === mediaId)?.remoteStatus === 'READY'
    );
  }

  areReserved(mediaRefs: string[]) {
    return mediaRefs.every((mediaId) => {
      const status = this.items.find((item) => item.mediaId === mediaId)?.remoteStatus;
      return status === 'UPLOADED' || status === 'SCANNING' || status === 'READY';
    });
  }
}
