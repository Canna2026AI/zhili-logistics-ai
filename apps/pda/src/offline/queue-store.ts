import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DeviceTakeoverExportReceipt, MediaQueueItem, QueuedEvent } from '../domain/types';
import { readBlobBytes } from './blob-bytes';

export interface QueueStore {
  getEvents(): Promise<QueuedEvent[]>;
  putEvent(event: QueuedEvent): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
  clearEvents(): Promise<void>;
  getMedia(): Promise<MediaQueueItem[]>;
  putMedia(item: MediaQueueItem): Promise<void>;
  deleteMedia(mediaId: string): Promise<void>;
  clearMedia(): Promise<void>;
  clearWork(): Promise<void>;
  getNextSequence(): Promise<number>;
  setNextSequence(value: number): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta<T>(key: string, value: T): Promise<void>;
  deleteMeta(key: string): Promise<void>;
  deleteWork(eventId: string, mediaIds: string[]): Promise<void>;
  deleteWorkPackage(eventIds: string[], mediaIds: string[]): Promise<void>;
  finalizeTakeoverPackage(
    receipt: DeviceTakeoverExportReceipt,
    eventIds: string[],
    mediaIds: string[]
  ): Promise<void>;
  appendEvent(
    create: (sequence: number) => QueuedEvent,
    dedupeKey: string,
    limit: number,
    mediaItems?: MediaQueueItem[]
  ): Promise<{ event: QueuedEvent; duplicate: boolean }>;
}

export class MemoryQueueStore implements QueueStore {
  private readonly events = new Map<string, QueuedEvent>();
  private readonly eventDedupe = new Map<string, string>();
  private readonly media = new Map<string, MediaQueueItem>();
  private nextSequence = 1;
  private readonly meta = new Map<string, unknown>();
  private appendLock: Promise<void> = Promise.resolve();

  async getEvents() {
    return [...this.events.values()].sort(
      (left, right) => left.envelope.localSequence - right.envelope.localSequence
    );
  }

  async putEvent(event: QueuedEvent) {
    for (const existing of this.events.values()) {
      if (
        existing.envelope.idempotencyKey === event.envelope.idempotencyKey &&
        existing.envelope.eventId !== event.envelope.eventId
      ) {
        return;
      }
    }
    this.events.set(event.envelope.eventId, event);
  }

  async deleteEvent(eventId: string) {
    this.events.delete(eventId);
    this.eventDedupe.delete(eventId);
  }

  async clearEvents() {
    this.events.clear();
    this.eventDedupe.clear();
  }

  async getMedia() {
    return [...this.media.values()];
  }

  async putMedia(item: MediaQueueItem) {
    this.media.set(item.mediaId, item);
  }

  async deleteMedia(mediaId: string) {
    this.media.delete(mediaId);
  }

  async clearMedia() {
    this.media.clear();
  }

  async clearWork() {
    this.events.clear();
    this.eventDedupe.clear();
    this.media.clear();
  }

  async getNextSequence() {
    return this.nextSequence;
  }

  async setNextSequence(value: number) {
    this.nextSequence = value;
  }

  async getMeta<T>(key: string) {
    return this.meta.get(key) as T | undefined;
  }

  async setMeta<T>(key: string, value: T) {
    this.meta.set(key, value);
  }

  async deleteMeta(key: string) {
    this.meta.delete(key);
  }

  async deleteWork(eventId: string, mediaIds: string[]) {
    this.events.delete(eventId);
    this.eventDedupe.delete(eventId);
    for (const mediaId of mediaIds) this.media.delete(mediaId);
  }

  async deleteWorkPackage(eventIds: string[], mediaIds: string[]) {
    for (const eventId of eventIds) {
      this.events.delete(eventId);
      this.eventDedupe.delete(eventId);
    }
    for (const mediaId of mediaIds) this.media.delete(mediaId);
  }

  async finalizeTakeoverPackage(
    receipt: DeviceTakeoverExportReceipt,
    eventIds: string[],
    mediaIds: string[]
  ) {
    if (
      receipt.status !== 'VERIFIED' ||
      receipt.eventCount !== eventIds.length ||
      receipt.mediaCount !== mediaIds.length ||
      new Set(eventIds).size !== eventIds.length ||
      new Set(mediaIds).size !== mediaIds.length ||
      eventIds.some((eventId) => !this.events.has(eventId)) ||
      mediaIds.some((mediaId) => !this.media.has(mediaId))
    ) {
      throw new Error('接管清理清单无效，已保留回执与全部本地数据。');
    }
    this.meta.set('last-takeover-export-receipt', receipt);
    this.meta.delete('pending-takeover-finalize');
    this.meta.delete('pending-takeover-upload');
    for (const eventId of eventIds) {
      this.events.delete(eventId);
      this.eventDedupe.delete(eventId);
    }
    for (const mediaId of mediaIds) this.media.delete(mediaId);
  }

