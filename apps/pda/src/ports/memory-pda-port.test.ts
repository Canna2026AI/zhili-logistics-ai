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

type TakeoverArchive = {
  manifest: {
    schemaVersion: number;
    scope: {
      deviceId: string;
      tenantId: string;
      warehouseId: string;
      subjectId: string;
    };
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
  };
  events: Array<{
    state: string;
    envelope: {
      eventId: string;
      deviceId: string;
      localSequence: number;
      tenantId: string;
      warehouseId: string;
      subjectId: string;
      action: string;
      entityRef: string;
      payload: Record<string, unknown>;
      mediaRefs: string[];
      baseVersion: number;
      idempotencyKey: string;
      occurredAt: string;
      timezone: string;
      appVersion: string;
    };
  }>;
  media: Array<{
    mediaId: string;
    eventId: string;
    contentHash: string;
    mimeType: string;
    bytesBase64: string;
    context?: {
      deviceId: string;
      tenantId: string;
      warehouseId: string;
      subjectId: string;
    };
  }>;
};

async function createEncryptedTakeover(options?: {
  tamperManifest?: boolean;
  withMedia?: boolean;
  orphanMedia?: boolean;
  unreferencedMedia?: boolean;
  duplicateEventField?: 'eventId' | 'localSequence' | 'idempotencyKey';
  mutateArchive?: (archive: TakeoverArchive) => void;
}) {
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
  const mediaBytes = new TextEncoder().encode('authentic-media-bytes');
  const mediaId = 'media-crypto-1';
  const eventEntries = [
    {
      eventId: '01JCRYPTOEVENT000000000001',
      localSequence: 1,
      idempotencyKey: 'pda:crypto:event:1',
      mediaRefs: options?.withMedia && !options.unreferencedMedia ? [mediaId] : [],
    },
  ];
  if (options?.duplicateEventField) {
    const duplicate = {
      eventId: '01JCRYPTOEVENT000000000002',
      localSequence: 2,
      idempotencyKey: 'pda:crypto:event:2',
      mediaRefs: [] as string[],
    };
    if (options.duplicateEventField === 'eventId') duplicate.eventId = eventEntries[0]!.eventId;
    if (options.duplicateEventField === 'localSequence')
      duplicate.localSequence = eventEntries[0]!.localSequence;
    if (options.duplicateEventField === 'idempotencyKey')
      duplicate.idempotencyKey = eventEntries[0]!.idempotencyKey;
    eventEntries.push(duplicate);
  }
  const mediaEntries = options?.withMedia
    ? [
        {
          mediaId,
          eventId: options.orphanMedia ? '01JCRYPTOORPHAN00000000001' : eventEntries[0]!.eventId,
          contentHash: await sha256Hex(mediaBytes),
          mimeType: 'image/jpeg',
        },
      ]
    : [];
  const manifest = {
    schemaVersion: 1,
    scope,
    eventCount: eventEntries.length,
    mediaCount: mediaEntries.length,
    events: eventEntries,
    media: mediaEntries,
  };
  const manifestHash = await sha256Hex(new TextEncoder().encode(canonical(manifest)));
  const authorization = await port.authorizeDeviceTakeoverExport(deviceId, 'takeover-auth-crypto', {
    reason: '设备损坏，由主管接管',
    manifestHash,
    eventCount: manifest.eventCount,
    mediaCount: manifest.mediaCount,
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
  const archive: TakeoverArchive = {
    manifest: archiveManifest,
    events: eventEntries.map((entry) => ({
      state: 'PENDING',
      envelope: {
        eventId: entry.eventId,
        deviceId,
        localSequence: entry.localSequence,
        tenantId: scope.tenantId,
        warehouseId: scope.warehouseId,
        subjectId: scope.subjectId,
        action: 'WAREHOUSE_RECEIVE',
        entityRef: 'CRYPTO-1',
        payload: {},
        mediaRefs: entry.mediaRefs,
        baseVersion: 1,
        idempotencyKey: entry.idempotencyKey,
        occurredAt: '2026-07-23T00:00:00.000Z',
        timezone: 'Asia/Shanghai',
        appVersion: '0.2.0',
      },
    })),
    media: mediaEntries.map((entry) => ({
      ...entry,
      bytesBase64: base64(mediaBytes),
      context: scope,
    })),
  };
  options?.mutateArchive?.(archive);
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

  it('rejects task lookup for an unbound device', async () => {
    await expect(new MemoryPdaPort().getDeviceTasks('01JUNBOUNDDEVICE0000000001')).rejects.toThrow(
      /绑定|device/i
    );
  });

  it('generates different scoped task IDs for different device bindings', async () => {
    const port = new MemoryPdaPort();
    const firstDevice = '01JSCOPEDDEVICE00000000001';
    const secondDevice = '01JSCOPEDDEVICE00000000002';
    await port.bindDevice(
      firstDevice,
      {
        warehouseId: '01JSCOPEDWAREHOUSE00000001',
        subjectId: '01JSCOPEDSUBJECT0000000001',
        deviceCode: 'PDA-SCOPE-01',
      },
      'bind-scope-1'
    );
    await port.bindDevice(
      secondDevice,
      {
        warehouseId: '01JSCOPEDWAREHOUSE00000002',
        subjectId: '01JSCOPEDSUBJECT0000000002',
        deviceCode: 'PDA-SCOPE-02',
      },
      'bind-scope-2'
    );

    const [firstTasks, secondTasks] = await Promise.all([
      port.getDeviceTasks(firstDevice),
      port.getDeviceTasks(secondDevice),
    ]);

    expect(firstTasks.map((task) => task.reference)).toEqual(
      secondTasks.map((task) => task.reference)
    );
    expect(firstTasks.map((task) => task.id)).not.toEqual(secondTasks.map((task) => task.id));
    expect(new Set(firstTasks.map((task) => task.id)).size).toBe(firstTasks.length);
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

  it('returns the same VERIFIED receipt when the exact upload is retried with the same idempotency key', async () => {
    const { port, authorization, input } = await createEncryptedTakeover();
    const idempotencyKey = 'takeover-upload-idempotent';

    const first = await port.uploadEncryptedDeviceTakeoverExport(
      authorization.deviceId,
      authorization.authorizationId,
      idempotencyKey,
      input
    );
    const recovered = await port.uploadEncryptedDeviceTakeoverExport(
      authorization.deviceId,
      authorization.authorizationId,
      idempotencyKey,
      input
    );

    expect(recovered).toEqual(first);
  });

  it('rejects reuse of a takeover upload idempotency key for different ciphertext', async () => {
    const { port, authorization, input } = await createEncryptedTakeover();
    const idempotencyKey = 'takeover-upload-idempotency-conflict';
    await port.uploadEncryptedDeviceTakeoverExport(
      authorization.deviceId,
      authorization.authorizationId,
      idempotencyKey,
      input
    );

    await expect(
      port.uploadEncryptedDeviceTakeoverExport(
        authorization.deviceId,
        authorization.authorizationId,
        idempotencyKey,
        { ...input, ciphertextHash: 'f'.repeat(64) }
      )
    ).rejects.toThrow(/Idempotency|幂等|不一致/);
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

  it.each([
    ['eventId', (archive: TakeoverArchive) => (archive.events[0]!.envelope.eventId = 'OTHER')],
    [
      'localSequence',
      (archive: TakeoverArchive) => (archive.events[0]!.envelope.localSequence = 9),
    ],
    [
      'idempotencyKey',
      (archive: TakeoverArchive) =>
        (archive.events[0]!.envelope.idempotencyKey = 'pda:crypto:altered'),
    ],
    [
      'mediaRefs',
      (archive: TakeoverArchive) => (archive.events[0]!.envelope.mediaRefs = ['unlisted-media']),
    ],
  ])(
    'rejects an authentic archive whose event %s differs from its manifest entry',
    async (_, mutateArchive) => {
      const { port, authorization, input } = await createEncryptedTakeover({ mutateArchive });
      await expect(
        port.uploadEncryptedDeviceTakeoverExport(
          authorization.deviceId,
          authorization.authorizationId,
          `takeover-upload-event-${String(_)}`,
          input
        )
      ).rejects.toThrow(/manifest|清单|事件/);
    }
  );

  it.each([
    ['mediaId', (archive: TakeoverArchive) => (archive.media[0]!.mediaId = 'other-media')],
    ['eventId', (archive: TakeoverArchive) => (archive.media[0]!.eventId = 'other-event')],
    ['contentHash', (archive: TakeoverArchive) => (archive.media[0]!.contentHash = 'f'.repeat(64))],
    ['mimeType', (archive: TakeoverArchive) => (archive.media[0]!.mimeType = 'image/png')],
  ])(
    'rejects an authentic archive whose media %s differs from its manifest entry',
    async (_, mutateArchive) => {
      const { port, authorization, input } = await createEncryptedTakeover({
        withMedia: true,
        mutateArchive,
      });
      await expect(
        port.uploadEncryptedDeviceTakeoverExport(
          authorization.deviceId,
          authorization.authorizationId,
          `takeover-upload-media-${String(_)}`,
          input
        )
      ).rejects.toThrow(/manifest|清单|媒体/);
    }
  );

  it('recomputes media bytes SHA-256 instead of trusting the declared contentHash', async () => {
    const { port, authorization, input } = await createEncryptedTakeover({
      withMedia: true,
      mutateArchive: (archive) => {
        archive.media[0]!.bytesBase64 = base64(new TextEncoder().encode('tampered-media'));
      },
    });
    await expect(
      port.uploadEncryptedDeviceTakeoverExport(
        authorization.deviceId,
        authorization.authorizationId,
        'takeover-upload-media-bytes',
        input
      )
    ).rejects.toThrow(/SHA-256|哈希|媒体/);
  });

  it('rejects an otherwise authentic archive whose media points to a missing event', async () => {
    const { port, authorization, input } = await createEncryptedTakeover({
      withMedia: true,
      orphanMedia: true,
    });

    await expect(
      port.uploadEncryptedDeviceTakeoverExport(
        authorization.deviceId,
        authorization.authorizationId,
        'takeover-upload-orphan-media',
        input
      )
    ).rejects.toThrow(/引用|事件|媒体|orphan/i);
  });

  it('rejects an otherwise authentic archive whose event does not reference its media', async () => {
    const { port, authorization, input } = await createEncryptedTakeover({
      withMedia: true,
      unreferencedMedia: true,
    });

    await expect(
      port.uploadEncryptedDeviceTakeoverExport(
        authorization.deviceId,
        authorization.authorizationId,
        'takeover-upload-unreferenced-media',
        input
      )
    ).rejects.toThrow(/引用|事件|媒体|orphan/i);
  });

  it.each([
    ['missing', (archive: TakeoverArchive) => delete archive.media[0]!.context],
    [
      'mismatched',
      (archive: TakeoverArchive) => {
        archive.media[0]!.context = {
          ...archive.manifest.scope,
          warehouseId: '01JOTHERWAREHOUSE000000001',
        };
      },
    ],
  ])('rejects media with %s context', async (_, mutateArchive) => {
    const { port, authorization, input } = await createEncryptedTakeover({
      withMedia: true,
      mutateArchive,
    });
    await expect(
      port.uploadEncryptedDeviceTakeoverExport(
        authorization.deviceId,
        authorization.authorizationId,
        `takeover-upload-context-${String(_)}`,
        input
      )
    ).rejects.toThrow(/作用域|context|媒体/);
  });

  it.each(['eventId', 'localSequence', 'idempotencyKey'] as const)(
    'rejects duplicate manifest and archive event %s values',
    async (duplicateEventField) => {
      const { port, authorization, input } = await createEncryptedTakeover({
        duplicateEventField,
      });
      await expect(
        port.uploadEncryptedDeviceTakeoverExport(
          authorization.deviceId,
          authorization.authorizationId,
          `takeover-upload-duplicate-${duplicateEventField}`,
          input
        )
      ).rejects.toThrow(/重复|duplicate|事件/);
    }
  );
});
