import type { ZhiliApiClient } from '@zhili/api-client';
import { waybillDetailFixtures, type WaybillDetail } from '../../waybill/model/waybill';

const detailStringFields = [
  'id',
  'waybillNo',
  'masterNo',
  'customer',
  'customerCode',
  'contactName',
  'contactPhone',
  'route',
  'service',
  'transport',
  'forecastWeightKg',
  'actualWeightKg',
  'volumeM3',
  'createdAt',
  'state',
  'branch',
] as const;

function isWaybillDetail(value: unknown): value is WaybillDetail {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    detailStringFields.every((field) => typeof record[field] === 'string') &&
    typeof record.pieces === 'number' &&
    typeof record.version === 'number' &&
    Array.isArray(record.timeline) &&
    record.timeline.every((item) => typeof item === 'string')
  );
}

function isWaybillBatchResult(value: unknown): value is WaybillBatchResult {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.succeeded) &&
    record.succeeded.every((id) => typeof id === 'string') &&
    Array.isArray(record.failed) &&
    record.failed.every(
      (failure) =>
        typeof failure === 'object' &&
        failure !== null &&
        typeof (failure as Record<string, unknown>).id === 'string' &&
        typeof (failure as Record<string, unknown>).reason === 'string'
    )
  );
}

export interface WaybillCommandResult {
  version: number;
  message?: string;
}

export interface WaybillBatchResult {
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

export interface WaybillPort {
  get(id: string): Promise<WaybillDetail>;
  submit(id: string, version: number): Promise<WaybillCommandResult>;
  createLabel(id: string, version: number, format: 'A4' | '100X150'): Promise<WaybillCommandResult>;
  batch(
    ids: string[],
    command: string,
    version: number,
    reason: string
  ): Promise<WaybillBatchResult>;
  renumber(id: string, version: number, waybillNo: string): Promise<WaybillCommandResult>;
  split(id: string, version: number, packageRefs: string[]): Promise<WaybillCommandResult>;
  merge(ids: string[], version: number): Promise<WaybillCommandResult>;
}

export const memoryWaybillPort: WaybillPort = {
  async get(id) {
    const detail = waybillDetailFixtures[id];
    if (!detail) throw new Error('WAYBILL_NOT_FOUND');
    return detail;
  },
  async submit(_id, version) {
    return { version: version + 1, message: '预报已提交' };
  },
  async createLabel(_id, version) {
    return { version: version + 1, message: '标签任务已进入队列' };
  },
  async batch(ids, _command, version) {
    return { succeeded: ids, failed: [], version } as WaybillBatchResult & { version: number };
  },
  async renumber(_id, version) {
    return { version: version + 1, message: '运单改号完成并保留血缘' };
  },
  async split(_id, version) {
    return { version: version + 1, message: '拆单完成' };
  },
  async merge(_ids, version) {
    return { version: version + 1, message: '合单完成' };
  },
};

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
      const remote: unknown = response.data?.data;
      if (!isWaybillDetail(remote)) throw new Error('WAYBILL_DETAIL_CONTRACT_INCOMPLETE');
      return remote;
    },
    async submit(waybillId, version) {
      const response = await client.POST('/waybills/{waybillId}:submit', {
        params: { path: { waybillId }, header: headers(version) },
      });
      if (response.error) throw response.error;
      return { version: Number(response.data?.data.version ?? version + 1) };
    },
    async createLabel(waybillId, version, format) {
      const response = await client.POST('/waybills/{waybillId}/label-jobs', {
        params: { path: { waybillId }, header: headers(version) },
        body: { format, status: 'QUEUED', version },
      });
      if (response.error) throw response.error;
      return { version: Number(response.data?.data.version ?? version + 1) };
    },
    async batch(ids, command, version, reason) {
      const response = await client.POST('/waybills:batch-command', {
        params: { header: headers(version) },
        body: { ids, command, reason, version },
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (!isWaybillBatchResult(data)) throw new Error('WAYBILL_BATCH_RESULT_CONTRACT_INCOMPLETE');
      return data;
    },
    async renumber(waybillId, version, waybillNo) {
      const response = await client.POST('/waybills/{waybillId}:renumber', {
        params: { path: { waybillId }, header: headers(version) },
        body: {
          id: waybillId,
          waybillNo,
          state: 'DRAFT',
          allowedActions: [],
          version,
        },
      });
      if (response.error) throw response.error;
      return { version: Number(response.data?.data.version ?? version + 1) };
    },
    async split(waybillId, version, packageRefs) {
      const response = await client.POST('/waybills:split', {
        params: { header: headers(version) },
        body: { id: waybillId, packageRefs, version },
      });
      if (response.error) throw response.error;
      return { version: Number(response.data?.data.version ?? version + 1) };
    },
    async merge(ids, version) {
      const response = await client.POST('/waybills:merge', {
        params: { header: headers(version) },
        body: { ids, version },
      });
      if (response.error) throw response.error;
      return { version: Number(response.data?.data.version ?? version + 1) };
    },
  };
}
