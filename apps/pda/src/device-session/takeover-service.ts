import type { DeviceContext, MediaQueueItem, QueuedEvent } from '../domain/types';
import type { MediaQueue } from '../offline/media-queue';
import type { OfflineQueue } from '../offline/offline-queue';
import { readBlobBytes } from '../offline/blob-bytes';
import type { PdaPort } from '../ports/pda-port';
import type { LocalDeviceSession } from '../session/session-guard';

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

function sameScope(left: DeviceContext, right: DeviceContext) {
  return (
    left.deviceId === right.deviceId &&
    left.tenantId === right.tenantId &&
    left.warehouseId === right.warehouseId &&
    left.subjectId === right.subjectId
  );
}

function assertExactScope(
  actual: { deviceId: string; tenantId: string; warehouseId: string; subjectId: string },
  expected: DeviceContext
) {
  if (!sameScope(actual as DeviceContext, expected)) {
    throw new Error('管理员接管授权或回执作用域与本地设备绑定不一致，已保留全部数据。');
  }
}

type ExportableMedia = Omit<MediaQueueItem, 'blob'> & { bytesBase64: string };

export class DeviceTakeoverService {
  constructor(
    private readonly queue: OfflineQueue,
    private readonly media: MediaQueue,
    private readonly port: PdaPort,
    private readonly now = () => new Date()
  ) {}

  async exportAndClear(session: LocalDeviceSession, reason: string) {
    if (!session.permissions.includes('pda.takeover.export')) {
      throw new Error('缺少 pda.takeover.export 权限，禁止管理员接管导出。');
    }
    if (Array.from(reason.trim()).length < 5) throw new Error('管理员接管原因至少 5 个字符。');

    this.queue.assertContext(session);
    this.media.assertContext(session);
    const events = this.queue.snapshot().events;
    const media = this.media.snapshot(session);
    if (events.length === 0) throw new Error('当前没有需要管理员接管的本地事件。');

    const manifest = this.createManifest(session, events, media);
    const encoder = new TextEncoder();
    const manifestBytes = encoder.encode(canonical(manifest));
    const manifestHash = await sha256(manifestBytes);
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
    if (
      authorization.deviceId !== session.deviceId ||
      authorization.manifestHash !== manifestHash ||
      authorization.eventCount !== events.length ||
      authorization.mediaCount !== media.length ||
      authorization.status !== 'AUTHORIZED' ||
      authorization.keyEncryptionAlgorithm !== 'RSA-OAEP-256' ||
      authorization.contentEncryptionAlgorithm !== 'A256GCM' ||
      new Date(authorization.expiresAt).getTime() <= this.now().getTime()
    ) {
      throw new Error('管理员接管授权与声明清单不一致或已过期，已保留全部数据。');
    }

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
    const receipt = await this.port.uploadEncryptedDeviceTakeoverExport(
      session.deviceId,
      authorization.authorizationId,
      `pda:takeover:upload:${authorization.authorizationId}:${ciphertextHash}`,
      {
        manifestHash,
        ciphertextHash,
        ciphertext: new Blob([ciphertext], { type: 'application/octet-stream' }),
        iv: base64(iv),
        wrappedKey: new Blob([wrappedKey], { type: 'application/octet-stream' }),
      }
    );

    assertExactScope(receipt.scope, session);
    if (
      receipt.status !== 'VERIFIED' ||
      receipt.authorizationId !== authorization.authorizationId ||
      receipt.deviceId !== session.deviceId ||
      receipt.manifestHash !== manifestHash ||
      receipt.ciphertextHash !== ciphertextHash ||
      receipt.eventCount !== events.length ||
      receipt.mediaCount !== media.length
    ) {
      throw new Error('管理员接管回执未通过完整性验证，已保留全部数据。');
    }

    await this.queue.setMeta('last-takeover-export-receipt', receipt);
    await this.queue.clear();
    await this.media.restore();
    return receipt;
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
