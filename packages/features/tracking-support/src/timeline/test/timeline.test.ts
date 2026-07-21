import { describe, expect, it } from 'vitest';
import { createZhiliClient } from '@zhili/api-client';
import {
  ingestTrackingEvent,
  normalizeTrackingTimeline,
  resolveIssueWithNotification,
  trackingSupportCapabilities,
} from '../index';

describe('tracking and support timeline', () => {
  it('deduplicates carrier events and orders late arrivals by occurrence time', () => {
    const timeline = normalizeTrackingTimeline([
      {
        id: 'delivered',
        occurredAt: '2026-07-22T03:00:00Z',
        receivedAt: '2026-07-22T03:00:01Z',
        status: 'DELIVERED',
      },
      {
        id: 'picked-up',
        occurredAt: '2026-07-21T03:00:00Z',
        receivedAt: '2026-07-22T04:00:00Z',
        status: 'PICKED_UP',
      },
      {
        id: 'delivered',
        occurredAt: '2026-07-22T03:00:00Z',
        receivedAt: '2026-07-22T03:00:02Z',
        status: 'DELIVERED',
      },
    ]);

    expect(timeline.map((event) => event.id)).toEqual(['picked-up', 'delivered']);
    expect(timeline[0]?.lateArrival).toBe(true);
    expect(timeline[1]?.duplicateCount).toBe(2);
  });

  it('exposes tracking, issue, return, claim and audited hold commands', () => {
    expect(trackingSupportCapabilities.map((item) => item.operationId)).toEqual(
      expect.arrayContaining([
        'ingestTrackingEvent',
        'appendManualTrackingEvent',
        'detectTrackingStall',
        'createIssue',
        'assignIssue',
        'resolveIssue',
        'createClaim',
        'settleClaim',
        'placeShipmentHold',
        'releaseShipmentHold',
      ])
    );
  });

  it('sends event and receive timestamps through the generated tracking client', async () => {
    let captured: Request | undefined;
    const client = createZhiliClient({
      baseUrl: 'https://api.zhili.test/v1',
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return new Response(
          JSON.stringify({
            data: {
              id: '01JYTRACK0000000000000000',
              eventId: 'DHL-20260722-001',
              disposition: 'APPLIED',
              occurredAt: '2026-07-22T07:00:00Z',
              receivedAt: '2026-07-22T07:00:05Z',
            },
            meta: { requestId: 'REQ-TRK-1', timestamp: '2026-07-22T07:00:05Z' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    });

    await ingestTrackingEvent(
      client,
      {
        eventId: 'DHL-20260722-001',
        waybillId: '01JYWAYBILL0000000000000',
        source: 'DHL',
        statusCode: 'DELIVERED',
        occurredAt: '2026-07-22T07:00:00Z',
        receivedAt: '2026-07-22T07:00:05Z',
      },
      'tracking:DHL-20260722-001'
    );

    expect(captured?.url).toBe('https://api.zhili.test/v1/tracking/events:ingest');
    await expect(captured?.json()).resolves.toMatchObject({
      occurredAt: '2026-07-22T07:00:00Z',
      receivedAt: '2026-07-22T07:00:05Z',
    });
  });

  it('keeps issue resolution committed when customer notification partially fails', () => {
    expect(resolveIssueWithNotification(false)).toEqual({
      issueState: 'RESOLVED',
      notificationState: 'FAILED',
      retryJobId: 'JOB-NOTIFY-5001',
    });
  });
});
