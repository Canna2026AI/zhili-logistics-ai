import type { paths } from '@zhili/contracts';
import type { ZhiliApiClient } from '@zhili/api-client';

export interface TrackingTimelineEvent {
  id: string;
  occurredAt: string;
  receivedAt: string;
  status: string;
}

export interface NormalizedTrackingEvent extends TrackingTimelineEvent {
  duplicateCount: number;
  lateArrival: boolean;
}

export function normalizeTrackingTimeline(
  events: TrackingTimelineEvent[]
): NormalizedTrackingEvent[] {
  const byId = new Map<string, TrackingTimelineEvent[]>();
  for (const event of events) {
    byId.set(event.id, [...(byId.get(event.id) ?? []), event]);
  }
  const ordered = [...byId.values()]
    .map((duplicates) => ({
      ...duplicates[0]!,
      duplicateCount: duplicates.length,
      lateArrival: false,
    }))
    .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));

  let latestReceivedAt = 0;
  return ordered.map((event) => {
    const receivedAt = Date.parse(event.receivedAt);
    const lateArrival =
      receivedAt < latestReceivedAt || receivedAt - Date.parse(event.occurredAt) > 3_600_000;
    latestReceivedAt = Math.max(latestReceivedAt, receivedAt);
    return { ...event, lateArrival };
  });
}

export const trackingSupportCapabilities = [
  { id: 'TRK-01', operationId: 'ingestTrackingEvent', path: '/tracking/events:ingest' },
  { id: 'TRK-02', operationId: 'appendManualTrackingEvent', path: '/tracking/events:manual' },
  { id: 'TRK-03', operationId: 'detectTrackingStall', path: '/tracking/stalls:detect' },
  { id: 'CS-01', operationId: 'createIssue', path: '/issues' },
  { id: 'CS-01', operationId: 'assignIssue', path: '/issues/{issueId}:assign' },
  {
    id: 'CS-02',
    operationId: 'requestIssueMaterial',
    path: '/issues/{issueId}/material-requests',
  },
  { id: 'CS-02', operationId: 'resolveIssue', path: '/issues/{issueId}:resolve' },
  { id: 'CS-03', operationId: 'createClaim', path: '/claims' },
  { id: 'CS-03', operationId: 'settleClaim', path: '/claims/{claimId}:settle' },
  { id: 'HOLD-01', operationId: 'placeShipmentHold', path: '/shipment-holds' },
  {
    id: 'HOLD-01',
    operationId: 'releaseShipmentHold',
    path: '/shipment-holds/{holdId}:release',
  },
] as const satisfies ReadonlyArray<{ id: string; operationId: string; path: keyof paths }>;

export interface SupportResolutionResult {
  issueState: 'RESOLVED';
  notificationState: 'SENT' | 'FAILED';
  retryJobId?: string;
}

export function resolveIssueWithNotification(
  notificationSucceeded: boolean
): SupportResolutionResult {
  return notificationSucceeded
    ? { issueState: 'RESOLVED', notificationState: 'SENT' }
    : { issueState: 'RESOLVED', notificationState: 'FAILED', retryJobId: 'JOB-NOTIFY-5001' };
}

export type IngestTrackingEventBody =
  paths['/tracking/events:ingest']['post']['requestBody']['content']['application/json'];

export function ingestTrackingEvent(
  client: ZhiliApiClient,
  body: IngestTrackingEventBody,
  idempotencyKey: string
) {
  return client.POST('/tracking/events:ingest', {
    body,
    params: { header: { 'Idempotency-Key': idempotencyKey } },
  });
}
