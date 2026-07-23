import type { components } from '@zhili/contracts';
import type {
  ConflictResolution,
  AuthorizeDeviceTakeoverExportRequest,
  DeliveryEvent,
  DeliveryTaskTransitionReceipt,
  DeviceTakeoverExportAuthorization,
  DeviceTakeoverExportReceipt,
  DeviceConflict,
  DeviceEventEnvelope,
  DeviceMedia,
  DeviceSession,
  DeviceTask,
  ProofOfDeliveryAmendmentInput,
  ProofOfDeliveryCaptureReceipt,
  ProofOfDeliveryInput,
  SyncResult,
} from '../domain/types';

export interface UploadMediaInput {
  eventId: string;
  mediaId: string;
  contentHash: string;
  file: Blob;
}

export interface UploadEncryptedTakeoverInput {
  manifestHash: string;
  ciphertextHash: string;
  ciphertext: Blob;
  iv: string;
  wrappedKey: Blob;
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
  ): Promise<DeviceMedia>;
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
  ): Promise<DeliveryTaskTransitionReceipt>;
  captureProofOfDelivery(
    deliveryTaskId: string,
    etag: string,
    idempotencyKey: string,
    body: ProofOfDeliveryInput
  ): Promise<ProofOfDeliveryCaptureReceipt>;
  amendProofOfDelivery(
    deliveryTaskId: string,
    etag: string,
    idempotencyKey: string,
    body: ProofOfDeliveryAmendmentInput
  ): Promise<void>;
  authorizeDeviceTakeoverExport(
    deviceId: string,
    idempotencyKey: string,
    body: AuthorizeDeviceTakeoverExportRequest
  ): Promise<DeviceTakeoverExportAuthorization>;
  uploadEncryptedDeviceTakeoverExport(
    deviceId: string,
    authorizationId: string,
    idempotencyKey: string,
    input: UploadEncryptedTakeoverInput
  ): Promise<DeviceTakeoverExportReceipt>;
}
