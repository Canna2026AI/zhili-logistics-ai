import type { ZhiliApiClient } from '@zhili/api-client';
import { waybillDetailFixtures, type WaybillDetail } from '../../waybill/model/waybill';

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
      const remote = response.data?.data;
      if (!remote) throw new Error('WAYBILL_RESPONSE_EMPTY');
      return {
        id: remote.id,
        waybillNo: remote.waybillNo,
        masterNo: '—',
        customer: '受保护客户',
        customerCode: '—',
        contactName: '—',
        contactPhone: '—',
        route: '—',
        service: '—',
        transport: '—',
        pieces: 0,
        forecastWeightKg: '0.00',
        actualWeightKg: '0.00',
        volumeM3: '0.00',
        createdAt: '—',
        state: '待收货',
        version: remote.version,
        branch: '当前授权范围',
        timeline: [],
      };
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
      const data = response.data?.data as
        { succeeded?: string[]; failed?: { id: string; reason: string }[] } | undefined;
      return { succeeded: data?.succeeded ?? ids, failed: data?.failed ?? [] };
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
