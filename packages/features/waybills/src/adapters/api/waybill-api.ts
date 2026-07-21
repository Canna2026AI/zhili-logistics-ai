import type { ZhiliApiClient } from '@zhili/api-client';

export interface WaybillPort {
  get(id: string): Promise<unknown>;
  submit(id: string, version: number): Promise<unknown>;
  createLabel(id: string, version: number, format: 'A4' | '100X150'): Promise<unknown>;
  batch(ids: string[], command: string, version: number, reason: string): Promise<unknown>;
}

export function createWaybillApi(
  client: ZhiliApiClient,
  createIdempotencyKey: () => string = () => crypto.randomUUID()
): WaybillPort {
  const headers = (version: number) => ({
    'Idempotency-Key': createIdempotencyKey(),
    'If-Match': `"${version}"`,
  });
  return {
    async get(waybillId) {
      const response = await client.GET('/waybills/{waybillId}', {
        params: { path: { waybillId } },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
    async submit(waybillId, version) {
      const response = await client.POST('/waybills/{waybillId}:submit', {
        params: { path: { waybillId }, header: headers(version) },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
    async createLabel(waybillId, version, format) {
      const response = await client.POST('/waybills/{waybillId}/label-jobs', {
        params: { path: { waybillId }, header: headers(version) },
        body: { format, status: 'QUEUED', version },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
    async batch(ids, command, version, reason) {
      const response = await client.POST('/waybills:batch-command', {
        params: { header: headers(version) },
        body: { ids, command, reason, version },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
  };
}
