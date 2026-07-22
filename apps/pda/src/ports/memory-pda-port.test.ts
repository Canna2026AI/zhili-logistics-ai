import { describe, expect, it } from 'vitest';
import { MemoryPdaPort } from './memory-pda-port';

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
});
