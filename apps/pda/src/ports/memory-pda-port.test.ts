import { describe, expect, it } from 'vitest';
import { MemoryPdaPort } from './memory-pda-port';

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

function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createEncryptedTakeover(options?: { tamperManifest?: boolean }) {
  const port = new MemoryPdaPort();
  const deviceId = '01JCRYPTODEVICE000000000001';
  const session = await port.bindDevice(
    deviceId,
    {
      warehouseId: '01JCRYPTOWAREHOUSE00000001',
      subjectId: '01JCRYPTOSUBJECT0000000001',
      deviceCode: 'PDA-CRYPTO-01',
    },
    'bind-crypto-device'
  );
  const scope = {
    deviceId,
    tenantId: session.tenantId,
    warehouseId: session.warehouseId,
    subjectId: session.subjectId,
  };
  const manifest = {
    schemaVersion: 1,
    scope,
    eventCount: 1,
    mediaCount: 0,
    events: [
      {
        eventId: '01JCRYPTOEVENT000000000001',
        localSequence: 1,
        idempotencyKey: 'pda:crypto:event:1',
        mediaRefs: [],
      },
    ],
    media: [],
  };
  const manifestHash = await sha256Hex(new TextEncoder().encode(canonical(manifest)));
  const authorization = await port.authorizeDeviceTakeoverExport(deviceId, 'takeover-auth-crypto', {
    reason: '设备损坏，由主管接管',
    manifestHash,
    eventCount: 1,
    mediaCount: 0,
  });
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    authorization.publicKeyJwk as JsonWebKey,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['wrapKey']
  );
  const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const archiveManifest = options?.tamperManifest ? { ...manifest, eventCount: 2 } : manifest;
  const archive = {
    manifest: archiveManifest,
    events: [
      {
        state: 'PENDING',
        envelope: {
          eventId: manifest.events[0]!.eventId,
          deviceId,
          localSequence: 1,
          tenantId: scope.tenantId,
          warehouseId: scope.warehouseId,
          subjectId: scope.subjectId,
          action: 'WAREHOUSE_RECEIVE',
          entityRef: 'CRYPTO-1',
          payload: {},
          mediaRefs: [],
          baseVersion: 1,
          idempotencyKey: manifest.events[0]!.idempotencyKey,
          occurredAt: '2026-07-23T00:00:00.000Z',
          timezone: 'Asia/Shanghai',
          appVersion: '0.2.0',
        },
      },
    ],
    media: [],
  };
  const plaintext = new TextEncoder().encode(canonical(archive));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext)
  );
  const wrappedKey = await crypto.subtle.wrapKey('raw', aesKey, publicKey, {
    name: 'RSA-OAEP',
  });
  return {
    port,
    authorization,
    input: {
      manifestHash,
      ciphertextHash: await sha256Hex(ciphertext),
      ciphertext: new Blob([ciphertext]),
      iv: base64(iv),
      wrappedKey: new Blob([wrappedKey]),
    },
  };
}

