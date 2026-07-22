import type { components } from '@zhili/contracts';
import type { PdaPort } from './pda-port';
import type { UploadEncryptedTakeoverInput } from './pda-port';
import {
  canonicalize,
  decodeBase64,
  sha256HexBlob,
  sha256HexBytes,
} from '../takeover/package-codec';
import { readBlobBytes } from '../offline/blob-bytes';
import type {
  DeliveryEvent,
  DeliveryTaskTransitionReceipt,
  AuthorizeDeviceTakeoverExportRequest,
  DeviceTakeoverExportAuthorization,
  DeviceTakeoverExportReceipt,
  DeviceConflict,
  DeviceEventEnvelope,
  DeviceSession,
  ProofOfDeliveryCaptureReceipt,
} from '../domain/types';

const future = '2099-12-31T23:59:59.000Z';

type TakeoverScope = {
  deviceId: string;
  tenantId: string;
  warehouseId: string;
  subjectId: string;
};

function sameScope(left: TakeoverScope, right: TakeoverScope) {
  return (
    left.deviceId === right.deviceId &&
    left.tenantId === right.tenantId &&
    left.warehouseId === right.warehouseId &&
    left.subjectId === right.subjectId
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readScope(value: unknown): TakeoverScope | undefined {
  if (!isRecord(value)) return undefined;
  const { deviceId, tenantId, warehouseId, subjectId } = value;
  if ([deviceId, tenantId, warehouseId, subjectId].some((item) => typeof item !== 'string')) {
    return undefined;
  }
  return { deviceId, tenantId, warehouseId, subjectId } as TakeoverScope;
}

export class MemoryPdaPort implements PdaPort {
  readonly synchronized = new Set<string>();
  readonly conflictResolutions: Array<{ conflictId: string; resolution: string; reason: string }> =
    [];
  readonly uploadedMedia = new Set<string>();
  syncCallCount = 0;
  uploadFailures = new Set<string>();
  private readonly deviceBindings = new Map<string, TakeoverScope>([
    [
      '01JDEVICE00000000000000003',
      {
        deviceId: '01JDEVICE00000000000000003',
        tenantId: '01JTENANT0000000000000001',
        warehouseId: '01JWAREHOUSE00000000000001',
        subjectId: '01JSUBJECT0000000000000001',
      },
    ],
  ]);
  private readonly takeoverAuthorizations = new Map<
    string,
    {
      deviceId: string;
      manifestHash: string;
      eventCount: number;
      mediaCount: number;
      expiresAt: string;
      privateKey: CryptoKey;
      scope: TakeoverScope;
    }
  >();

  async bindDevice(
    deviceId: string,
    body: components['schemas']['BindDeviceRequest'],
    _idempotencyKey: string
  ): Promise<DeviceSession> {
    void _idempotencyKey;
    const session: DeviceSession = {
      deviceId,
      tenantId: '01JTENANT0000000000000001',
      warehouseId: body.warehouseId,
      subjectId: body.subjectId,
      permissions: [
        'pda.use',
        'pda.sync',
        'pda.conflict.resolve',
        'pda.takeover.export',
        'lastmile.delivery.execute',
        'lastmile.pod.write',
      ],
      expiresAt: future,
    };
    this.deviceBindings.set(deviceId, {
      deviceId,
      tenantId: session.tenantId,
      warehouseId: session.warehouseId,
      subjectId: session.subjectId,
    });
    return session;
  }

  async getDeviceTasks(_deviceId: string) {
    void _deviceId;
    return [
      ...[
        'S2505120004',
        'OK-1',
        'CONFLICT-KEEP',
        'CONFLICT-MANUAL',
        'CONFLICT-REAPPLY',
        'REJECT-1',
        'MEDIA-SCAN-1',
      ].map((reference, index) => ({
        id: `01JPDAMOCK${String(index + 1).padStart(16, '0')}`,
        type: 'RECEIVE' as const,
        reference,
        status: 'READY',
        priority: 'URGENT' as const,
        version: 7,
      })),
      {
        id: '01JPDATASK0000000000000010',
        type: 'MOVE' as const,
        reference: 'MOVE-DEMO',
        status: 'READY',
        priority: 'HIGH' as const,
        version: 4,
      },
      {
        id: '01JPDATASK0000000000000011',
        type: 'PICK' as const,
        reference: 'PICK-DEMO',
        status: 'READY',
        priority: 'HIGH' as const,
        version: 5,
      },
      {
        id: '01JPDATASK0000000000000012',
        type: 'LOAD' as const,
        reference: 'LOAD-DEMO',
        status: 'READY',
        priority: 'HIGH' as const,
        version: 6,
      },
      {
        id: '01JPDATASK0000000000000013',
        type: 'DISPATCH' as const,
        reference: 'DISPATCH-DEMO',
        status: 'READY',
        priority: 'HIGH' as const,
        version: 2,
      },
      {
        id: '01JPDATASK0000000000000014',
        type: 'STOCKTAKE' as const,
        reference: 'STOCKTAKE-DEMO',
        status: 'READY',
        priority: 'HIGH' as const,
        version: 3,
      },
      {
        id: '01JPDATASK0000000000000015',
        type: 'LAST_MILE_DELIVERY' as const,
        reference: 'LM-PLANNED',
        status: 'PLANNED',
        priority: 'HIGH' as const,
        version: 11,
      },
      {
        id: '01JPDATASK0000000000000016',
        type: 'LAST_MILE_DELIVERY' as const,
        reference: 'LM-PALLETIZED',
        status: 'PALLETIZED',
        priority: 'HIGH' as const,
        version: 12,
      },
      {
        id: '01JPDATASK0000000000000017',
        type: 'LAST_MILE_DELIVERY' as const,
        reference: 'LM-OUT',
        status: 'OUT_FOR_DELIVERY',
        priority: 'HIGH' as const,
        version: 14,
      },
      {
        id: '01JPDATASK0000000000000002',
        type: 'LAST_MILE_DELIVERY' as const,
        reference: 'LM250722001',
        status: 'LOADED',
        priority: 'HIGH' as const,
        version: 3,
      },
    ];
  }

  async syncDeviceEvents(events: DeviceEventEnvelope[], _idempotencyKey: string) {
    void _idempotencyKey;
    this.syncCallCount += 1;
    return events.map((event) => {
      if (this.synchronized.has(event.idempotencyKey)) {
        return {
          eventId: event.eventId,
          disposition: 'DUPLICATE' as const,
          claimedMediaRefs: event.mediaRefs,
          serverVersion: 8,
        };
      }
      if (event.entityRef.toUpperCase().includes('CONFLICT')) {
        return {
          eventId: event.eventId,
          disposition: 'CONFLICT' as const,
          claimedMediaRefs: [],
          serverVersion: 9,
          conflictId: '01JCONFLICT000000000000001',
          conflictVersion: 1,
        };
      }
      if (event.entityRef.toUpperCase().includes('REJECT')) {
        return {
          eventId: event.eventId,
          disposition: 'REJECTED' as const,
          claimedMediaRefs: [],
          serverVersion: 8,
          errorCode: 'INVALID_STATE',
          errorMessage: '当前业务状态不允许执行',
        };
      }
      this.synchronized.add(event.idempotencyKey);
      return {
        eventId: event.eventId,
        disposition: 'APPLIED' as const,
        claimedMediaRefs: event.mediaRefs,
        serverVersion: 8,
      };
    });
  }

  async uploadDeviceMedia(
    _deviceId: string,
    input: { eventId: string; mediaId: string; contentHash: string; file: Blob },
    _idempotencyKey: string
  ) {
    void _idempotencyKey;
    if (this.uploadFailures.delete(input.mediaId)) throw new Error('弱网上传中断');
    this.uploadedMedia.add(input.mediaId);
    return { mediaId: input.mediaId, status: 'READY' as const, objectRef: `pda/${input.mediaId}` };
  }

  async resolveDeviceConflict(
    conflictId: string,
    _etag: string,
    _idempotencyKey: string,
    body: components['schemas']['ResolveDeviceConflictRequest']
  ): Promise<DeviceConflict> {
    void _idempotencyKey;
    this.conflictResolutions.push({ conflictId, ...body });
    return {
      id: conflictId,
      localEvent: {} as DeviceEventEnvelope,
      serverVersion: 9,
      serverState: { status: 'PICKED' },
      differences: [],
      status: 'RESOLVED',
      version: 2,
    };
  }

  async getDeviceConflict(conflictId: string) {
    const localEvent: DeviceEventEnvelope = {
      eventId: '01JY8Z8F6ME4F0Y9QH2X6D4R7',
      deviceId: '01JDEVICE00000000000000003',
      localSequence: 1842,
      tenantId: '01JTENANT0000000000000001',
      warehouseId: '01JWAREHOUSE00000000000001',
      subjectId: '01JSUBJECT0000000000000001',
      action: 'PICK',
      entityRef: 'CONFLICT-1',
      payload: { bin: 'A1' },
      mediaRefs: [],
      baseVersion: 7,
      idempotencyKey: 'pda:conflict-fixture-00001',
      occurredAt: '2026-07-22T01:15:32.000Z',
      timezone: 'Asia/Shanghai',
      appVersion: '0.2.0',
    };
    return {
      conflict: {
        id: conflictId,
        localEvent,
        serverVersion: 9,
        serverState: { bin: 'B2', status: 'PICKED' },
        differences: [
          { field: 'bin', localValue: 'A1', serverValue: 'B2', impact: '重新应用将改变库位' },
        ],
        status: 'OPEN' as const,
        version: 1,
      },
      etag: '"1"',
    };
  }

  async updateDeliveryTaskStatus(
    deliveryTaskId: string,
    _etag: string,
    _idempotencyKey: string,
    body: DeliveryEvent
  ): Promise<DeliveryTaskTransitionReceipt> {
    return {
      deviceEventId: body.deviceEventId,
      disposition: 'APPLIED' as const,
      deliveryTask: {
        id: deliveryTaskId,
        taskNo: 'LM250722001',
        status: body.targetStatus,
        waybillCount: 1,
        version: Number(_etag.replaceAll('"', '')) + 1,
      },
      claimedMediaRefs: body.mediaRefs,
    };
  }

  async captureProofOfDelivery(
    deliveryTaskId: string,
    _etag: string,
    _idempotencyKey: string,
    body: components['schemas']['CaptureProofOfDeliveryRequest']
  ): Promise<ProofOfDeliveryCaptureReceipt> {
    return {
      deviceEventId: body.deviceEventId,
      disposition: 'APPLIED' as const,
      deliveryTask: {
        id: deliveryTaskId,
        taskNo: 'LM250722001',
        status: 'COMPLETED' as const,
        waybillCount: 1,
        version: Number(_etag.replaceAll('"', '')) + 1,
      },
      proofOfDelivery: {
        id: '01JPOD0000000000000000001',
        deliveryTaskId,
        versionNo: 1,
        recipientName: body.recipientName,
        signedAt: body.signedAt,
        evidenceRefs: body.evidenceRefs,
      },
      claimedMediaRefs: body.evidenceRefs,
    };
  }

  async amendProofOfDelivery() {}

  async authorizeDeviceTakeoverExport(
    deviceId: string,
    _idempotencyKey: string,
    body: AuthorizeDeviceTakeoverExportRequest
  ): Promise<DeviceTakeoverExportAuthorization> {
    void _idempotencyKey;
    const scope = this.deviceBindings.get(deviceId);
    if (!scope) throw new Error('模拟设备尚未成功绑定，禁止签发接管授权。');
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['wrapKey', 'unwrapKey']
    );
    const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const authorizationId = `01JMOCKAUTH${crypto.randomUUID().replaceAll('-', '').slice(0, 15).toUpperCase()}`.slice(
      0,
      26
    );
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    this.takeoverAuthorizations.set(authorizationId, {
      deviceId,
      manifestHash: body.manifestHash,
      eventCount: body.eventCount,
      mediaCount: body.mediaCount,
      expiresAt,
      privateKey: keyPair.privateKey,
      scope,
    });
    return {
      authorizationId,
      deviceId,
      scope,
      manifestHash: body.manifestHash,
      eventCount: body.eventCount,
      mediaCount: body.mediaCount,
      expiresAt,
      keyEncryptionAlgorithm: 'RSA-OAEP-256',
      contentEncryptionAlgorithm: 'A256GCM',
      publicKeyJwk: {
        kty: 'RSA',
        kid: 'mock-takeover-key',
        use: 'enc',
        alg: 'RSA-OAEP-256',
        key_ops: ['wrapKey'],
        n: jwk.n!,
        e: jwk.e!,
      },
      maxCiphertextBytes: 5_000_000,
      status: 'AUTHORIZED',
    };
  }

  async uploadEncryptedDeviceTakeoverExport(
    deviceId: string,
    authorizationId: string,
    _idempotencyKey: string,
    input: UploadEncryptedTakeoverInput
  ): Promise<DeviceTakeoverExportReceipt> {
    void _idempotencyKey;
    const authorization = this.takeoverAuthorizations.get(authorizationId);
    if (
      !authorization ||
      authorization.deviceId !== deviceId ||
      authorization.manifestHash !== input.manifestHash ||
      new Date(authorization.expiresAt).getTime() <= Date.now()
    )
      throw new Error('模拟接管授权不存在、作用域不匹配或已过期。');
    if ((await sha256HexBlob(input.ciphertext)) !== input.ciphertextHash)
      throw new Error('模拟接管密文哈希校验失败，未返回 VERIFIED。');
    const iv = decodeBase64(input.iv);
    if (iv.byteLength !== 12) throw new Error('模拟接管 IV 必须恰好为 12 字节。');
    let aesKey: CryptoKey;
    try {
      aesKey = await crypto.subtle.unwrapKey(
        'raw',
        await readBlobBytes(input.wrappedKey),
        authorization.privateKey,
        { name: 'RSA-OAEP' },
        'AES-GCM',
        false,
        ['decrypt']
      );
    } catch {
      throw new Error('模拟接管 RSA 密钥解封失败，未返回 VERIFIED。');
    }
    let plaintext: ArrayBuffer;
    try {
      plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        await readBlobBytes(input.ciphertext)
      );
    } catch {
      throw new Error('模拟接管 AES-GCM 解密或认证失败，未返回 VERIFIED。');
    }
    let archive: Record<string, unknown>;
    const plaintextText = new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
    try {
      const parsed: unknown = JSON.parse(plaintextText);
      if (!isRecord(parsed) || canonicalize(parsed) !== plaintextText) throw new Error();
      archive = parsed;
    } catch {
      throw new Error('模拟接管明文不是规范化档案 JSON，未返回 VERIFIED。');
    }
    const manifest = archive.manifest;
    const events = archive.events;
    const media = archive.media;
    if (!isRecord(manifest) || !Array.isArray(events) || !Array.isArray(media)) {
      throw new Error('模拟接管清单结构无效，未返回 VERIFIED。');
    }
    const actualManifestHash = await sha256HexBytes(
      new TextEncoder().encode(canonicalize(manifest))
    );
    const manifestScope = readScope(manifest.scope);
    const countsMatch =
      manifest.eventCount === authorization.eventCount &&
      manifest.mediaCount === authorization.mediaCount &&
      events.length === authorization.eventCount &&
      media.length === authorization.mediaCount &&
      Array.isArray(manifest.events) &&
      manifest.events.length === authorization.eventCount &&
      Array.isArray(manifest.media) &&
      manifest.media.length === authorization.mediaCount;
    const eventScopesMatch = events.every((event) => {
      const envelope = isRecord(event) && isRecord(event.envelope) ? event.envelope : undefined;
      return envelope ? sameScope(readScope(envelope) ?? ({} as TakeoverScope), authorization.scope) : false;
    });
    const mediaScopesMatch = media.every((item) => {
      if (!isRecord(item)) return false;
      const context = item.context === undefined ? authorization.scope : readScope(item.context);
      return context ? sameScope(context, authorization.scope) : false;
    });
    if (
      actualManifestHash !== input.manifestHash ||
      input.manifestHash !== authorization.manifestHash ||
      !manifestScope ||
      !sameScope(manifestScope, authorization.scope) ||
      !countsMatch ||
      !eventScopesMatch ||
      !mediaScopesMatch
    ) {
      throw new Error('模拟接管 manifest 哈希、作用域或事件/媒体计数校验失败。');
    }
    this.takeoverAuthorizations.delete(authorizationId);
    return {
      exportId: `01JMOCKEXPORT${crypto.randomUUID().replaceAll('-', '').slice(0, 13).toUpperCase()}`.slice(
        0,
        26
      ),
      authorizationId,
      deviceId,
      scope: authorization.scope,
      manifestHash: input.manifestHash,
      ciphertextHash: input.ciphertextHash,
      eventCount: authorization.eventCount,
      mediaCount: authorization.mediaCount,
      checksumAlgorithm: 'SHA-256',
      status: 'VERIFIED',
      receivedAt: new Date().toISOString(),
      verifiedAt: new Date().toISOString(),
    };
  }
}