  async appendEvent(
    create: (sequence: number) => QueuedEvent,
    dedupeKey: string,
    limit: number,
    mediaItems: MediaQueueItem[] = []
  ) {
    let result!: { event: QueuedEvent; duplicate: boolean };
    const operation = this.appendLock.then(async () => {
      const duplicateId = [...this.eventDedupe].find(([, value]) => value === dedupeKey)?.[0];
      const duplicate = duplicateId ? this.events.get(duplicateId) : undefined;
      if (duplicate) {
        result = { event: duplicate, duplicate: true };
        return;
      }
      if (this.events.size >= limit) throw new Error('QUEUE_CAPACITY');
      const event = create(this.nextSequence);
      this.events.set(event.envelope.eventId, event);
      this.eventDedupe.set(event.envelope.eventId, dedupeKey);
      for (const item of mediaItems) this.media.set(item.mediaId, item);
      this.nextSequence += 1;
      result = { event, duplicate: false };
    });
    this.appendLock = operation.then(
      () => undefined,
      () => undefined
    );
    await operation;
    return result;
  }
}

interface CipherRecord {
  iv: number[];
  ciphertext: ArrayBuffer;
}

export interface QueueCodec {
  encode(value: unknown): Promise<CipherRecord>;
  decode<T>(value: CipherRecord): Promise<T>;
}

export class WebCryptoQueueCodec implements QueueCodec {
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  constructor(readonly key: CryptoKey) {}

  static async generate() {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    return new WebCryptoQueueCodec(key);
  }

  async encode(value: unknown): Promise<CipherRecord> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = this.encoder.encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, bytes);
    return { iv: [...iv], ciphertext };
  }

  async decode<T>(value: CipherRecord): Promise<T> {
    const bytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(value.iv) },
      this.key,
      value.ciphertext
    );
    return JSON.parse(this.decoder.decode(bytes)) as T;
  }
}

interface StoredEncryptedRecord {
  id: string;
  dedupeHash?: string;
  value: CipherRecord;
}

interface PdaQueueDatabase extends DBSchema {
  events: {
    key: string;
    value: StoredEncryptedRecord;
    indexes: { 'by-dedupe': string };
  };
  media: { key: string; value: StoredEncryptedRecord };
  meta: { key: string; value: StoredEncryptedRecord };
  keys: { key: string; value: CryptoKey };
  counters: { key: string; value: number };
}

type SerializableMedia = Omit<MediaQueueItem, 'blob'> & { fileBytes: number[] };

