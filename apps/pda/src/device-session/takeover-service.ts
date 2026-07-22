import type {
  DeviceContext,
  DeviceTakeoverExportReceipt,
  MediaQueueItem,
  QueuedEvent,
} from '../domain/types';
import type { MediaQueue } from '../offline/media-queue';
import type { OfflineQueue } from '../offline/offline-queue';
import { readBlobBytes } from '../offline/blob-bytes';
import type { PdaPort } from '../ports/pda-port';
import type { LocalDeviceSession } from '../session/session-guard';
import { decodeBase64 } from '../takeover/package-codec';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: Uint8Array) {
  return toHex(await crypto.subtle.digest('SHA-256', Uint8Array.from(value)));
}

function base64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

type TakeoverScope = Pick<DeviceContext, 'deviceId' | 'tenantId' | 'warehouseId' | 'subjectId'>;

function sameScope(left: TakeoverScope, right: TakeoverScope) {
  return (
    left.deviceId === right.deviceId &&
    left.tenantId === right.tenantId &&
    left.warehouseId === right.warehouseId &&
    left.subjectId === right.subjectId
  );
}

function assertExactScope(
  actual: { deviceId: string; tenantId: string; warehouseId: string; subjectId: string },
  expected: TakeoverScope
) {
  if (!sameScope(actual, expected)) {
    throw new Error('管理员接管授权或回执作用域与本地设备绑定不一致，已保留全部数据。');
  }
}

function isExpiredError(error: unknown) {
  const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : 0;
  const message = error instanceof Error ? error.message : '';
  return status === 410 || message.includes('过期') || message.toLowerCase().includes('expired');
}

type ExportableMedia = Omit<MediaQueueItem, 'blob'> & { bytesBase64: string };

export type TakeoverProgressStage =
  | 'AUTHORIZING'
  | 'AUTHORIZED'
  | 'ENCRYPTING'
  | 'UPLOADING'
  | 'SERVER_VERIFIED_CLEANUP_PENDING'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'FAILED';

export interface PendingTakeoverFinalize {
  receipt: DeviceTakeoverExportReceipt;
  eventIds: string[];
  mediaIds: string[];
}

export interface PendingTakeoverUpload {
  authorizationId: string;
  deviceId: string;
  scope: TakeoverScope;
  manifestHash: string;
  ciphertextHash: string;
  idempotencyKey: string;
  ciphertextBase64: string;
  iv: string;
  wrappedKeyBase64: string;
  eventIds: string[];
  mediaIds: string[];
}

function assertVerifiedReceipt(
  receipt: DeviceTakeoverExportReceipt,
  expected: {
    authorizationId: string;
    deviceId: string;
    scope: TakeoverScope;
    manifestHash: string;
    ciphertextHash: string;
    eventCount: number;
    mediaCount: number;
  }
) {
  assertExactScope(receipt.scope, expected.scope);
  if (
    receipt.status !== 'VERIFIED' ||
    receipt.authorizationId !== expected.authorizationId ||
    receipt.deviceId !== expected.deviceId ||
    receipt.manifestHash !== expected.manifestHash ||
    receipt.ciphertextHash !== expected.ciphertextHash ||
    receipt.eventCount !== expected.eventCount ||
    receipt.mediaCount !== expected.mediaCount ||
    receipt.checksumAlgorithm !== 'SHA-256'
  ) {
    throw new Error('管理员接管回执未通过完整性验证，已保留全部数据。');
  }
}

export class DeviceTakeoverService {
  constructor(
    private readonly queue: OfflineQueue,
    private readonly media: MediaQueue,
    private readonly port: PdaPort,
    private readonly now = () => new Date(),
    private readonly onProgress?: (stage: TakeoverProgressStage) => void
  ) {}

