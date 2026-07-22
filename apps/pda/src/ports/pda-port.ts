import type { components } from '@zhili/contracts';
import type {
  ConflictResolution,
  DeliveryEvent,
  DeviceConflict,
  DeviceEventEnvelope,
  DeviceSession,
  DeviceTask,
  ProofOfDelivery,
  ProofOfDeliveryInput,
  SyncResult,
} from '../domain/types';

export interface UploadMediaInput {
  eventId: string;
  mediaId: string;
  contentHash: string;
  file: Blob;
}

export class PdaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'PDA_API_ERROR',
    readonly requestId?: string,
    readonly remediation?: string,
    readonly details?: components['schemas']['ErrorDetail'][]
  ) {
    super(message);
    this.name = 'PdaApiError';
  }
}

export interface PdaPort {
  bindDevice(
    deviceId: string,
    body: components['schemas']['BindDeviceRequest'],
    idempotencyKey: string
  ): Promise<DeviceSession>;
  getDeviceTasks(deviceId: string): Promise<DeviceTask[]>;
  syncDeviceEvents(events: DeviceEventEnvelope[], idempotencyKey: string): Promise<SyncResult[]>;
  uploadDeviceMedia(
    deviceId: string,
    input: UploadMediaInput,
    idempotencyKey: string
  ): Promise<{
    mediaId: string;
    status: 'UPLOADED' | 'SCANNING' | 'READY' | 'REJECTED';
    objectRef: string;
  }>;
  getDeviceConflict(conflictId: string): Promise<{ conflict: DeviceConflict; etag: string }>;
  resolveDeviceConflict(
    conflictId: string,
    etag: string,
    idempotencyKey: string,
    body: ConflictResolution
  ): Promise<DeviceConflict>;
  updateDeliveryTaskStatus(
    deliveryTaskId: string,
    etag: string,
    idempotencyKey: string,
    body: DeliveryEvent
  ): Promise<components['schemas']['CommandResult']>;
  captureProofOfDelivery(
    deliveryTaskId: string,
    etag: string,
    idempotencyKey: string,
    body: ProofOfDeliveryInput
  ): Promise<ProofOfDelivery>;
  amendProofOfDelivery(
    deliveryTaskId: string,
    etag: string,
    idempotencyKey: string,
    body: ProofOfDelivery
  ): Promise<void>;
}
