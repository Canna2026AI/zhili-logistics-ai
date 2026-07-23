import type { OfflineQueue } from '../offline/offline-queue';
import type { MediaQueue } from '../offline/media-queue';
import type { PdaPort } from '../ports/pda-port';
import { deviceTaskCacheKey } from '../tasks/task-cache';
import type { ConflictResolution, DeviceContext, DeviceTask, SyncResult } from '../domain/types';
import { PdaApiError } from '../ports/pda-port';

type ActiveSyncContext = DeviceContext & { expiresAt: string; permissions: string[] };

function key(...parts: Array<string | number>) {
  return `pda:${parts.join(':')}`;
}

function expectedDeliveryStatus(action: string) {
  if (action === 'LAST_MILE_PALLETIZE') return 'PALLETIZED';
  if (action === 'LAST_MILE_LOAD') return 'LOADED';
  if (action === 'LAST_MILE_DELIVER') return 'OUT_FOR_DELIVERY';
  if (action === 'LAST_MILE_EXCEPTION') return 'EXCEPTION';
  if (action === 'CAPTURE_POD') return 'COMPLETED';
  return undefined;
}

function assertExactSyncBatch(events: Array<{ eventId: string }>, results: SyncResult[]) {
  const expected = events.map((event) => event.eventId);
  const actual = results.map((result) => result.eventId);
  if (
    actual.length !== expected.length ||
    new Set(actual).size !== actual.length ||
    actual.some((eventId) => !expected.includes(eventId)) ||
    expected.some((eventId) => !actual.includes(eventId))
  ) {
    throw new Error('服务器同步批次回执未精确覆盖本次事件 ID，已保留全部本地作业。');
  }
}

function assertTaskSnapshot(tasks: DeviceTask[]) {
  if (
    !Array.isArray(tasks) ||
    new Set(tasks.map((task) => task.id)).size !== tasks.length ||
    tasks.some(
      (task) =>
        typeof task.id !== 'string' ||
        task.id.length === 0 ||
        typeof task.reference !== 'string' ||
        task.reference.length === 0 ||
        !Number.isSafeInteger(task.version) ||
        task.version < 1
    )
  ) {
    throw new Error('服务器设备任务快照包含重复 ID 或无效权威版本。');
  }
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
      .filter((event) => this.media.areReserved(event.envelope.mediaRefs))
      .sort((left, right) => left.envelope.localSequence - right.envelope.localSequence);
    const total = { applied: 0, duplicate: 0, conflict: 0, rejected: 0 };
    let authoritativeTasks: DeviceTask[] | undefined;
    for (let index = 0; index < pending.length; index += 100) {
      const events = pending.slice(index, index + 100).map((event) => event.envelope);
      if (events.length === 0) continue;
      const results: SyncResult[] = await this.port.syncDeviceEvents(
        events,
        key('sync', context.deviceId, ...events.map((event) => event.idempotencyKey))
      );
      assertExactSyncBatch(events, results);
      const succeeded = new Set(
        results
          .filter(
            (result) => result.disposition === 'APPLIED' || result.disposition === 'DUPLICATE'
          )
          .map((result) => result.eventId)
      );
      const deliveryEvents = events.filter(
        (event) => succeeded.has(event.eventId) && expectedDeliveryStatus(event.action)
      );
      const gatedDeliveryIds = new Set(deliveryEvents.map((event) => event.eventId));
      let deferredError: unknown;
      const rememberError = (error: unknown) => {
        deferredError ??= error;
      };
      const applyIndependently = async (candidates: SyncResult[]) => {
        for (const result of candidates) {
          try {
            const applied = await this.queue.applySyncResults([result]);
            total.applied += applied.applied;
            total.duplicate += applied.duplicate;
            total.conflict += applied.conflict;
            total.rejected += applied.rejected;
          } catch (error) {
            rememberError(error);
          }
        }
      };

      await applyIndependently(results.filter((result) => !gatedDeliveryIds.has(result.eventId)));

      if (deliveryEvents.length > 0) {
        let refreshed: DeviceTask[] | undefined;
        try {
          refreshed = await this.port.getDeviceTasks(context.deviceId);
          assertTaskSnapshot(refreshed);
          await this.queue.setMeta(deviceTaskCacheKey(context), refreshed);
          authoritativeTasks = refreshed;
        } catch (error) {
          refreshed = undefined;
          rememberError(error);
        }

        if (refreshed) {
          for (const event of deliveryEvents) {
            const taskId = event.payload.taskId;
            const matches = refreshed.filter((task) => task.id === taskId);
            const task = matches[0];
            const expected = expectedDeliveryStatus(event.action);
            if (
              typeof taskId !== 'string' ||
              matches.length !== 1 ||
              !task ||
              task.reference !== event.entityRef ||
              task.type !== 'LAST_MILE_DELIVERY' ||
              task.status !== expected ||
              task.version <= event.baseVersion
            ) {
              rememberError(
                new Error(
                  `离线尾程事件 ${event.eventId} 未取得唯一且已推进的权威任务快照，已保留本地作业。`
                )
              );
              continue;
            }
            const result = results.find((candidate) => candidate.eventId === event.eventId);
            if (result) await applyIndependently([result]);
          }
        }
      }
      await this.media.restore();
      if (deferredError !== undefined) throw deferredError;
    }
    return {
      ...total,
      authoritativeTasks,
      mediaReserved: mediaResult.filter((item) =>
        ['UPLOADED', 'SCANNING', 'READY'].includes(item.remoteStatus ?? '')
      ).length,
      mediaPending: mediaResult.filter(
        (item) => !['UPLOADED', 'SCANNING', 'READY'].includes(item.remoteStatus ?? '')
      ).length,
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
        if (error instanceof PdaApiError) {
          throw new PdaApiError(
            `${error.message}；服务器版本再次变化，已刷新差异，处理原因已保留，请复核后重试。`,
            error.status,
            error.code,
            error.requestId,
            error.remediation,
            error.details
          );
        }
        throw error;
      }
      throw error;
    }
    if (
      server.id !== event.conflict.conflictId ||
      server.status !== 'RESOLVED' ||
      !Number.isSafeInteger(server.serverVersion) ||
      server.serverVersion < snapshot.conflict.serverVersion ||
      !Number.isSafeInteger(server.version) ||
      server.version <= snapshot.conflict.version
    ) {
      throw new Error('服务器冲突处理回执与本地事件、冲突 ID 或权威版本不一致，已保留本地作业。');
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
