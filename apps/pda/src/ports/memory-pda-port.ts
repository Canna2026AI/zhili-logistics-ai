import type { components } from '@zhili/contracts';
import type { PdaPort } from './pda-port';
import type {
  DeliveryEvent,
  DeviceConflict,
  DeviceEventEnvelope,
  DeviceSession,
  ProofOfDelivery,
} from '../domain/types';

const future = '2099-12-31T23:59:59.000Z';

export class MemoryPdaPort implements PdaPort {
  readonly synchronized = new Set<string>();
  readonly conflictResolutions: Array<{ conflictId: string; resolution: string; reason: string }> =
    [];
  readonly uploadedMedia = new Set<string>();
  syncCallCount = 0;
  uploadFailures = new Set<string>();

  async bindDevice(
    deviceId: string,
    body: components['schemas']['BindDeviceRequest'],
    _idempotencyKey: string
  ): Promise<DeviceSession> {
    void _idempotencyKey;
    return {
      deviceId,
      tenantId: '01JTENANT0000000000000001',
      warehouseId: body.warehouseId,
      subjectId: body.subjectId,
      permissions: [
        'pda.use',
        'pda.sync',
        'pda.conflict.resolve',
        'lastmile.delivery.execute',
        'lastmile.pod.write',
      ],
      expiresAt: future,
    };
  }

  async getDeviceTasks(_deviceId: string) {
    void _deviceId;
    return [
      {
        id: '01JPDATASK0000000000000001',
        type: 'RECEIVE' as const,
        reference: 'S2505120004',
        status: 'READY',
        priority: 'URGENT' as const,
        version: 7,
      },
      {
        id: '01JPDATASK0000000000000002',
        type: 'LAST_MILE_DELIVERY' as const,
        reference: 'LM250722001',
        status: 'LOADED',
        priority: 'HIGH' as const,
        version: 3,
      },
    ];
  }

  async syncDeviceEvents(events: DeviceEventEnvelope[], _idempotencyKey: string) {
    void _idempotencyKey;
    this.syncCallCount += 1;
    return events.map((event) => {
      if (this.synchronized.has(event.idempotencyKey)) {
        return { eventId: event.eventId, disposition: 'DUPLICATE' as const, serverVersion: 8 };
      }
      if (event.entityRef.toUpperCase().includes('CONFLICT')) {
        return {
          eventId: event.eventId,
          disposition: 'CONFLICT' as const,
          serverVersion: 9,
          conflictId: '01JCONFLICT000000000000001',
          conflictVersion: 1,
        };
      }
      if (event.entityRef.toUpperCase().includes('REJECT')) {
        return {
          eventId: event.eventId,
          disposition: 'REJECTED' as const,
          serverVersion: 8,
          errorCode: 'INVALID_STATE',
          errorMessage: '当前业务状态不允许执行',
        };
      }
      this.synchronized.add(event.idempotencyKey);
      return { eventId: event.eventId, disposition: 'APPLIED' as const, serverVersion: 8 };
    });
  }

  async uploadDeviceMedia(
    _deviceId: string,
    input: { eventId: string; mediaId: string; contentHash: string; file: Blob },
    _idempotencyKey: string
  ) {
    void _idempotencyKey;
    if (this.uploadFailures.delete(input.mediaId)) throw new Error('弱网上传中断');
    this.uploadedMedia.add(input.mediaId);
    return { mediaId: input.mediaId, status: 'READY' as const, objectRef: `pda/${input.mediaId}` };
  }

  async resolveDeviceConflict(
    conflictId: string,
    _etag: string,
    _idempotencyKey: string,
    body: components['schemas']['ResolveDeviceConflictRequest']
  ): Promise<DeviceConflict> {
    void _idempotencyKey;
    this.conflictResolutions.push({ conflictId, ...body });
    return {
      id: conflictId,
      localEvent: {} as DeviceEventEnvelope,
      serverVersion: 9,
      serverState: { status: 'PICKED' },
      differences: [],
      status: 'RESOLVED',
      version: 2,
    };
  }

  async getDeviceConflict(conflictId: string) {
    const localEvent: DeviceEventEnvelope = {
      eventId: '01JY8Z8F6ME4F0Y9QH2X6D4R7',
      deviceId: '01JDEVICE00000000000000003',
      localSequence: 1842,
      tenantId: '01JTENANT0000000000000001',
      warehouseId: '01JWAREHOUSE00000000000001',
      subjectId: '01JSUBJECT0000000000000001',
      action: 'PICK',
      entityRef: 'CONFLICT-1',
      payload: { bin: 'A1' },
      mediaRefs: [],
      baseVersion: 7,
      idempotencyKey: 'pda:conflict-fixture-00001',
      occurredAt: '2026-07-22T01:15:32.000Z',
      timezone: 'Asia/Shanghai',
      appVersion: '0.2.0',
    };
    return {
      conflict: {
        id: conflictId,
        localEvent,
        serverVersion: 9,
        serverState: { bin: 'B2', status: 'PICKED' },
        differences: [
          { field: 'bin', localValue: 'A1', serverValue: 'B2', impact: '重新应用将改变库位' },
        ],
        status: 'OPEN' as const,
        version: 1,
      },
      etag: '"1"',
    };
  }

  async updateDeliveryTaskStatus(
    deliveryTaskId: string,
    _etag: string,
    _idempotencyKey: string,
    body: DeliveryEvent
  ) {
    return {
      resourceId: deliveryTaskId,
      status: 'SUCCEEDED' as const,
      version: (body.version ?? 0) + 1,
    };
  }

  async captureProofOfDelivery(
    deliveryTaskId: string,
    _etag: string,
    _idempotencyKey: string,
    body: components['schemas']['CaptureProofOfDeliveryRequest']
  ): Promise<ProofOfDelivery> {
    return {
      id: '01JPOD0000000000000000001',
      deliveryTaskId,
      versionNo: 1,
      recipientName: body.recipientName,
      signedAt: body.signedAt,
      evidenceRefs: body.evidenceRefs,
    };
  }

  async amendProofOfDelivery() {}
}
