import type { ZhiliApiClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';
import type { PdaPort, UploadMediaInput } from './pda-port';
import { PdaApiError } from './pda-port';

function strongEtag(value: string) {
  if (!/^"[^"\r\n]+"$/.test(value)) {
    throw new Error('If-Match 必须使用服务器返回的强 ETag。');
  }
  return value;
}

function failure(error: unknown, status: number) {
  const envelope = error as Partial<components['schemas']['ErrorEnvelope']> | undefined;
  const message = envelope?.message ?? `PDA 请求失败（HTTP ${status || 'unknown'}）`;
  return new PdaApiError(
    message,
    status,
    String(envelope?.code ?? 'PDA_API_ERROR'),
    envelope?.requestId,
    envelope?.remediation,
    envelope?.details
  );
}

export function createApiPdaPort(client: ZhiliApiClient): PdaPort {
  return {
    async bindDevice(deviceId, body, idempotencyKey) {
      const response = await client.POST('/devices/{deviceId}:bind', {
        params: { path: { deviceId }, header: { 'Idempotency-Key': idempotencyKey } },
        body,
      });
      if (!response.data || response.error) throw failure(response.error, response.response.status);
      return response.data.data;
    },

    async getDeviceTasks(deviceId) {
      const response = await client.GET('/devices/{deviceId}/tasks', {
        params: { path: { deviceId } },
      });
      if (!response.data || response.error) throw failure(response.error, response.response.status);
      return response.data.data;
    },

    async syncDeviceEvents(events, idempotencyKey) {
      const response = await client.POST('/devices/events:sync', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body: { events },
      });
      if (!response.data || response.error) throw failure(response.error, response.response.status);
      return response.data.data.map((result) => ({
        eventId: result.eventId,
        disposition: result.disposition,
        claimedMediaRefs: result.claimedMediaRefs,
        serverVersion: result.serverVersion,
        conflictId: result.conflictId ?? undefined,
        conflictVersion: result.conflictVersion,
        errorCode: result.error?.code,
        errorMessage: result.error?.message,
      }));
    },

    async uploadDeviceMedia(deviceId: string, input: UploadMediaInput, idempotencyKey: string) {
      const form = new FormData();
      form.set('eventId', input.eventId);
      form.set('mediaId', input.mediaId);
      form.set('contentHash', input.contentHash);
      form.set('file', input.file, `${input.mediaId}.bin`);
      const response = await client.POST('/devices/{deviceId}/media', {
        params: { path: { deviceId }, header: { 'Idempotency-Key': idempotencyKey } },
        body: form as unknown as components['schemas']['UploadDeviceMediaRequest'],
        bodySerializer: (body) => body as unknown as BodyInit,
      });
      if (!response.data || response.error) throw failure(response.error, response.response.status);
      return response.data.data;
    },

    async getDeviceConflict(conflictId) {
      const response = await client.GET('/device-conflicts/{conflictId}', {
        params: { path: { conflictId } },
      });
      if (!response.data || response.error) throw failure(response.error, response.response.status);
      const etag = response.response.headers.get('ETag');
      if (!etag || !/^"[^"\r\n]+"$/.test(etag)) {
        throw new PdaApiError('冲突快照未返回强 ETag，已禁止覆盖写入。', 409, 'MISSING_ETAG');
      }
      return { conflict: response.data.data, etag };
    },

    async resolveDeviceConflict(conflictId, etag, idempotencyKey, body) {
      const response = await client.POST('/device-conflicts/{conflictId}:resolve', {
        params: {
          path: { conflictId },
          header: { 'Idempotency-Key': idempotencyKey, 'If-Match': strongEtag(etag) },
        },
        body,
      });
      if (!response.data || response.error) throw failure(response.error, response.response.status);
      return response.data.data;
    },

    async updateDeliveryTaskStatus(deliveryTaskId, etag, idempotencyKey, body) {
      const response = await client.POST('/last-mile/delivery-tasks/{deliveryTaskId}:transition', {
        params: {
          path: { deliveryTaskId },
          header: { 'Idempotency-Key': idempotencyKey, 'If-Match': strongEtag(etag) },
        },
        body,
      });
      if (!response.data || response.error) throw failure(response.error, response.response.status);
      return response.data.data;
    },

    async captureProofOfDelivery(deliveryTaskId, etag, idempotencyKey, body) {
      const response = await client.POST(
        '/last-mile/delivery-tasks/{deliveryTaskId}/proof-of-delivery',
        {
          params: {
            path: { deliveryTaskId },
            header: { 'Idempotency-Key': idempotencyKey, 'If-Match': strongEtag(etag) },
          },
          body,
        }
      );
      if (!response.data || response.error) throw failure(response.error, response.response.status);
      return response.data.data;
    },

    async amendProofOfDelivery(deliveryTaskId, etag, idempotencyKey, body) {
      const response = await client.POST(
        '/last-mile/delivery-tasks/{deliveryTaskId}/proof-of-delivery:amend',
        {
          params: {
            path: { deliveryTaskId },
            header: { 'Idempotency-Key': idempotencyKey, 'If-Match': strongEtag(etag) },
          },
          body,
        }
      );
      if (response.error) throw failure(response.error, response.response.status);
    },

    async authorizeDeviceTakeoverExport(deviceId, idempotencyKey, body) {
      const response = await client.POST('/devices/{deviceId}/takeover-exports:authorize', {
        params: { path: { deviceId }, header: { 'Idempotency-Key': idempotencyKey } },
        body,
      });
      if (!response.data || response.error) throw failure(response.error, response.response.status);
      return response.data.data;
    },

    async uploadEncryptedDeviceTakeoverExport(deviceId, authorizationId, idempotencyKey, input) {
      const form = new FormData();
      form.set('manifestHash', input.manifestHash);
      form.set('ciphertextHash', input.ciphertextHash);
      form.set('ciphertext', input.ciphertext, 'takeover.enc');
      form.set('iv', input.iv);
      form.set('wrappedKey', input.wrappedKey, 'takeover.key');
      const response = await client.POST('/devices/{deviceId}/takeover-exports/{authorizationId}', {
        params: {
          path: { deviceId, authorizationId },
          header: { 'Idempotency-Key': idempotencyKey },
        },
        body: form as unknown as components['schemas']['UploadEncryptedDeviceTakeoverExportRequest'],
        bodySerializer: (body) => body as unknown as BodyInit,
      });
      if (!response.data || response.error) throw failure(response.error, response.response.status);
      return response.data.data;
    },
  };
}
