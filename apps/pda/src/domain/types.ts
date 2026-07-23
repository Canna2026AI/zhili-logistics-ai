import type { components } from '@zhili/contracts';

export type DeviceEventEnvelope = components['schemas']['DeviceEventEnvelope'];
export type DeviceTask = components['schemas']['DeviceTask'];
export type DeviceMedia = components['schemas']['DeviceMedia'];
export type DeviceSession = components['schemas']['DeviceSession'];
export type DeviceConflict = components['schemas']['DeviceConflict'];
export type ConflictResolution = components['schemas']['ResolveDeviceConflictRequest'];
export type ProofOfDeliveryInput = components['schemas']['CaptureProofOfDeliveryRequest'];
export type ProofOfDelivery = components['schemas']['ProofOfDelivery'];
export type DeliveryEvent = components['schemas']['UpdateDeliveryTaskStatusRequest'];
export type ProofOfDeliveryAmendmentInput = components['schemas']['AmendProofOfDeliveryRequest'];
export type DeliveryTaskStatus = components['schemas']['DeliveryTaskStatus'];
export type DeliveryTaskTransitionReceipt = components['schemas']['DeliveryTaskTransitionReceipt'];
export type ProofOfDeliveryCaptureReceipt = components['schemas']['ProofOfDeliveryCaptureReceipt'];
export type AuthorizeDeviceTakeoverExportRequest =
  components['schemas']['AuthorizeDeviceTakeoverExportRequest'];
export type DeviceTakeoverExportAuthorization =
  components['schemas']['DeviceTakeoverExportAuthorization'];
export type DeviceTakeoverExportReceipt = components['schemas']['DeviceTakeoverExportReceipt'];

export interface DeviceContext {
  deviceId: string;
  tenantId: string;
  warehouseId: string;
  subjectId: string;
  timezone: string;
  appVersion: string;
}

export type SyncDisposition = 'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';

export interface SyncResult {
  eventId: string;
  disposition: SyncDisposition;
  claimedMediaRefs: string[];
  serverVersion?: number;
  conflictId?: string;
  conflictVersion?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface LocalConflictEvidence {
  conflictId: string;
  serverVersion: number;
  serverState?: Record<string, unknown>;
  differences?: Array<{ field: string; local: string; server: string; impact?: string }>;
  version: number;
  snapshotNotice?: string;
  etag?: string;
}

export interface QueuedEvent {
  envelope: DeviceEventEnvelope;
  state: 'PENDING' | 'CONFLICT' | 'REJECTED';
  conflict?: LocalConflictEvidence;
  errorCode?: string;
  errorMessage?: string;
}

export type EnqueueOutcome = QueuedEvent & {
  enqueueDisposition: 'QUEUED' | 'DUPLICATE';
};

export interface MediaQueueItem {
  mediaId: string;
  eventId: string;
  contentHash: string;
  mimeType: string;
  blob: Blob;
  status: 'PENDING' | 'UPLOADING' | 'PROCESSING' | 'RETRY' | 'UPLOADED' | 'REJECTED';
  remoteStatus?: 'UPLOADED' | 'SCANNING' | 'READY' | 'REJECTED';
  progress: number;
  attempts: number;
  errorMessage?: string;
  context: DeviceContext;
}

export interface QueueSnapshot {
  events: QueuedEvent[];
  media: MediaQueueItem[];
  warning: boolean;
  full: boolean;
}