describe('MemoryPdaPort F09 demo tasks', () => {
  it('provides scoped tasks for every warehouse and last-mile workflow family', async () => {
    const tasks = await new MemoryPdaPort().getDeviceTasks('01JDEVICE00000000000000003');

    expect(tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reference: 'MOVE-DEMO', type: 'MOVE', status: 'READY' }),
        expect.objectContaining({ reference: 'PICK-DEMO', type: 'PICK', status: 'READY' }),
        expect.objectContaining({ reference: 'LOAD-DEMO', type: 'LOAD', status: 'READY' }),
        expect.objectContaining({ reference: 'DISPATCH-DEMO', type: 'DISPATCH', status: 'READY' }),
        expect.objectContaining({
          reference: 'STOCKTAKE-DEMO',
          type: 'STOCKTAKE',
          status: 'READY',
        }),
        expect.objectContaining({
          reference: 'LM-PLANNED',
          type: 'LAST_MILE_DELIVERY',
          status: 'PLANNED',
        }),
        expect.objectContaining({
          reference: 'LM-PALLETIZED',
          type: 'LAST_MILE_DELIVERY',
          status: 'PALLETIZED',
        }),
        expect.objectContaining({
          reference: 'LM-OUT',
          type: 'LAST_MILE_DELIVERY',
          status: 'OUT_FOR_DELIVERY',
        }),
      ])
    );
  });

  it('rejects a takeover upload when the declared ciphertext hash is not authentic', async () => {
    const port = new MemoryPdaPort();
    const authorization = await port.authorizeDeviceTakeoverExport(
      '01JDEVICE00000000000000003',
      'takeover-auth-key',
      {
        reason: '设备损坏，由主管接管',
        manifestHash: 'manifest-sha256',
        eventCount: 1,
        mediaCount: 0,
      }
    );

    await expect(
      port.uploadEncryptedDeviceTakeoverExport(
        authorization.deviceId,
        authorization.authorizationId,
        'takeover-upload-key',
        {
          manifestHash: authorization.manifestHash,
          ciphertextHash: 'not-the-real-sha256',
          ciphertext: new Blob(['encrypted-package']),
          iv: 'AAECAwQFBgcICQoL',
          wrappedKey: new Blob(['wrapped-aes-key']),
        }
      )
    ).rejects.toThrow('密文哈希');
  });

  it('decrypts and verifies a canonical takeover archive before returning VERIFIED', async () => {
    const { port, authorization, input } = await createEncryptedTakeover();

    const receipt = await port.uploadEncryptedDeviceTakeoverExport(
      authorization.deviceId,
      authorization.authorizationId,
      'takeover-upload-valid',
      input
    );

    expect(receipt.status).toBe('VERIFIED');
    expect(receipt.scope).toEqual(authorization.scope);
  });

  it('rejects an IV that is not exactly 12 bytes', async () => {
    const { port, authorization, input } = await createEncryptedTakeover();
    await expect(
      port.uploadEncryptedDeviceTakeoverExport(
        authorization.deviceId,
        authorization.authorizationId,
        'takeover-upload-bad-iv',
        { ...input, iv: 'AA==' }
      )
    ).rejects.toThrow(/IV|iv/);
  });

  it('rejects a wrapped key that cannot be unwrapped by the authorization private key', async () => {
    const { port, authorization, input } = await createEncryptedTakeover();
    await expect(
      port.uploadEncryptedDeviceTakeoverExport(
        authorization.deviceId,
        authorization.authorizationId,
        'takeover-upload-bad-key',
        { ...input, wrappedKey: new Blob([new Uint8Array([1, 2, 3])]) }
      )
    ).rejects.toThrow(/AES|RSA|密钥|解封/);
  });

  it('rejects ciphertext with an invalid AES-GCM authentication tag even when its hash matches', async () => {
    const { port, authorization, input } = await createEncryptedTakeover();
    const tampered = new Uint8Array(await input.ciphertext.arrayBuffer());
    tampered[tampered.length - 1] ^= 1;
    await expect(
      port.uploadEncryptedDeviceTakeoverExport(
        authorization.deviceId,
        authorization.authorizationId,
        'takeover-upload-bad-tag',
        {
          ...input,
          ciphertext: new Blob([tampered]),
          ciphertextHash: await sha256Hex(tampered),
        }
      )
    ).rejects.toThrow(/AES-GCM|认证|解密/);
  });

  it('rejects a manifest changed inside otherwise authentic ciphertext', async () => {
    const { port, authorization, input } = await createEncryptedTakeover({ tamperManifest: true });
    await expect(
      port.uploadEncryptedDeviceTakeoverExport(
        authorization.deviceId,
        authorization.authorizationId,
        'takeover-upload-tampered-manifest',
        input
      )
    ).rejects.toThrow(/manifest|清单|哈希/);
  });
});
