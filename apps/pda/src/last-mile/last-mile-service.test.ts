import { describe, expect, it, vi } from 'vitest';
import { LastMileService } from './last-mile-service';
import { MemoryPdaPort } from '../ports/memory-pda-port';

const taskId = '01JDELIVERY000000000000001';
const eventId = '01JDEVEVENT000000000000001';

describe('LastMileService', () => {
  it('performs the real PALLETIZED transition and trusts only the authoritative receipt', async () => {
    const port = new MemoryPdaPort();
    const call = vi.spyOn(port, 'updateDeliveryTaskStatus').mockResolvedValue({
      deviceEventId: eventId,
      disposition: 'APPLIED',
      deliveryTask: {
        id: taskId,
        taskNo: 'LM250722001',
        status: 'PALLETIZED',
        waybillCount: 2,
        version: 42,
      },
      claimedMediaRefs: ['media-pallet'],
    });
    const service = new LastMileService(
      port,
      { taskId, status: 'PLANNED', version: 7 },
      () => new Date('2026-07-22T10:00:00.000Z')
    );

    const receipt = await service.transition(
      eventId,
      'PALLETIZED',
      { scannedCode: 'LM250722001', palletId: 'PLT-001' },
      ['media-pallet']
    );

    expect(call).toHaveBeenCalledWith(taskId, '"7"', expect.stringContaining(eventId), {
      deviceEventId: eventId,
      targetStatus: 'PALLETIZED',
      occurredAt: '2026-07-22T10:00:00.000Z',
      mediaRefs: ['media-pallet'],
      scanEvidence: { scannedCode: 'LM250722001', palletId: 'PLT-001' },
    });
    expect(receipt.disposition).toBe('APPLIED');
    expect(service.snapshot()).toMatchObject({ status: 'PALLETIZED', version: 42 });
  });

  it('does not advance delivery state when the production port rejects', async () => {
    const port = new MemoryPdaPort();
    port.updateDeliveryTaskStatus = vi.fn().mockRejectedValue(new Error('409 stale'));
    const service = new LastMileService(port, { taskId, status: 'LOADED', version: 7 });

    await expect(
      service.transition(eventId, 'OUT_FOR_DELIVERY', { scannedCode: 'LM250722001' })
    ).rejects.toThrow('409');
    expect(service.snapshot()).toMatchObject({ status: 'LOADED', version: 7 });
  });

  it('fails closed when a transition receipt does not confirm the exact event', async () => {
    const port = new MemoryPdaPort();
    port.updateDeliveryTaskStatus = vi.fn().mockResolvedValue({
      deviceEventId: '01JOTHER00000000000000001',
      disposition: 'APPLIED',
      deliveryTask: {
        id: taskId,
        taskNo: 'LM250722001',
        status: 'OUT_FOR_DELIVERY',
        waybillCount: 1,
        version: 99,
      },
      claimedMediaRefs: [],
    });
    const service = new LastMileService(port, { taskId, status: 'LOADED', version: 7 });

    await expect(
      service.transition(eventId, 'OUT_FOR_DELIVERY', { scannedCode: 'LM250722001' })
    ).rejects.toThrow('回执');
    expect(service.snapshot()).toMatchObject({ status: 'LOADED', version: 7 });
  });

  it('rejects a forged non-success transition disposition at runtime', async () => {
    const port = new MemoryPdaPort();
    port.updateDeliveryTaskStatus = vi.fn().mockResolvedValue({
      deviceEventId: eventId,
      disposition: 'REJECTED' as never,
      deliveryTask: {
        id: taskId,
        taskNo: 'LM250722001',
        status: 'OUT_FOR_DELIVERY',
        waybillCount: 1,
        version: 8,
      },
      claimedMediaRefs: [],
    });
    const service = new LastMileService(port, { taskId, status: 'LOADED', version: 7 });

    await expect(
      service.transition(eventId, 'OUT_FOR_DELIVERY', { scannedCode: 'LM250722001' })
    ).rejects.toThrow('回执');
    expect(service.snapshot()).toMatchObject({ status: 'LOADED', version: 7 });
  });

  it('uses the POD authoritative aggregate and never increments the version locally', async () => {
    const port = new MemoryPdaPort();
    const capture = vi.spyOn(port, 'captureProofOfDelivery').mockResolvedValue({
      deviceEventId: eventId,
      disposition: 'DUPLICATE',
      deliveryTask: {
        id: taskId,
        taskNo: 'LM250722001',
        status: 'COMPLETED',
        waybillCount: 1,
        version: 63,
      },
      proofOfDelivery: {
        id: '01JPOD0000000000000000001',
        deliveryTaskId: taskId,
        versionNo: 4,
        recipientName: '陈女士',
        signedAt: '2026-07-22T10:00:00.000Z',
        evidenceRefs: ['media-pod'],
      },
      claimedMediaRefs: ['media-pod'],
    });
    const service = new LastMileService(port, {
      taskId,
      status: 'OUT_FOR_DELIVERY',
      version: 8,
    });
    const input = {
      deviceEventId: eventId,
      recipientName: '陈女士',
      signedAt: '2026-07-22T10:00:00.000Z',
      evidenceRefs: ['media-pod'],
    };

    const receipt = await service.capturePod(input, [{ mediaId: 'media-pod', status: 'SCANNING' }]);

    expect(capture).toHaveBeenCalledWith(taskId, '"8"', expect.stringContaining(eventId), input);
    expect(receipt.disposition).toBe('DUPLICATE');
    expect(service.snapshot()).toMatchObject({ status: 'COMPLETED', version: 63 });
  });

  it('rejects illegal delivery and incomplete POD intents before calling the port', async () => {
    const port = new MemoryPdaPort();
    const transition = vi.spyOn(port, 'updateDeliveryTaskStatus');
    const completed = new LastMileService(port, { taskId, status: 'COMPLETED', version: 1 });
    await expect(
      completed.transition(eventId, 'COMPLETED', { scannedCode: 'LM1' })
    ).rejects.toThrow('非法');
    expect(transition).not.toHaveBeenCalled();

    const delivering = new LastMileService(port, {
      taskId,
      status: 'OUT_FOR_DELIVERY',
      version: 8,
    });
    await expect(
      delivering.capturePod(
        {
          deviceEventId: eventId,
          recipientName: '陈女士',
          signedAt: '2026-07-22T10:00:00.000Z',
          evidenceRefs: [],
        },
        []
      )
    ).rejects.toThrow('至少一份');
  });
});
