import { describe, expect, it } from 'vitest';
import { createZhiliClient } from '@zhili/api-client';
import { createBooking, linehaulCapabilities, validateLoadCompatibility } from '../index';

describe('linehaul orchestration', () => {
  it('explains incompatible destination, dangerous goods and hold rows separately', () => {
    const result = validateLoadCompatibility([
      { waybillNo: 'S2505120004', destination: 'US-LAX', dangerousGoods: false, held: false },
      { waybillNo: 'S2505120005', destination: 'DE-FRA', dangerousGoods: false, held: false },
      { waybillNo: 'S2505120006', destination: 'US-LAX', dangerousGoods: true, held: true },
    ]);

    expect(result.allowed).toBe(false);
    expect(result.issues).toEqual([
      { waybillNo: 'S2505120005', reason: '目的地 DE-FRA 与装载单主目的地 US-LAX 不一致' },
      { waybillNo: 'S2505120006', reason: '危险品需单独的兼容规则与批准' },
      { waybillNo: 'S2505120006', reason: '运单已扣货，不可加入装载单' },
    ]);
  });

  it('covers booking, customs, FBA, last-mile intake, delivery and POD contracts', () => {
    expect(linehaulCapabilities.map((item) => item.operationId)).toEqual(
      expect.arrayContaining([
        'createBooking',
        'createBillOfLading',
        'validateLoadCompatibility',
        'linkFbaShipment',
        'createLastMileIntake',
        'scanLastMileIntake',
        'createDeliveryTask',
        'updateDeliveryTaskStatus',
        'captureProofOfDelivery',
        'amendProofOfDelivery',
        'syncLastMilePartner',
        'replayPartnerEvent',
        'generateLastMileCharges',
      ])
    );
  });

  it('sends a typed booking command through the generated OpenAPI client', async () => {
    let captured: Request | undefined;
    const client = createZhiliClient({
      baseUrl: 'https://api.zhili.test/v1',
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return new Response(
          JSON.stringify({
            data: {
              id: '01JYBOOKING000000000000000',
              bookingNo: 'BK2607220018',
              status: 'DRAFT',
              version: 1,
            },
            meta: { requestId: 'REQ-LINE-1', timestamp: '2026-07-22T08:00:00Z' },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        );
      },
    });

    await createBooking(
      client,
      {
        carrierId: '01JYCARRIER00000000000000',
        originPort: 'CN-SZX',
        destinationPort: 'US-LAX',
        plannedDepartureAt: '2026-07-28T08:00:00+08:00',
      },
      'booking:CN-SZX:US-LAX:20260728'
    );

    expect(captured?.url).toBe('https://api.zhili.test/v1/linehaul/bookings');
    expect(captured?.headers.get('Idempotency-Key')).toBe('booking:CN-SZX:US-LAX:20260728');
    await expect(captured?.json()).resolves.toMatchObject({ destinationPort: 'US-LAX' });
  });
});
