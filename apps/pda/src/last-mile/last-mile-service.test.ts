import { describe, expect, it, vi } from 'vitest';
import { LastMileService } from './last-mile-service';
import { MemoryPdaPort } from '../ports/memory-pda-port';

describe('LastMileService', () => {
  it('does not advance delivery state when the production port rejects', async () => {
    const port = new MemoryPdaPort();
    port.updateDeliveryTaskStatus = vi.fn().mockRejectedValue(new Error('409 stale'));
    const service = new LastMileService(port, {
      taskId: '01JDELIVERY000000000000001',
      status: 'LOADED',
      version: 7,
    });

    await expect(
      service.transition('OUT_FOR_DELIVERY', { scannedCode: 'LM250722001' })
    ).rejects.toThrow('409');
    expect(service.snapshot().status).toBe('LOADED');
  });

  it('rejects illegal delivery transitions before calling the port', async () => {
    const port = new MemoryPdaPort();
    const call = vi.spyOn(port, 'updateDeliveryTaskStatus');
    const service = new LastMileService(port, {
      taskId: '01JDELIVERY000000000000001',
      status: 'COMPLETED',
      version: 1,
    });
    await expect(service.transition('COMPLETED', { scannedCode: 'LM1' })).rejects.toThrow('非法');
    expect(call).not.toHaveBeenCalled();
  });

  it('requires READY photo or signature evidence and does not mark POD complete on upload failure', async () => {
    const port = new MemoryPdaPort();
    const service = new LastMileService(port, {
      taskId: '01JDELIVERY000000000000001',
      status: 'OUT_FOR_DELIVERY',
      version: 8,
    });
    await expect(
      service.capturePod(
        { recipientName: '陈女士', signedAt: '2026-07-22T10:00:00.000Z', evidenceRefs: [] },
        []
      )
    ).rejects.toThrow('READY');
    expect(service.snapshot().pod).toBeUndefined();

    port.captureProofOfDelivery = vi.fn().mockRejectedValue(new Error('upload rejected'));
    await expect(
      service.capturePod(
        {
          recipientName: '陈女士',
          signedAt: '2026-07-22T10:00:00.000Z',
          evidenceRefs: ['media-pod'],
        },
        [{ mediaId: 'media-pod', status: 'READY' }]
      )
    ).rejects.toThrow('upload rejected');
    expect(service.snapshot().pod).toBeUndefined();
  });
});
