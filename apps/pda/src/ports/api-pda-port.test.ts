import { describe, expect, it } from 'vitest';
import { createZhiliClient } from '@zhili/api-client';
import { createApiPdaPort } from './api-pda-port';
import { PdaApiError } from './pda-port';
import type { DeviceEventEnvelope } from '../domain/types';

const envelope: DeviceEventEnvelope = {
  eventId: '01JY8Z8F6ME4F0Y9QH2X6D4R7',
  deviceId: '01JDEVICE00000000000000003',
  localSequence: 1842,
  tenantId: '01JTENANT0000000000000001',
  warehouseId: '01JWAREHOUSE00000000000001',
  subjectId: '01JSUBJECT0000000000000001',
  action: 'WAREHOUSE_RECEIVE',
  entityRef: 'S2505120004',
  payload: { actualWeightKg: '123.50' },
  mediaRefs: [],
  baseVersion: 7,
  idempotencyKey: 'receive:S2505120004:123.50:20260722',
  occurredAt: '2026-07-22T01:15:32.000Z',
  timezone: 'Asia/Shanghai',
  appVersion: '0.2.0',
};

const meta = { requestId: 'req-pda-test', asOf: '2026-07-22T01:16:00.000Z' };

describe('createApiPdaPort', () => {
  it('uses the generated device routes and required idempotency headers', async () => {
    const requests: Request[] = [];
    const fetch: typeof globalThis.fetch = async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request.clone());
      const path = new URL(request.url).pathname;
      if (path.endsWith(':bind'))
        return Response.json({
          data: {
            deviceId: envelope.deviceId,
            warehouseId: envelope.warehouseId,
            subjectId: envelope.subjectId,
            expiresAt: '2026-07-22T18:00:00.000Z',
          },
          meta,
        });
      if (path.endsWith('/tasks')) return Response.json({ data: [], meta });
      return Response.json({
        data: [{ eventId: envelope.eventId, disposition: 'APPLIED', serverVersion: 8 }],
        meta,
      });
    };
    const port = createApiPdaPort(createZhiliClient({ baseUrl: 'https://pda.test/api/v1', fetch }));

    await port.bindDevice(
      envelope.deviceId,
      {
        warehouseId: envelope.warehouseId,
        subjectId: envelope.subjectId,
        deviceCode: 'PDA-SZX-03',
      },
      'bind-device-0000000001'
    );
    await port.getDeviceTasks(envelope.deviceId);
    await port.syncDeviceEvents([envelope], 'sync-events-000000001');

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      `/api/v1/devices/${envelope.deviceId}:bind`,
      `/api/v1/devices/${envelope.deviceId}/tasks`,
      '/api/v1/devices/events:sync',
    ]);
    expect(requests[0]?.headers.get('Idempotency-Key')).toBe('bind-device-0000000001');
    expect(requests[2]?.headers.get('Idempotency-Key')).toBe('sync-events-000000001');
    expect(requests.every((request) => request.credentials === 'include')).toBe(true);
  });

  it('sends strong If-Match and Idempotency-Key headers for conflict, delivery and POD writes', async () => {
    const requests: Request[] = [];
    const fetch: typeof globalThis.fetch = async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request.clone());
      const path = new URL(request.url).pathname;
      if (path.includes('device-conflicts'))
        return Response.json({
          data: {
            id: '01JCONFLICT000000000000001',
            localEvent: envelope,
            serverVersion: 9,
            serverState: { status: 'PICKED' },
            differences: [],
            status: 'RESOLVED',
            version: 3,
          },
          meta,
        });
      if (path.endsWith('proof-of-delivery'))
        return Response.json(
          {
            data: {
              id: '01JPOD0000000000000000001',
              deliveryTaskId: '01JDELIVERY000000000000001',
              versionNo: 1,
              recipientName: '陈女士',
              signedAt: '2026-07-22T10:00:00.000Z',
              evidenceRefs: ['media-pod'],
            },
            meta,
          },
          { status: 201 }
        );
      return Response.json({
        data: { resourceId: '01JDELIVERY000000000000001', status: 'SUCCEEDED', version: 8 },
        meta,
      });
    };
    const port = createApiPdaPort(createZhiliClient({ baseUrl: 'https://pda.test/api/v1', fetch }));

    await port.resolveDeviceConflict('01JCONFLICT000000000000001', '"2"', 'resolve-conflict-0001', {
      resolution: 'KEEP_SERVER',
      reason: '服务器记录已确认',
    });
    await port.updateDeliveryTaskStatus(
      '01JDELIVERY000000000000001',
      '"7"',
      'delivery-status-0001',
      { id: '01JDELIVERY000000000000001', version: 7 }
    );
    await port.captureProofOfDelivery('01JDELIVERY000000000000001', '"8"', 'capture-pod-0000001', {
      recipientName: '陈女士',
      signedAt: '2026-07-22T10:00:00.000Z',
      latitude: 22.5431,
      longitude: 114.0579,
      evidenceRefs: ['media-pod'],
      note: '本人签收',
    });
    await port.amendProofOfDelivery('01JDELIVERY000000000000001', '"9"', 'amend-pod-00000001', {
      id: '01JPOD0000000000000000001',
      deliveryTaskId: '01JDELIVERY000000000000001',
      versionNo: 2,
      recipientName: '陈女士',
      signedAt: '2026-07-22T10:00:00.000Z',
      evidenceRefs: ['media-pod'],
    });

    for (const request of requests) {
      expect(request.headers.get('If-Match')).toMatch(/^"\d+"$/);
      expect(request.headers.get('Idempotency-Key')).toMatch(/.{16,}/);
      expect(request.method).toBe('POST');
      expect(request.credentials).toBe('include');
    }
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/api/v1/device-conflicts/01JCONFLICT000000000000001:resolve',
      '/api/v1/last-mile/delivery-tasks/01JDELIVERY000000000000001:transition',
      '/api/v1/last-mile/delivery-tasks/01JDELIVERY000000000000001/proof-of-delivery',
      '/api/v1/last-mile/delivery-tasks/01JDELIVERY000000000000001/proof-of-delivery:amend',
    ]);
    await expect(requests[0]!.json()).resolves.toEqual({
      resolution: 'KEEP_SERVER',
      reason: '服务器记录已确认',
    });
    await expect(requests[1]!.json()).resolves.toEqual({
      id: '01JDELIVERY000000000000001',
      version: 7,
    });
    await expect(requests[2]!.json()).resolves.toMatchObject({
      recipientName: '陈女士',
      evidenceRefs: ['media-pod'],
    });
    await expect(requests[3]!.json()).resolves.toMatchObject({
      id: '01JPOD0000000000000000001',
      versionNo: 2,
    });
  });

  it('loads the real conflict snapshot and strong ETag before resolving', async () => {
    const requests: Request[] = [];
    const fetch: typeof globalThis.fetch = async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request.clone());
      return new Response(
        JSON.stringify({
          data: {
            id: '01JCONFLICT000000000000001',
            localEvent: envelope,
            serverVersion: 9,
            serverState: { bin: 'B2' },
            differences: [
              { field: 'bin', localValue: 'A1', serverValue: 'B2', impact: '库位已变更' },
            ],
            status: 'OPEN',
            version: 3,
          },
          meta,
        }),
        { status: 200, headers: { 'content-type': 'application/json', ETag: '"3"' } }
      );
    };
    const port = createApiPdaPort(createZhiliClient({ baseUrl: 'https://pda.test/api/v1', fetch }));
    const snapshot = await port.getDeviceConflict('01JCONFLICT000000000000001');
    expect(new URL(requests[0]!.url).pathname).toBe(
      '/api/v1/device-conflicts/01JCONFLICT000000000000001'
    );
    expect(requests[0]!.method).toBe('GET');
    expect(snapshot.etag).toBe('"3"');
    expect(snapshot.conflict.differences[0]?.impact).toBe('库位已变更');
  });

  it('uploads media through the generated multipart route with hash and idempotency', async () => {
    let captured: Request | undefined;
    const fetch: typeof globalThis.fetch = async (input) => {
      captured = input instanceof Request ? input.clone() : new Request(input);
      return Response.json(
        {
          data: {
            mediaId: 'media-1',
            eventId: envelope.eventId,
            status: 'READY',
            objectRef: 'pda/media-1.jpg',
          },
          meta,
        },
        { status: 201 }
      );
    };
    const port = createApiPdaPort(createZhiliClient({ baseUrl: 'https://pda.test/api/v1', fetch }));
    await port.uploadDeviceMedia(
      envelope.deviceId,
      {
        eventId: envelope.eventId,
        mediaId: 'media-1',
        contentHash: 'sha256:abc123',
        file: new Blob(['photo'], { type: 'image/jpeg' }),
      },
      'upload-media-000001'
    );

    expect(new URL(captured!.url).pathname).toBe(`/api/v1/devices/${envelope.deviceId}/media`);
    expect(captured!.headers.get('Idempotency-Key')).toBe('upload-media-000001');
    const form = await captured!.formData();
    expect(form.get('eventId')).toBe(envelope.eventId);
    expect(form.get('contentHash')).toBe('sha256:abc123');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it.each([
    [401, 'SESSION_EXPIRED'],
    [403, 'PERMISSION_DENIED'],
    [409, 'STALE_VERSION'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [422, 'VALIDATION_FAILED'],
  ] as const)('preserves the full error envelope for HTTP %s', async (status, code) => {
    const fetch: typeof globalThis.fetch = async () =>
      Response.json(
        {
          code,
          message: `fixture ${status}`,
          details: [{ field: 'status', reason: `http ${status}` }],
          remediation: `remedy ${status}`,
          requestId: `req-${status}`,
        },
        { status, headers: { 'content-type': 'application/problem+json' } }
      );
    const port = createApiPdaPort(createZhiliClient({ baseUrl: 'https://pda.test/api/v1', fetch }));

    let captured: unknown;
    try {
      await port.getDeviceTasks(envelope.deviceId);
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(PdaApiError);
    expect(captured).toMatchObject({
      status,
      code,
      message: `fixture ${status}`,
      remediation: `remedy ${status}`,
      requestId: `req-${status}`,
      details: [{ field: 'status', reason: `http ${status}` }],
    });
  });
});
