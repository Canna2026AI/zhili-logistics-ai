import { describe, expect, it, vi } from 'vitest';
import { MediaQueue } from '../offline/media-queue';
import { OfflineQueue } from '../offline/offline-queue';
import { MemoryQueueStore } from '../offline/queue-store';
import { MemoryPdaPort } from '../ports/memory-pda-port';
import type { LocalDeviceSession } from '../session/session-guard';
import { DeviceTakeoverService } from './takeover-service';

const eventId = '01JTAKEOVEREVENT0000000001';
const authorizationId = '01JTAKEOVERAUTH00000000001';
const session: LocalDeviceSession = {
  deviceId: '01JDEVICE00000000000000003',
  tenantId: '01JTENANT0000000000000001',
  warehouseId: '01JWAREHOUSE00000000000001',
  subjectId: '01JSUBJECT0000000000000001',
  timezone: 'Asia/Shanghai',
  appVersion: '0.2.0',
  expiresAt: '2099-12-31T23:59:59.000Z',
  permissions: ['pda.use', 'pda.takeover.export'],
};
const scope = {
  deviceId: session.deviceId,
  tenantId: session.tenantId,
  warehouseId: session.warehouseId,
  subjectId: session.subjectId,
};

async function setup() {
  const store = new MemoryQueueStore();
  const queue = new OfflineQueue(store, { createId: () => eventId });
  const media = new MediaQueue(store);
  await Promise.all([queue.restore(), media.restore()]);
  const item = await media.prepare(
    session,
    eventId,
    new Blob(['photo-secret'], { type: 'image/jpeg' }),
    'image/jpeg',
    'media-takeover'
  );
  await queue.enqueue(session, {
    eventId,
    action: 'CAPTURE_POD',
    entityRef: 'LM250722001',
    payload: { recipientName: '陈女士' },
    mediaRefs: [item.mediaId],
    mediaItems: [item],
    baseVersion: 8,
  });
  await media.restore();
  return { store, queue, media };
}

async function createKeyPair() {
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
  return { keyPair, jwk };
}

function bytesFromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

