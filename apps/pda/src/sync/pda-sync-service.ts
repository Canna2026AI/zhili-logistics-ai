import type { OfflineQueue } from '../offline/offline-queue';
import type { MediaQueue } from '../offline/media-queue';
import type { PdaPort } from '../ports/pda-port';
import type { ConflictResolution, DeviceContext, SyncResult } from '../domain/types';

type ActiveSyncContext = DeviceContext & { expiresAt: string; permissions: string[] };

function key(...parts: Array<string | number>) {
  return `pda:${parts.join(':')}`;
}

export class PdaSyncService {
  constructor(
    private readonly queue: OfflineQueue,
    private readonly media: MediaQueue,
    private readonly port: PdaPort
  ) {}

  getEvent(eventId: string) {
    return this.queue.snapshot().events.find((event) => event.envelope.eventId === eventId);
  }

  async synchronize(context: ActiveSyncContext) {
    if (new Date(context.expiresAt).getTime() <= Date.now())
      throw new Error('会话已过期，禁止同步。');
    if (!context.permissions.includes('pda.sync'))
      throw new Error('缺少 pda.sync 权限，禁止同步。');
    this.queue.assertContext(context);
    this.media.assertContext(context);
    const referencedMedia = [
      ...new Set(this.queue.snapshot().events.flatMap((event) => event.envelope.mediaRefs)),
    ];
    const mediaResult = await this.media.uploadRefs(context, referencedMedia, async (item) => {
      return this.port.uploadDeviceMedia(
        context.deviceId,
        {
          eventId: item.eventId,
          mediaId: item.mediaId,
          contentHash: item.contentHash,
          file: item.blob,
        },
        key('media', item.mediaId, item.contentHash)
      );
    });

    const pending = this.queue
      .snapshot()
      .events.filter((event) => event.state === 'PENDING')
      .filter((event) => this.media.areReady(event.envelope.mediaRefs))
      .sort((left, right) => left.envelope.localSequence - right.envelope.localSequence);
    const total = { applied: 0, duplicate: 0, conflict: 0, rejected: 0 };
    for (let index = 0; index < pending.length; index += 100) {
      const events = pending.slice(index, index + 100).map((event) => event.envelope);
      if (events.length === 0) continue;
      const results: SyncResult[] = await this.port.syncDeviceEvents(
        events,
        key('sync', context.deviceId, ...events.map((event) => event.idempotencyKey))
      );
      const batch = await this.queue.applySyncResults(results);
      total.applied += batch.applied;
      total.duplicate += batch.duplicate;
      total.conflict += batch.conflict;
      total.rejected += batch.rejected;
    }
    return {
      ...total,
      mediaUploaded: mediaResult.filter((item) => item.status === 'UPLOADED').length,
      mediaPending: mediaResult.filter((item) => item.status !== 'UPLOADED').length,
    };
  }

  async resolveConflict(
    eventId: string,
    resolution: ConflictResolution['resolution'],
    reason: string
  ) {
    if (Array.from(reason.trim()).length < 5) throw new Error('冲突处理原因至少 5 个字符。');
    const event = this.queue
      .snapshot()
      .events.find((candidate) => candidate.envelope.eventId === eventId);
    if (!event?.conflict) throw new Error('冲突已更新或不存在，请刷新队列。');
    const snapshot = await this.loadConflict(eventId);
    let server;
    try {
      server = await this.port.resolveDeviceConflict(
        event.conflict.conflictId,
        snapshot.etag,
        key(
          'resolve',
          event.conflict.conflictId,
          event.conflict.version,
          snapshot.etag,
          resolution
        ),
        { resolution, reason: reason.trim() }
      );
    } catch (error) {
      const status =
        typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
      if (status === 409) {
        await this.loadConflict(eventId);
        throw new Error('服务器版本再次变化，已刷新差异；处理原因已保留，请复核后重试。');
      }
      throw error;
    }
    await this.queue.resolveLocalConflict(eventId, resolution, server.serverVersion);
    return server;
  }

  async loadConflict(eventId: string) {
    const event = this.queue
      .snapshot()
      .events.find((candidate) => candidate.envelope.eventId === eventId);
    if (!event?.conflict) throw new Error('冲突已更新或不存在，请刷新队列。');
    const snapshot = await this.port.getDeviceConflict(event.conflict.conflictId);
    await this.queue.updateConflictSnapshot(eventId, {
      serverVersion: snapshot.conflict.serverVersion,
      serverState: snapshot.conflict.serverState,
      differences: snapshot.conflict.differences.map((difference) => ({
        field: difference.field,
        local: difference.localValue,
        server: difference.serverValue,
        impact: difference.impact,
      })),
      version: snapshot.conflict.version,
      etag: snapshot.etag,
    });
    return snapshot;
  }
}
