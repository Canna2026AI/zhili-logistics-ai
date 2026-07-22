import type {
  DeviceContext,
  QueueSnapshot,
  QueuedEvent,
  SyncResult,
  EnqueueOutcome,
  MediaQueueItem,
} from '../domain/types';
import type { QueueStore } from './queue-store';

const DEFAULT_LIMIT = 200;
const DEFAULT_WARNING = 183;

export class QueueCapacityError extends Error {
  constructor() {
    super('离线队列已满，请先同步；管理员加密接管契约未完成，当前禁止导出。');
    this.name = 'QueueCapacityError';
  }
}

interface QueueOptions {
  now?: () => Date;
  createId?: (sequence: number) => string;
  limit?: number;
  warningAt?: number;
}

export interface EnqueueCommand {
  eventId?: string;
  action: string;
  entityRef: string;
  payload: Record<string, unknown>;
  mediaRefs: string[];
  baseVersion: number;
  idempotencyKey?: string;
  intentId?: string;
  mediaItems?: MediaQueueItem[];
}

function defaultId(sequence: number) {
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase();
  return `01J${random}${String(sequence).padStart(7, '0')}`.slice(0, 26);
}

export class OfflineQueue {
  private events: QueuedEvent[] = [];
  private nextSequence = 1;
  private readonly now: () => Date;
  private readonly createId: (sequence: number) => string;
  private readonly limit: number;
  private readonly warningAt: number;
  private enqueueLock: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: QueueStore,
    options: QueueOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? defaultId;
    this.limit = options.limit ?? DEFAULT_LIMIT;
    this.warningAt = options.warningAt ?? DEFAULT_WARNING;
  }

  async restore(): Promise<QueueSnapshot> {
    [this.events, this.nextSequence] = await Promise.all([
      this.store.getEvents(),
      this.store.getNextSequence(),
    ]);
    const highest = Math.max(0, ...this.events.map((event) => event.envelope.localSequence));
    this.nextSequence = Math.max(this.nextSequence, highest + 1);
    return this.snapshot();
  }

  snapshot(): QueueSnapshot {
    return {
      events: [...this.events],
      media: [],
      warning: this.events.length >= this.warningAt,
      full: this.events.length >= this.limit,
    };
  }

  async enqueue(context: DeviceContext, command: EnqueueCommand): Promise<EnqueueOutcome> {
    const operation = this.enqueueLock.then(() => this.enqueueUnlocked(context, command));
    this.enqueueLock = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  }

  private async enqueueUnlocked(
    context: DeviceContext,
    command: EnqueueCommand
  ): Promise<EnqueueOutcome> {
    const occurredAt = this.now().toISOString();
    const localDedupeKey = `scan:${context.deviceId}:${context.warehouseId}:${command.action}:${command.entityRef}:${command.baseVersion}:${JSON.stringify(command.payload)}`;
    const intentId = command.intentId ?? crypto.randomUUID();
    const stableKey =
      command.idempotencyKey ??
      `pda:intent:${context.deviceId}:${command.action}:${command.entityRef}:${command.baseVersion}:${JSON.stringify(command.payload)}:${intentId}`;
    let appended: { event: QueuedEvent; duplicate: boolean };
    try {
      appended = await this.store.appendEvent(
        (sequence) => ({
          envelope: {
            eventId: command.eventId ?? this.createId(sequence),
            deviceId: context.deviceId,
            localSequence: sequence,
            tenantId: context.tenantId,
            warehouseId: context.warehouseId,
            subjectId: context.subjectId,
            action: command.action,
            entityRef: command.entityRef,
            payload: command.payload,
            mediaRefs: command.mediaRefs,
            baseVersion: command.baseVersion,
            idempotencyKey: stableKey,
            occurredAt,
            timezone: context.timezone,
            appVersion: context.appVersion,
          },
          state: 'PENDING',
        }),
        localDedupeKey,
        this.limit,
        command.mediaItems ?? []
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'QUEUE_CAPACITY')
        throw new QueueCapacityError();
      throw error;
    }
    this.events = await this.store.getEvents();
    this.nextSequence = await this.store.getNextSequence();
    return { ...appended.event, enqueueDisposition: appended.duplicate ? 'DUPLICATE' : 'QUEUED' };
  }

  async applySyncResults(results: SyncResult[]) {
    const counts = { applied: 0, duplicate: 0, conflict: 0, rejected: 0 };
    for (const result of results) {
      const event = this.events.find((candidate) => candidate.envelope.eventId === result.eventId);
      if (!event) continue;
      if (result.disposition === 'APPLIED' || result.disposition === 'DUPLICATE') {
        counts[result.disposition === 'APPLIED' ? 'applied' : 'duplicate'] += 1;
        await this.store.deleteEvent(result.eventId);
        await this.store.setMeta('sync-cursor', {
          localSequence: event.envelope.localSequence,
          serverVersion: result.serverVersion,
          disposition: result.disposition,
        });
        continue;
      }
      if (result.disposition === 'CONFLICT') {
        counts.conflict += 1;
        event.state = 'CONFLICT';
        event.conflict = {
          conflictId: result.conflictId ?? result.eventId,
          serverVersion: result.serverVersion ?? event.envelope.baseVersion + 1,
          version: result.conflictVersion ?? 1,
          snapshotNotice:
            '当前同步契约未返回服务器字段快照；仅可核对真实 serverVersion/conflictId，完整 diff 需后端扩展。',
        };
      } else {
        counts.rejected += 1;
        event.state = 'REJECTED';
        event.errorCode = result.errorCode;
        event.errorMessage = result.errorMessage;
      }
      await this.store.putEvent(event);
    }
    this.events = await this.store.getEvents();
    return counts;
  }

  async resolveLocalConflict(eventId: string, resolution: string, serverVersion: number) {
    const event = this.events.find((candidate) => candidate.envelope.eventId === eventId);
    if (!event) return;
    const resolved =
      (await this.store.getMeta<Array<Record<string, unknown>>>('resolved-conflicts')) ?? [];
    await this.store.setMeta('resolved-conflicts', [
      ...resolved,
      {
        eventId,
        conflictId: event.conflict?.conflictId,
        resolution,
        serverVersion,
        resolvedAt: this.now().toISOString(),
      },
    ]);
    await this.store.deleteEvent(eventId);
    this.events = await this.store.getEvents();
  }

  async updateConflictSnapshot(
    eventId: string,
    snapshot: {
      serverVersion: number;
      serverState: Record<string, unknown>;
      differences: Array<{ field: string; local: string; server: string; impact?: string }>;
      version: number;
      etag: string;
    }
  ) {
    const event = this.events.find((candidate) => candidate.envelope.eventId === eventId);
    if (!event?.conflict) return;
    event.conflict = {
      ...event.conflict,
      ...snapshot,
      snapshotNotice: undefined,
    };
    await this.store.putEvent(event);
    this.events = await this.store.getEvents();
  }

  async retryRejected(eventId: string) {
    const event = this.events.find((candidate) => candidate.envelope.eventId === eventId);
    if (!event) return;
    event.state = 'PENDING';
    event.errorCode = undefined;
    event.errorMessage = undefined;
    await this.store.putEvent(event);
    this.events = await this.store.getEvents();
  }

  async exportQueue() {
    throw new Error('明文队列导出已禁用；等待服务器管理员授权与加密接管包契约。');
  }

  async clear() {
    await Promise.all([this.store.clearEvents(), this.store.clearMedia()]);
    this.events = [];
  }

  async deleteWork(eventId: string) {
    const event = this.events.find((candidate) => candidate.envelope.eventId === eventId);
    if (!event) return;
    await this.store.deleteWork(eventId, event.envelope.mediaRefs);
    this.events = await this.store.getEvents();
  }

  assertContext(context: DeviceContext) {
    const mismatch = this.events.find(
      (event) =>
        event.envelope.deviceId !== context.deviceId ||
        event.envelope.tenantId !== context.tenantId ||
        event.envelope.warehouseId !== context.warehouseId ||
        event.envelope.subjectId !== context.subjectId
    );
    if (mismatch)
      throw new Error(
        `本地事件 #${mismatch.envelope.localSequence} 与当前设备会话不匹配，已停止同步。`
      );
  }

  getMeta<T>(key: string) {
    return this.store.getMeta<T>(key);
  }

  setMeta<T>(key: string, value: T) {
    return this.store.setMeta(key, value);
  }
}