  async retryPendingFinalize(session: LocalDeviceSession) {
    const pending = await this.queue.getMeta<PendingTakeoverFinalize>('pending-takeover-finalize');
    if (pending) {
      if (
        pending.receipt.status !== 'VERIFIED' ||
        pending.receipt.eventCount !== pending.eventIds.length ||
        pending.receipt.mediaCount !== pending.mediaIds.length
      ) {
        this.onProgress?.('FAILED');
        throw new Error('待恢复的接管回执与本地清理清单不一致，已保留全部数据。');
      }
      assertExactScope(pending.receipt.scope, session);
      this.onProgress?.('SERVER_VERIFIED_CLEANUP_PENDING');
      await this.queue.finalizeTakeoverPackage(pending.receipt, pending.eventIds, pending.mediaIds);
      await this.media.restore();
      this.onProgress?.('VERIFIED');
      return pending.receipt;
    }

    const upload = await this.queue.getMeta<PendingTakeoverUpload>('pending-takeover-upload');
    if (!upload) return undefined;
    assertExactScope(upload.scope, session);
    if (
      upload.deviceId !== session.deviceId ||
      upload.eventIds.length === 0 ||
      upload.eventIds.length !== new Set(upload.eventIds).size ||
      upload.mediaIds.length !== new Set(upload.mediaIds).size
    ) {
      this.onProgress?.('FAILED');
      throw new Error('待恢复的接管上传清单无效，已保留全部数据。');
    }
    let serverVerified = false;
    try {
      this.onProgress?.('UPLOADING');
      const receipt = await this.port.uploadEncryptedDeviceTakeoverExport(
        upload.deviceId,
        upload.authorizationId,
        upload.idempotencyKey,
        {
          manifestHash: upload.manifestHash,
          ciphertextHash: upload.ciphertextHash,
          ciphertext: new Blob([decodeBase64(upload.ciphertextBase64)], {
            type: 'application/octet-stream',
          }),
          iv: upload.iv,
          wrappedKey: new Blob([decodeBase64(upload.wrappedKeyBase64)], {
            type: 'application/octet-stream',
          }),
        }
      );
      assertVerifiedReceipt(receipt, {
        authorizationId: upload.authorizationId,
        deviceId: upload.deviceId,
        scope: upload.scope,
        manifestHash: upload.manifestHash,
        ciphertextHash: upload.ciphertextHash,
        eventCount: upload.eventIds.length,
        mediaCount: upload.mediaIds.length,
      });
      serverVerified = true;
      this.onProgress?.('SERVER_VERIFIED_CLEANUP_PENDING');
      const finalize = {
        receipt,
        eventIds: upload.eventIds,
        mediaIds: upload.mediaIds,
      };
      await this.queue.setMeta('pending-takeover-finalize', finalize);
      await this.queue.finalizeTakeoverPackage(receipt, upload.eventIds, upload.mediaIds);
      await this.media.restore();
      this.onProgress?.('VERIFIED');
      return receipt;
    } catch (error) {
      if (serverVerified) this.onProgress?.('SERVER_VERIFIED_CLEANUP_PENDING');
      else if (isExpiredError(error)) {
        this.onProgress?.('EXPIRED');
        await this.queue.deleteMeta('pending-takeover-upload');
      } else this.onProgress?.('FAILED');
      throw error;
    }
  }