describe('DeviceTakeoverService', () => {
  it('reports each authorization and encrypted-upload stage in order', async () => {
    const { queue, media } = await setup();
    const port = new MemoryPdaPort();
    const { jwk } = await createKeyPair();
    vi.spyOn(port, 'authorizeDeviceTakeoverExport').mockImplementation(
      async (deviceId, _key, body) => ({
        authorizationId,
        deviceId,
        scope,
        manifestHash: body.manifestHash,
        eventCount: body.eventCount,
        mediaCount: body.mediaCount,
        expiresAt: '2099-12-31T23:59:59.000Z',
        keyEncryptionAlgorithm: 'RSA-OAEP-256',
        contentEncryptionAlgorithm: 'A256GCM',
        publicKeyJwk: {
          kty: 'RSA',
          kid: 'takeover-key-1',
          use: 'enc',
          alg: 'RSA-OAEP-256',
          key_ops: ['wrapKey'],
          n: jwk.n!,
          e: jwk.e!,
        },
        maxCiphertextBytes: 5_000_000,
        status: 'AUTHORIZED',
      })
    );
    vi.spyOn(port, 'uploadEncryptedDeviceTakeoverExport').mockImplementation(
      async (deviceId, receivedAuthorizationId, _key, input) => ({
        exportId: '01JTAKEOVEREXPORT0000000001',
        authorizationId: receivedAuthorizationId,
        deviceId,
        scope,
        manifestHash: input.manifestHash,
        ciphertextHash: input.ciphertextHash,
        eventCount: 1,
        mediaCount: 1,
        checksumAlgorithm: 'SHA-256',
        status: 'VERIFIED',
        receivedAt: '2026-07-22T12:00:00.000Z',
        verifiedAt: '2026-07-22T12:00:01.000Z',
      })
    );
    const progress = vi.fn();

    await new DeviceTakeoverService(queue, media, port, undefined, progress).exportAndClear(
      session,
      '设备损坏，由主管接管'
    );

    expect(progress.mock.calls.map(([stage]) => stage)).toEqual([
      'AUTHORIZING',
      'AUTHORIZED',
      'ENCRYPTING',
      'UPLOADING',
      'SERVER_VERIFIED_CLEANUP_PENDING',
      'VERIFIED',
    ]);
  });

  it('supports a complete encrypted takeover in the mock port', async () => {
    const { queue, media } = await setup();

    const receipt = await new DeviceTakeoverService(
      queue,
      media,
      new MemoryPdaPort()
    ).exportAndClear(session, '设备损坏，由主管接管');

    expect(receipt.status).toBe('VERIFIED');
    expect(queue.snapshot().events).toHaveLength(0);
    expect(media.snapshot()).toHaveLength(0);
  });

  it('uses the latest bound non-default warehouse and subject scope end to end', async () => {
    const port = new MemoryPdaPort();
    const deviceId = '01JNONDEFAULTDEVICE00000001';
    const bound = await port.bindDevice(
      deviceId,
      {
        warehouseId: '01JNONDEFAULTWAREHOUSE0001',
        subjectId: '01JNONDEFAULTSUBJECT0000001',
        deviceCode: 'PDA-CUSTOM-09',
      },
      'bind-custom-device'
    );
    const customSession: LocalDeviceSession = {
      ...bound,
      timezone: 'Asia/Shanghai',
      appVersion: '0.2.0',
    };
    const store = new MemoryQueueStore();
    const queue = new OfflineQueue(store);
    const media = new MediaQueue(store);
    await Promise.all([queue.restore(), media.restore()]);
    await queue.enqueue(customSession, {
      eventId: '01JNONDEFAULTEVENT00000001',
      action: 'WAREHOUSE_RECEIVE',
      entityRef: 'CUSTOM-SCOPE',
      payload: {},
      mediaRefs: [],
      baseVersion: 1,
    });

    const receipt = await new DeviceTakeoverService(queue, media, port).exportAndClear(
      customSession,
      '设备损坏，由主管接管'
    );

    expect(receipt.scope).toEqual({
      deviceId,
      tenantId: customSession.tenantId,
      warehouseId: customSession.warehouseId,
      subjectId: customSession.subjectId,
    });
  });

  it('preserves a recoverable VERIFIED receipt when atomic local finalization fails', async () => {
    const { store, queue, media } = await setup();
    const progress = vi.fn();
    vi.spyOn(store, 'finalizeTakeoverPackage').mockRejectedValueOnce(
      new Error('local transaction failed')
    );

    await expect(
      new DeviceTakeoverService(
        queue,
        media,
        new MemoryPdaPort(),
        undefined,
        progress
      ).exportAndClear(session, '设备损坏，由主管接管')
    ).rejects.toThrow('local transaction failed');

    expect(progress).not.toHaveBeenCalledWith('VERIFIED');
    expect(progress.mock.calls.at(-1)?.[0]).toBe('SERVER_VERIFIED_CLEANUP_PENDING');
    expect(await queue.getMeta('last-takeover-export-receipt')).toBeUndefined();
    expect(await queue.getMeta('pending-takeover-finalize')).toEqual(
      expect.objectContaining({ eventIds: [eventId], mediaIds: ['media-takeover'] })
    );
    expect(await store.getEvents()).toHaveLength(1);
    expect(await store.getMedia()).toHaveLength(1);
  });

  it('recovers the same VERIFIED export after pending receipt persistence fails without reauthorizing', async () => {
    const { store, queue, media } = await setup();
    const port = new MemoryPdaPort();
    const authorize = vi.spyOn(port, 'authorizeDeviceTakeoverExport');
    const upload = vi.spyOn(port, 'uploadEncryptedDeviceTakeoverExport');
    const originalSetMeta = store.setMeta.bind(store);
    let failPendingReceiptOnce = true;
    vi.spyOn(store, 'setMeta').mockImplementation(async (key, value) => {
      if (key === 'pending-takeover-finalize' && failPendingReceiptOnce) {
        failPendingReceiptOnce = false;
        throw new Error('browser closed before receipt persistence');
      }
      await originalSetMeta(key, value);
    });
    const progress = vi.fn();

    await expect(
      new DeviceTakeoverService(queue, media, port, undefined, progress).exportAndClear(
        session,
        '设备损坏，由主管接管'
      )
    ).rejects.toThrow('before receipt persistence');

    const firstReceipt = await upload.mock.results[0]!.value;
    expect(progress.mock.calls.at(-1)?.[0]).toBe('SERVER_VERIFIED_CLEANUP_PENDING');
    expect(await queue.getMeta('pending-takeover-upload')).toEqual(
      expect.objectContaining({
        authorizationId: firstReceipt.authorizationId,
        ciphertextHash: firstReceipt.ciphertextHash,
      })
    );
    expect(await store.getEvents()).toHaveLength(1);
    expect(await store.getMedia()).toHaveLength(1);

    const restartedQueue = new OfflineQueue(store);
    const restartedMedia = new MediaQueue(store);
    await Promise.all([restartedQueue.restore(), restartedMedia.restore()]);
    const recovered = await new DeviceTakeoverService(
      restartedQueue,
      restartedMedia,
      port
    ).retryPendingFinalize(session);

    expect(recovered).toEqual(firstReceipt);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1]![2]).toBe(upload.mock.calls[0]![2]);
    expect(upload.mock.calls[1]![3].ciphertextHash).toBe(upload.mock.calls[0]![3].ciphertextHash);
    expect(restartedQueue.snapshot().events).toHaveLength(0);
    expect(restartedMedia.snapshot()).toHaveLength(0);
    expect(await restartedQueue.getMeta('pending-takeover-upload')).toBeUndefined();
  });

  it('retries only the pending local finalization after restart without re-uploading', async () => {
    const { store, queue, media } = await setup();
    const port = new MemoryPdaPort();
    const upload = vi.spyOn(port, 'uploadEncryptedDeviceTakeoverExport');
    vi.spyOn(store, 'finalizeTakeoverPackage').mockRejectedValueOnce(
      new Error('browser closed during local commit')
    );

    await expect(
      new DeviceTakeoverService(queue, media, port).exportAndClear(session, '设备损坏，由主管接管')
    ).rejects.toThrow('browser closed');

    const restartedQueue = new OfflineQueue(store);
    const restartedMedia = new MediaQueue(store);
    await Promise.all([restartedQueue.restore(), restartedMedia.restore()]);
    const progress = vi.fn();
    const receipt = await new DeviceTakeoverService(
      restartedQueue,
      restartedMedia,
      port,
      undefined,
      progress
    ).retryPendingFinalize(session);

    expect(receipt?.status).toBe('VERIFIED');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(restartedQueue.snapshot().events).toHaveLength(0);
    expect(restartedMedia.snapshot()).toHaveLength(0);
    expect(await restartedQueue.getMeta('pending-takeover-finalize')).toBeUndefined();
    expect(await restartedQueue.getMeta('last-takeover-export-receipt')).toEqual(receipt);
    expect(progress.mock.calls.map(([stage]) => stage)).toEqual([
      'SERVER_VERIFIED_CLEANUP_PENDING',
      'VERIFIED',
    ]);
  });

  it('encrypts the complete package and clears only after a matching VERIFIED receipt', async () => {
    const { store, queue, media } = await setup();
    const port = new MemoryPdaPort();
    const { keyPair, jwk } = await createKeyPair();
    vi.spyOn(port, 'authorizeDeviceTakeoverExport').mockImplementation(
      async (deviceId, _key, body) => ({
        authorizationId,
        deviceId,
        scope,
        manifestHash: body.manifestHash,
        eventCount: body.eventCount,
        mediaCount: body.mediaCount,
        expiresAt: '2099-12-31T23:59:59.000Z',
        keyEncryptionAlgorithm: 'RSA-OAEP-256',
        contentEncryptionAlgorithm: 'A256GCM',
        publicKeyJwk: {
          kty: 'RSA',
          kid: 'takeover-key-1',
          use: 'enc',
          alg: 'RSA-OAEP-256',
          key_ops: ['wrapKey'],
          n: jwk.n!,
          e: jwk.e!,
        },
        maxCiphertextBytes: 5_000_000,
        status: 'AUTHORIZED',
      })
    );
    const upload = vi
      .spyOn(port, 'uploadEncryptedDeviceTakeoverExport')
      .mockImplementation(async (deviceId, receivedAuthorizationId, _key, input) => {
        await queue.enqueue(session, {
          eventId: '01JCONCURRENT00000000000001',
          action: 'WAREHOUSE_RECEIVE',
          entityRef: 'AFTER-AUTHORIZATION',
          payload: {},
          mediaRefs: [],
          baseVersion: 1,
        });
        return {
          exportId: '01JTAKEOVEREXPORT0000000001',
          authorizationId: receivedAuthorizationId,
          deviceId,
          scope,
          manifestHash: input.manifestHash,
          ciphertextHash: input.ciphertextHash,
          eventCount: 1,
          mediaCount: 1,
          checksumAlgorithm: 'SHA-256',
          status: 'VERIFIED',
          receivedAt: '2026-07-22T12:00:00.000Z',
          verifiedAt: '2026-07-22T12:00:01.000Z',
        };
      });

    const receipt = await new DeviceTakeoverService(queue, media, port).exportAndClear(
      session,
      '设备损坏，由主管接管'
    );

    const input = upload.mock.calls[0]![3];
    const aesKey = await crypto.subtle.unwrapKey(
      'raw',
      await input.wrappedKey.arrayBuffer(),
      keyPair.privateKey,
      { name: 'RSA-OAEP' },
      'AES-GCM',
      false,
      ['decrypt']
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytesFromBase64(input.iv) },
      aesKey,
      await input.ciphertext.arrayBuffer()
    );
    const archive = new TextDecoder().decode(plaintext);

    expect(archive).toContain(eventId);
    expect(archive).toContain('CAPTURE_POD');
    expect(archive).toContain('cGhvdG8tc2VjcmV0');
    expect(input.ciphertext.type).toBe('application/octet-stream');
    expect(queue.snapshot().events.map((event) => event.envelope.entityRef)).toEqual([
      'AFTER-AUTHORIZATION',
    ]);
    expect(media.snapshot()).toEqual([]);
    expect((await store.getEvents()).map((event) => event.envelope.entityRef)).toEqual([
      'AFTER-AUTHORIZATION',
    ]);
    expect(await store.getMedia()).toEqual([]);
    expect(await queue.getMeta('last-takeover-export-receipt')).toEqual(receipt);
  });

  it('retains event and media when the server has not VERIFIED the receipt', async () => {
    const { store, queue, media } = await setup();
    const port = new MemoryPdaPort();
    const { jwk } = await createKeyPair();
    vi.spyOn(port, 'authorizeDeviceTakeoverExport').mockImplementation(
      async (deviceId, _key, body) => ({
        authorizationId,
        deviceId,
        scope,
        manifestHash: body.manifestHash,
        eventCount: 1,
        mediaCount: 1,
        expiresAt: '2099-12-31T23:59:59.000Z',
        keyEncryptionAlgorithm: 'RSA-OAEP-256',
        contentEncryptionAlgorithm: 'A256GCM',
        publicKeyJwk: {
          kty: 'RSA',
          kid: 'takeover-key-1',
          use: 'enc',
          alg: 'RSA-OAEP-256',
          key_ops: ['wrapKey'],
          n: jwk.n!,
          e: jwk.e!,
        },
        maxCiphertextBytes: 5_000_000,
        status: 'AUTHORIZED',
      })
    );
    vi.spyOn(port, 'uploadEncryptedDeviceTakeoverExport').mockImplementation(
      async (deviceId, receivedAuthorizationId, _key, input) => ({
        exportId: '01JTAKEOVEREXPORT0000000001',
        authorizationId: receivedAuthorizationId,
        deviceId,
        scope,
        manifestHash: input.manifestHash,
        ciphertextHash: input.ciphertextHash,
        eventCount: 1,
        mediaCount: 1,
        checksumAlgorithm: 'SHA-256',
        status: 'RECEIVED',
        receivedAt: '2026-07-22T12:00:00.000Z',
      })
    );

    await expect(
      new DeviceTakeoverService(queue, media, port).exportAndClear(session, '设备损坏，由主管接管')
    ).rejects.toThrow('未通过完整性验证');
    expect(await store.getEvents()).toHaveLength(1);
    expect(await store.getMedia()).toHaveLength(1);
  });

  it('moves to EXPIRED when the short-lived authorization expires during upload', async () => {
    const { store, queue, media } = await setup();
    const port = new MemoryPdaPort();
    const { jwk } = await createKeyPair();
    vi.spyOn(port, 'authorizeDeviceTakeoverExport').mockImplementation(
      async (deviceId, _key, body) => ({
        authorizationId,
        deviceId,
        scope,
        manifestHash: body.manifestHash,
        eventCount: body.eventCount,
        mediaCount: body.mediaCount,
        expiresAt: '2099-12-31T23:59:59.000Z',
        keyEncryptionAlgorithm: 'RSA-OAEP-256',
        contentEncryptionAlgorithm: 'A256GCM',
        publicKeyJwk: {
          kty: 'RSA',
          kid: 'takeover-key-1',
          use: 'enc',
          alg: 'RSA-OAEP-256',
          key_ops: ['wrapKey'],
          n: jwk.n!,
          e: jwk.e!,
        },
        maxCiphertextBytes: 5_000_000,
        status: 'AUTHORIZED',
      })
    );
    vi.spyOn(port, 'uploadEncryptedDeviceTakeoverExport').mockRejectedValue(
      new Error('接管授权已过期')
    );
    const progress = vi.fn();

    await expect(
      new DeviceTakeoverService(queue, media, port, undefined, progress).exportAndClear(
        session,
        '设备损坏，由主管接管'
      )
    ).rejects.toThrow('接管授权已过期');

    expect(progress.mock.calls.at(-1)?.[0]).toBe('EXPIRED');
    expect(await queue.getMeta('pending-takeover-upload')).toBeUndefined();
    expect(await store.getEvents()).toHaveLength(1);
    expect(await store.getMedia()).toHaveLength(1);
  });

  it('moves to FAILED when encryption fails instead of remaining ENCRYPTING', async () => {
    const { queue, media } = await setup();
    const port = new MemoryPdaPort();
    const progress = vi.fn();
    vi.spyOn(crypto.subtle, 'encrypt').mockRejectedValueOnce(new Error('crypto unavailable'));

    await expect(
      new DeviceTakeoverService(queue, media, port, undefined, progress).exportAndClear(
        session,
        '设备损坏，由主管接管'
      )
    ).rejects.toThrow('crypto unavailable');

    expect(progress.mock.calls.at(-1)?.[0]).toBe('FAILED');
    expect(await queue.getMeta('pending-takeover-upload')).toBeUndefined();
  });

  it('moves to FAILED when a non-expiry upload error occurs', async () => {
    const { queue, media } = await setup();
    const port = new MemoryPdaPort();
    const progress = vi.fn();
    vi.spyOn(port, 'uploadEncryptedDeviceTakeoverExport').mockRejectedValueOnce(
      new Error('gateway unavailable')
    );

    await expect(
      new DeviceTakeoverService(queue, media, port, undefined, progress).exportAndClear(
        session,
        '设备损坏，由主管接管'
      )
    ).rejects.toThrow('gateway unavailable');

    expect(progress.mock.calls.at(-1)?.[0]).toBe('FAILED');
    expect(await queue.getMeta('pending-takeover-upload')).toEqual(
      expect.objectContaining({ authorizationId: expect.any(String) })
    );
  });

  it('requires the dedicated permission before requesting authorization', async () => {
    const { queue, media } = await setup();
    const port = new MemoryPdaPort();
    const authorize = vi.spyOn(port, 'authorizeDeviceTakeoverExport');

    await expect(
      new DeviceTakeoverService(queue, media, port).exportAndClear(
        { ...session, permissions: ['pda.use'] },
        '设备损坏，由主管接管'
      )
    ).rejects.toThrow('pda.takeover.export');
    expect(authorize).not.toHaveBeenCalled();
  });
});
