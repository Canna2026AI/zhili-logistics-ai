import type { DeviceTakeoverExportReceipt, MediaQueueItem, QueuedEvent } from '../domain/types';
import { canonicalize, sha256HexBlob, sha256HexBytes } from './package-codec';

export interface TakeoverScope {
  deviceId: string;
  tenantId: string;
  warehouseId: string;
  subjectId: string;
}

export interface TakeoverManifest {
  schemaVersion: 1;
  scope: TakeoverScope;
  eventCount: number;
  mediaCount: number;
  events: Array<{
    eventId: string;
    localSequence: number;
    idempotencyKey: string;
    mediaRefs: string[];
  }>;
  media: Array<{
    mediaId: string;
    eventId: string;
    contentHash: string;
    mimeType: string;
  }>;
}

function sameScope(left: TakeoverScope, right: TakeoverScope) {
  return (
    left.deviceId === right.deviceId &&
    left.tenantId === right.tenantId &&
    left.warehouseId === right.warehouseId &&
    left.subjectId === right.subjectId
  );
}

function exactStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function unique(values: string[]) {
  return new Set(values).size === values.length;
}

export async function hashTakeoverManifest(manifest: TakeoverManifest) {
  return sha256HexBytes(new TextEncoder().encode(canonicalize(manifest)));
}

export async function assertTakeoverManifestBinding(
  manifest: TakeoverManifest,
  expected: {
    manifestHash: string;
    scope: TakeoverScope;
    eventIds: string[];
    mediaIds: string[];
    eventCount: number;
    mediaCount: number;
  }
) {
  if (
    !manifest ||
    !Array.isArray(manifest.events) ||
    !Array.isArray(manifest.media) ||
    !manifest.scope
  ) {
    throw new Error('接管 manifest 结构无效，已保留全部数据。');
  }
  const manifestEventIds = manifest.events.map((entry) => entry.eventId);
  const manifestMediaIds = manifest.media.map((entry) => entry.mediaId);
  const localSequences = manifest.events.map((entry) => entry.localSequence);
  const idempotencyKeys = manifest.events.map((entry) => entry.idempotencyKey);
  const eventById = new Map(manifest.events.map((entry) => [entry.eventId, entry]));
  const mediaById = new Map(manifest.media.map((entry) => [entry.mediaId, entry]));
  if (
    manifest.schemaVersion !== 1 ||
    !sameScope(manifest.scope, expected.scope) ||
    manifest.eventCount !== manifest.events.length ||
    manifest.mediaCount !== manifest.media.length ||
    manifest.eventCount !== expected.eventCount ||
    manifest.mediaCount !== expected.mediaCount ||
    !unique(manifestEventIds) ||
    !unique(manifestMediaIds) ||
    !unique(idempotencyKeys) ||
    new Set(localSequences).size !== localSequences.length ||
    localSequences.some((value) => !Number.isSafeInteger(value)) ||
    manifest.events.some(
      (entry) =>
        typeof entry.eventId !== 'string' ||
        typeof entry.idempotencyKey !== 'string' ||
        !Array.isArray(entry.mediaRefs) ||
        !unique(entry.mediaRefs) ||
        entry.mediaRefs.some((mediaId) => mediaById.get(mediaId)?.eventId !== entry.eventId)
    ) ||
    manifest.media.some(
      (entry) =>
        typeof entry.mediaId !== 'string' ||
        typeof entry.eventId !== 'string' ||
        typeof entry.contentHash !== 'string' ||
        typeof entry.mimeType !== 'string' ||
        !eventById.get(entry.eventId)?.mediaRefs.includes(entry.mediaId)
    ) ||
    !exactStrings(manifestEventIds, expected.eventIds) ||
    !exactStrings(manifestMediaIds, expected.mediaIds) ||
    (await hashTakeoverManifest(manifest)) !== expected.manifestHash
  ) {
    throw new Error('接管 manifest 与本地精确清理清单不一致，已保留全部数据。');
  }
}

export async function assertTakeoverWorkMatchesManifest(
  receipt: DeviceTakeoverExportReceipt,
  manifest: TakeoverManifest,
  events: QueuedEvent[],
  media: MediaQueueItem[]
) {
  const eventIds = events.map((item) => item.envelope.eventId);
  const mediaIds = media.map((item) => item.mediaId);
  await assertTakeoverManifestBinding(manifest, {
    manifestHash: receipt.manifestHash,
    scope: receipt.scope,
    eventIds,
    mediaIds,
    eventCount: receipt.eventCount,
    mediaCount: receipt.mediaCount,
  });
  if (receipt.status !== 'VERIFIED' || !sameScope(receipt.scope, manifest.scope)) {
    throw new Error('接管回执未 VERIFIED 或作用域不匹配，已保留全部数据。');
  }

  const mediaById = new Map(media.map((item) => [item.mediaId, item]));
  const eventById = new Map(events.map((item) => [item.envelope.eventId, item]));
  for (let index = 0; index < manifest.events.length; index += 1) {
    const entry = manifest.events[index]!;
    const event = events[index];
    if (
      !event ||
      event.envelope.eventId !== entry.eventId ||
      event.envelope.localSequence !== entry.localSequence ||
      event.envelope.idempotencyKey !== entry.idempotencyKey ||
      !exactStrings(event.envelope.mediaRefs, entry.mediaRefs) ||
      !unique(entry.mediaRefs) ||
      !sameScope(event.envelope, manifest.scope) ||
      entry.mediaRefs.some((mediaId) => mediaById.get(mediaId)?.eventId !== entry.eventId)
    ) {
      throw new Error('接管事件与受信 manifest 条目不一致，已保留全部数据。');
    }
  }
  for (let index = 0; index < manifest.media.length; index += 1) {
    const entry = manifest.media[index]!;
    const item = media[index];
    const owner = eventById.get(entry.eventId);
    if (
      !item ||
      item.mediaId !== entry.mediaId ||
      item.eventId !== entry.eventId ||
      item.contentHash !== entry.contentHash ||
      item.mimeType !== entry.mimeType ||
      !sameScope(item.context, manifest.scope) ||
      !owner?.envelope.mediaRefs.includes(entry.mediaId) ||
      (await sha256HexBlob(item.blob)) !== entry.contentHash
    ) {
      throw new Error('接管媒体与受信 manifest 条目或真实字节不一致，已保留全部数据。');
    }
  }
}