  async exportAndClear(session: LocalDeviceSession, reason: string) {
    if (!session.permissions.includes('pda.takeover.export')) {
      throw new Error('缺少 pda.takeover.export 权限，禁止管理员接管导出。');
    }
    if (Array.from(reason.trim()).length < 5) throw new Error('管理员接管原因至少 5 个字符。');
    const recovered = await this.retryPendingFinalize(session);
    if (recovered) return recovered;

    let serverVerified = false;
    try {
      this.queue.assertContext(session);
      this.media.assertContext(session);
      const events = this.queue.snapshot().events;
      const media = this.media.snapshot(session);
      if (events.length === 0) throw new Error('当前没有需要管理员接管的本地事件。');

      const manifest = this.createManifest(session, events, media);
      const encoder = new TextEncoder();
      const manifestBytes = encoder.encode(canonical(manifest));
      const manifestHash = await sha256(manifestBytes);
      this.onProgress?.('AUTHORIZING');
      const authorization = await this.port.authorizeDeviceTakeoverExport(
        session.deviceId,
        `pda:takeover:authorize:${session.deviceId}:${manifestHash}`,
        {
          reason: reason.trim(),
          manifestHash,
          eventCount: events.length,
          mediaCount: media.length,
        }
      );

      assertExactScope(authorization.scope, session);
      const authorizationExpired =
        new Date(authorization.expiresAt).getTime() <= this.now().getTime();
      if (
        authorization.deviceId !== session.deviceId ||
        authorization.manifestHash !== manifestHash ||
        authorization.eventCount !== events.length ||
        authorization.mediaCount !== media.length ||
        authorization.status !== 'AUTHORIZED' ||
        authorization.keyEncryptionAlgorithm !== 'RSA-OAEP-256' ||
        authorization.contentEncryptionAlgorithm !== 'A256GCM' ||
        authorizationExpired
      ) {
        throw new Error('管理员接管授权与声明清单不一致或已过期，已保留全部数据。');
      }
      this.onProgress?.('AUTHORIZED');

      this.onProgress?.('ENCRYPTING');
      const exportableMedia: ExportableMedia[] = await Promise.all(
        media.map(async ({ blob, ...item }) => ({
          ...item,
          bytesBase64: base64(new Uint8Array(await readBlobBytes(blob))),
        }))
      );
      const plaintext = encoder.encode(canonical({ manifest, events, media: exportableMedia }));
      const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
        'encrypt',
        'decrypt',
      ]);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);
      if (ciphertext.byteLength > authorization.maxCiphertextBytes) {
        throw new Error('管理员接管密文超过服务器授权上限，已保留全部数据。');
      }
      const publicKey = await crypto.subtle.importKey(
        'jwk',
        authorization.publicKeyJwk as JsonWebKey,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['wrapKey']
      );
      const wrappedKey = await crypto.subtle.wrapKey('raw', aesKey, publicKey, {
        name: 'RSA-OAEP',
      });
      const ciphertextHash = await sha256(new Uint8Array(ciphertext));
      this.onProgress?.('UPLOADING');
      const uploadIdempotencyKey = `pda:takeover:upload:${authorization.authorizationId}:${ciphertextHash}`;
      const pendingUpload: PendingTakeoverUpload = {
        authorizationId: authorization.authorizationId,
        deviceId: session.deviceId,
        scope: authorization.scope,
        manifestHash,
        ciphertextHash,
        idempotencyKey: uploadIdempotencyKey,
        ciphertextBase64: base64(new Uint8Array(ciphertext)),
        iv: base64(iv),
        wrappedKeyBase64: base64(new Uint8Array(wrappedKey)),
        eventIds: events.map((event) => event.envelope.eventId),
        mediaIds: media.map((item) => item.mediaId),
      };
      await this.queue.setMeta('pending-takeover-upload', pendingUpload);
      const receipt = await this.port.uploadEncryptedDeviceTakeoverExport(
        session.deviceId,
        authorization.authorizationId,
        uploadIdempotencyKey,
        {
          manifestHash,
          ciphertextHash,
          ciphertext: new Blob([ciphertext], { type: 'application/octet-stream' }),
          iv: base64(iv),
          wrappedKey: new Blob([wrappedKey], { type: 'application/octet-stream' }),
        }
      );

      assertVerifiedReceipt(receipt, {
        authorizationId: authorization.authorizationId,
        deviceId: session.deviceId,
        scope: session,
        manifestHash,
        ciphertextHash,
        eventCount: events.length,
        mediaCount: media.length,
      });
      serverVerified = true;
      const pending: PendingTakeoverFinalize = {
        receipt,
        eventIds: events.map((event) => event.envelope.eventId),
        mediaIds: media.map((item) => item.mediaId),
      };
      await this.queue.setMeta('pending-takeover-finalize', pending);
      this.onProgress?.('SERVER_VERIFIED_CLEANUP_PENDING');
      await this.queue.finalizeTakeoverPackage(receipt, pending.eventIds, pending.mediaIds);
      await this.media.restore();
      this.onProgress?.('VERIFIED');
      return receipt;
    } catch (error) {
      if (serverVerified) this.onProgress?.('SERVER_VERIFIED_CLEANUP_PENDING');
      else if (isExpiredError(error)) {
        this.onProgress?.('EXPIRED');
        await this.queue.deleteMeta('pending-takeover-upload');
      } else this.onProgress?.('FAILED');
      throw error;
    }
  }

  private createManifest(
    session: LocalDeviceSession,
    events: QueuedEvent[],
    media: MediaQueueItem[]
  ) {
    return {
      schemaVersion: 1,
      scope: {
        tenantId: session.tenantId,
        warehouseId: session.warehouseId,
        subjectId: session.subjectId,
        deviceId: session.deviceId,
      },
      eventCount: events.length,
      mediaCount: media.length,
      events: events.map((event) => ({
        eventId: event.envelope.eventId,
        localSequence: event.envelope.localSequence,
        idempotencyKey: event.envelope.idempotencyKey,
        mediaRefs: event.envelope.mediaRefs,
      })),
      media: media.map((item) => ({
        mediaId: item.mediaId,
        eventId: item.eventId,
        contentHash: item.contentHash,
        mimeType: item.mimeType,
      })),
    };
  }
}