async function hashKey(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class IndexedDbQueueStore implements QueueStore {
  private readonly database: Promise<IDBPDatabase<PdaQueueDatabase>>;
  private codecPromise?: Promise<QueueCodec>;

  protected beforeFinalizeCommit(_abort: () => void) {
    void _abort;
  }

  constructor(
    readonly databaseName = 'zhili-pda-offline-v1',
    codec?: QueueCodec
  ) {
    this.database = openDB<PdaQueueDatabase>(databaseName, 2, {
      upgrade(database) {
        if (!database.objectStoreNames.contains('events')) {
          const eventStore = database.createObjectStore('events', { keyPath: 'id' });
          eventStore.createIndex('by-dedupe', 'dedupeHash', { unique: true });
          database.createObjectStore('media', { keyPath: 'id' });
          database.createObjectStore('meta', { keyPath: 'id' });
          database.createObjectStore('keys');
        }
        if (!database.objectStoreNames.contains('counters')) database.createObjectStore('counters');
      },
    });
    if (codec) this.codecPromise = Promise.resolve(codec);
  }

  private async codec() {
    if (!this.codecPromise) {
      this.codecPromise = (async () => {
        const database = await this.database;
        let key = await database.get('keys', 'queue-key');
        if (!key) {
          const [eventCount, mediaCount, metaCount] = await Promise.all([
            database.count('events'),
            database.count('media'),
            database.count('meta'),
          ]);
          if (eventCount + mediaCount + metaCount > 0) {
            throw new Error('本地加密密钥缺失，已停止读取且不会覆盖原数据；请联系管理员恢复。');
          }
          const generated = await WebCryptoQueueCodec.generate();
          key = generated.key;
          await database.put('keys', key, 'queue-key');
        }
        return new WebCryptoQueueCodec(key);
      })();
    }
    return this.codecPromise;
  }

  async getEvents() {
    const [database, codec] = await Promise.all([this.database, this.codec()]);
    const records = await database.getAll('events');
    const events = await Promise.all(
      records.map((record) => codec.decode<QueuedEvent>(record.value))
    );
    return events.sort((left, right) => left.envelope.localSequence - right.envelope.localSequence);
  }

  async putEvent(event: QueuedEvent) {
    const [database, codec, fallbackHash] = await Promise.all([
      this.database,
      this.codec(),
      hashKey(event.envelope.idempotencyKey),
    ]);
    const encrypted = await codec.encode(event);
    const transaction = database.transaction('events', 'readwrite');
    const eventStore = transaction.objectStore('events');
    const stored = await eventStore.get(event.envelope.eventId);
    const dedupeHash = stored?.dedupeHash ?? fallbackHash;
    const existing = await eventStore.index('by-dedupe').get(dedupeHash);
    if (existing && existing.id !== event.envelope.eventId) {
      await transaction.done;
      return;
    }
    await eventStore.put({
      id: event.envelope.eventId,
      dedupeHash,
      value: encrypted,
    });
    await transaction.done;
  }

  async deleteEvent(eventId: string) {
    await (await this.database).delete('events', eventId);
  }

  async clearEvents() {
    await (await this.database).clear('events');
  }

  async getMedia() {
    const [database, codec] = await Promise.all([this.database, this.codec()]);
    const records = await database.getAll('media');
    return Promise.all(
      records.map(async (record) => {
        const stored = await codec.decode<SerializableMedia>(record.value);
        const { fileBytes, ...item } = stored;
        return { ...item, blob: new Blob([new Uint8Array(fileBytes)], { type: item.mimeType }) };
      })
    );
  }

  async putMedia(item: MediaQueueItem) {
    const [database, codec, bytes] = await Promise.all([
      this.database,
      this.codec(),
      readBlobBytes(item.blob),
    ]);
    const metadata: Omit<MediaQueueItem, 'blob'> = {
      mediaId: item.mediaId,
      eventId: item.eventId,
      contentHash: item.contentHash,
      mimeType: item.mimeType,
      status: item.status,
      remoteStatus: item.remoteStatus,
      progress: item.progress,
      attempts: item.attempts,
      errorMessage: item.errorMessage,
      context: item.context,
    };
    const value: SerializableMedia = {
      ...metadata,
      fileBytes: [...new Uint8Array(bytes)],
    };
    await database.put('media', { id: item.mediaId, value: await codec.encode(value) });
  }

  async deleteMedia(mediaId: string) {
    await (await this.database).delete('media', mediaId);
  }

  async clearMedia() {
    await (await this.database).clear('media');
  }

  async clearWork() {
    const database = await this.database;
    const transaction = database.transaction(['events', 'media'], 'readwrite');
    await Promise.all([
      transaction.objectStore('events').clear(),
      transaction.objectStore('media').clear(),
    ]);
    await transaction.done;
  }

  async getNextSequence() {
    const database = await this.database;
    const counter = await database.get('counters', 'next-sequence');
    if (counter !== undefined) return counter;
    const codec = await this.codec();
    const record = await database.get('meta', 'next-sequence');
    return record ? codec.decode<number>(record.value) : 1;
  }

  async setNextSequence(value: number) {
    await (await this.database).put('counters', value, 'next-sequence');
  }

  async getMeta<T>(key: string) {
    const [database, codec] = await Promise.all([this.database, this.codec()]);
    const record = await database.get('meta', key);
    return record ? codec.decode<T>(record.value) : undefined;
  }

  async setMeta<T>(key: string, value: T) {
    const [database, codec] = await Promise.all([this.database, this.codec()]);
    await database.put('meta', { id: key, value: await codec.encode(value) });
  }

  async deleteMeta(key: string) {
    await (await this.database).delete('meta', key);
  }

  async deleteWork(eventId: string, mediaIds: string[]) {
    const database = await this.database;
    const transaction = database.transaction(['events', 'media'], 'readwrite');
    await Promise.all([
      transaction.objectStore('events').delete(eventId),
      ...mediaIds.map((mediaId) => transaction.objectStore('media').delete(mediaId)),
    ]);
    await transaction.done;
  }

  async deleteWorkPackage(eventIds: string[], mediaIds: string[]) {
    const database = await this.database;
    const transaction = database.transaction(['events', 'media'], 'readwrite');
    await Promise.all([
      ...eventIds.map((eventId) => transaction.objectStore('events').delete(eventId)),
      ...mediaIds.map((mediaId) => transaction.objectStore('media').delete(mediaId)),
    ]);
    await transaction.done;
  }

  async finalizeTakeoverPackage(
    receipt: DeviceTakeoverExportReceipt,
    eventIds: string[],
    mediaIds: string[]
  ) {
    if (
      receipt.status !== 'VERIFIED' ||
      receipt.eventCount !== eventIds.length ||
      receipt.mediaCount !== mediaIds.length ||
      new Set(eventIds).size !== eventIds.length ||
      new Set(mediaIds).size !== mediaIds.length
    ) {
      throw new Error('接管清理清单无效，已保留回执与全部本地数据。');
    }
    const [database, codec] = await Promise.all([this.database, this.codec()]);
    const encryptedReceipt = await codec.encode(receipt);
    const transaction = database.transaction(['meta', 'events', 'media'], 'readwrite');
    const eventStore = transaction.objectStore('events');
    const mediaStore = transaction.objectStore('media');
    const [events, media] = await Promise.all([
      Promise.all(eventIds.map((eventId) => eventStore.get(eventId))),
      Promise.all(mediaIds.map((mediaId) => mediaStore.get(mediaId))),
    ]);
    if (events.some((event) => !event) || media.some((item) => !item)) {
      transaction.abort();
      try {
        await transaction.done;
      } catch {
        /* expected abort: no receipt or work-package change is committed */
      }
      throw new Error('接管清理清单无效，已保留回执与全部本地数据。');
    }
    const mutations = [
      transaction.objectStore('meta').put({
        id: 'last-takeover-export-receipt',
        value: encryptedReceipt,
      }),
      transaction.objectStore('meta').delete('pending-takeover-finalize'),
      transaction.objectStore('meta').delete('pending-takeover-upload'),
      ...eventIds.map((eventId) => eventStore.delete(eventId)),
      ...mediaIds.map((mediaId) => mediaStore.delete(mediaId)),
    ];
    this.beforeFinalizeCommit(() => transaction.abort());
    try {
      await Promise.all(mutations);
      await transaction.done;
    } catch (error) {
      try {
        await transaction.done;
      } catch {
        /* consume the transaction abort after preserving the original failure */
      }
      throw error;
    }
  }

  async appendEvent(
    create: (sequence: number) => QueuedEvent,
    dedupeKey: string,
    limit: number,
    mediaItems: MediaQueueItem[] = []
  ) {
    const [database, codec, dedupeHash] = await Promise.all([
      this.database,
      this.codec(),
      hashKey(dedupeKey),
    ]);
    for (;;) {
      const candidate = await this.getNextSequence();
      const event = create(candidate);
      const encrypted = await codec.encode(event);
      const encryptedMedia = await Promise.all(
        mediaItems.map(async (item) => {
          const bytes = await readBlobBytes(item.blob);
          const value: SerializableMedia = {
            mediaId: item.mediaId,
            eventId: item.eventId,
            contentHash: item.contentHash,
            mimeType: item.mimeType,
            status: item.status,
            remoteStatus: item.remoteStatus,
            progress: item.progress,
            attempts: item.attempts,
            errorMessage: item.errorMessage,
            context: item.context,
            fileBytes: [...new Uint8Array(bytes)],
          };
          return { id: item.mediaId, value: await codec.encode(value) };
        })
      );
      const transaction = database.transaction(['events', 'counters', 'media'], 'readwrite');
      const eventStore = transaction.objectStore('events');
      const counterStore = transaction.objectStore('counters');
      const [current, duplicate, count] = await Promise.all([
        counterStore.get('next-sequence'),
        eventStore.index('by-dedupe').get(dedupeHash),
        eventStore.count(),
      ]);
      if (duplicate) {
        await transaction.done;
        return { event: await codec.decode<QueuedEvent>(duplicate.value), duplicate: true };
      }
      if (count >= limit) {
        transaction.abort();
        try {
          await transaction.done;
        } catch {
          /* expected abort */
        }
        throw new Error('QUEUE_CAPACITY');
      }
      if (current !== undefined && current !== candidate) {
        transaction.abort();
        try {
          await transaction.done;
        } catch {
          /* retry with the winning sequence */
        }
        continue;
      }
      await Promise.all([
        eventStore.put({ id: event.envelope.eventId, dedupeHash, value: encrypted }),
        counterStore.put(candidate + 1, 'next-sequence'),
        ...encryptedMedia.map((item) => transaction.objectStore('media').put(item)),
      ]);
      await transaction.done;
      return { event, duplicate: false };
    }
  }

  close() {
    void this.database.then((database) => database.close());
  }

  async inspectEncryptedRecordsForTest() {
    const database = await this.database;
    return {
      events: await database.getAll('events'),
      media: await database.getAll('media'),
      meta: await database.getAll('meta'),
    };
  }

  async deleteStoredKeyForTest() {
    await (await this.database).delete('keys', 'queue-key');
    this.codecPromise = undefined;
  }
}
