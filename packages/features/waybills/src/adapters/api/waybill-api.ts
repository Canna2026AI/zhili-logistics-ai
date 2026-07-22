import type { ZhiliApiClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';
import {
  waybillDetailFixtures,
  type WaybillDetail,
  type WaybillSensitiveField,
  type WaybillServerFieldDecision,
} from '../../waybill/model/waybill';

const stateLabels = {
  DRAFT: '待收货',
  FORECASTED: '待收货',
  AWAITING_RECEIPT: '待收货',
  RECEIVED: '待分货',
  AWAITING_ROUTING: '待分货',
  AWAITING_TRANSIT: '待转运',
  IN_TRANSIT: '转运中',
  OUT_FOR_DELIVERY: '已发货',
  DELIVERED: '已签收',
  AWAITING_RETURN: '问题件',
  RETURNED: '问题件',
  CANCELLED: '问题件',
} as const;

type VersionPrecondition = components['schemas']['WaybillVersionPrecondition'];
export type WaybillSplitResult = components['schemas']['WaybillSplitResult'];
export type WaybillMergeResult = components['schemas']['WaybillMergeResult'];

const fieldNames = {
  customerName: 'customer',
  customerCode: 'customerCode',
  contactName: 'contactName',
  contactPhone: 'contactPhone',
} as const satisfies Record<string, WaybillSensitiveField>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
}

function toFieldDecision(value: unknown): WaybillServerFieldDecision | null {
  if (!isRecord(value)) return null;
  if (
    !['READ', 'MASK', 'DENY'].includes(String(value.access)) ||
    typeof value.copyAllowed !== 'boolean' ||
    typeof value.exportAllowed !== 'boolean' ||
    (value.maskPattern !== undefined && typeof value.maskPattern !== 'string')
  ) {
    return null;
  }
  return {
    access: value.access as WaybillServerFieldDecision['access'],
    copyAllowed: value.copyAllowed,
    exportAllowed: value.exportAllowed,
    ...(typeof value.maskPattern === 'string' ? { maskPattern: value.maskPattern } : {}),
  };
}

function toWaybillDetail(value: unknown): WaybillDetail | null {
  if (!isRecord(value) || !isRecord(value.fieldPolicy)) return null;
  const record = value;
  const fieldPolicy = value.fieldPolicy;
  const state =
    typeof record.state === 'string'
      ? stateLabels[record.state as keyof typeof stateLabels]
      : undefined;
  const fieldDecisions = {} as Record<WaybillSensitiveField, WaybillServerFieldDecision>;
  const projectedValues = {} as Record<WaybillSensitiveField, string>;
  for (const [wireField, modelField] of Object.entries(fieldNames) as [
    keyof typeof fieldNames,
    WaybillSensitiveField,
  ][]) {
    const decision = toFieldDecision(fieldPolicy[wireField]);
    if (!decision) return null;
    fieldDecisions[modelField] = decision;
    const projected = record[wireField];
    if (decision.access === 'DENY') {
      projectedValues[modelField] = '';
    } else if (typeof projected === 'string') {
      projectedValues[modelField] = projected;
    } else if (
      (wireField === 'contactName' || wireField === 'contactPhone') &&
      projected === null
    ) {
      projectedValues[modelField] = '';
    } else {
      return null;
    }
  }
  if (
    !state ||
    typeof record.id !== 'string' ||
    typeof record.waybillNo !== 'string' ||
    !(typeof record.masterNo === 'string' || record.masterNo === null) ||
    typeof record.route !== 'string' ||
    typeof record.service !== 'string' ||
    typeof record.transport !== 'string' ||
    typeof record.forecastWeightKg !== 'string' ||
    !(typeof record.actualWeightKg === 'string' || record.actualWeightKg === null) ||
    !(typeof record.volumeM3 === 'string' || record.volumeM3 === null) ||
    typeof record.pieces !== 'number' ||
    typeof record.createdAt !== 'string' ||
    typeof record.branch !== 'string' ||
    !isPositiveInteger(record.version) ||
    !Array.isArray(record.timeline) ||
    !record.timeline.every((item) => typeof item === 'string')
  ) {
    return null;
  }
  return {
    id: record.id,
    waybillNo: record.waybillNo,
    masterNo: record.masterNo ?? '',
    customer: projectedValues.customer,
    customerCode: projectedValues.customerCode,
    contactName: projectedValues.contactName,
    contactPhone: projectedValues.contactPhone,
    route: record.route,
    service: record.service,
    transport: record.transport,
    forecastWeightKg: record.forecastWeightKg,
    actualWeightKg: record.actualWeightKg ?? '',
    volumeM3: record.volumeM3 ?? '',
    pieces: record.pieces,
    createdAt: record.createdAt,
    state,
    version: record.version,
    branch: record.branch,
    timeline: record.timeline as string[],
    fieldDecisions,
  };
}

function isLineageNode(value: unknown): value is components['schemas']['WaybillLineageNode'] {
  return (
    isRecord(value) &&
    typeof value.waybillId === 'string' &&
    typeof value.waybillNo === 'string' &&
    isPositiveInteger(value.version) &&
    Array.isArray(value.packageRefs) &&
    value.packageRefs.every((item) => typeof item === 'string')
  );
}

export interface WaybillCommandResult {
  version: number;
  message?: string;
}

export interface WaybillBatchResult {
  succeeded: string[];
  failed: { id: string; reason: string; latestVersion?: number }[];
}

export interface WaybillPort {
  get(id: string): Promise<WaybillDetail>;
  submit(id: string, version: number): Promise<WaybillCommandResult>;
  createLabel(id: string, version: number, format: 'A4' | '100X150'): Promise<WaybillCommandResult>;
  batch(
    items: VersionPrecondition[],
    command: 'SUBMIT' | 'CANCEL' | 'HOLD' | 'RELEASE',
    reason: string
  ): Promise<WaybillBatchResult>;
  renumber(
    id: string,
    version: number,
    waybillNo: string,
    reason: string
  ): Promise<WaybillCommandResult>;
  split(
    id: string,
    version: number,
    packageRefs: string[],
    reason: string
  ): Promise<WaybillSplitResult>;
  merge(items: VersionPrecondition[], reason: string): Promise<WaybillMergeResult>;
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
  async batch(items) {
    return { succeeded: items.map((item) => item.waybillId), failed: [] };
  },
  async renumber(_id, version) {
    return { version: version + 1, message: '运单改号完成并保留血缘' };
  },
  async split(id, version, packageRefs) {
    return {
      source: { waybillId: id, waybillNo: id, version: version + 1, packageRefs },
      children: [
        {
          waybillId: `${id}-child-1`,
          waybillNo: `${id}-1`,
          version: 1,
          packageRefs,
        },
        {
          waybillId: `${id}-child-2`,
          waybillNo: `${id}-2`,
          version: 1,
          packageRefs: [],
        },
      ],
    };
  },
  async merge(items) {
    return {
      sources: items.map((item) => ({
        waybillId: item.waybillId,
        waybillNo: item.waybillId,
        version: item.expectedVersion,
        packageRefs: [],
      })),
      merged: { waybillId: 'merged-waybill', waybillNo: 'MERGED', version: 1, packageRefs: [] },
    };
  },
};

export function createWaybillApi(
  client: ZhiliApiClient,
  createIdempotencyKey: () => string = () => crypto.randomUUID()
): WaybillPort {
  const versionedHeaders = (version: number) => ({
    'Idempotency-Key': createIdempotencyKey(),
    'If-Match': `"${version}"`,
  });
  const aggregateHeaders = () => ({ 'Idempotency-Key': createIdempotencyKey() });
  return {
    async get(waybillId) {
      const response = await client.GET('/waybills/{waybillId}', {
        params: { path: { waybillId } },
      });
      if (response.error) throw response.error;
      const remote = toWaybillDetail(response.data?.data);
      if (!remote) throw new Error('WAYBILL_DETAIL_CONTRACT_INCOMPLETE');
      return remote;
    },
    async submit(waybillId, version) {
      const response = await client.POST('/waybills/{waybillId}:submit', {
        params: { path: { waybillId }, header: versionedHeaders(version) },
      });
      if (response.error) throw response.error;
      const remote = toWaybillDetail(response.data?.data);
      if (!remote || remote.id !== waybillId)
        throw new Error('WAYBILL_COMMAND_RESULT_CONTRACT_INCOMPLETE');
      return { version: remote.version };
    },
    async createLabel(waybillId, version, format) {
      const response = await client.POST('/waybills/{waybillId}/label-jobs', {
        params: { path: { waybillId }, header: versionedHeaders(version) },
        body: { format, copies: 1 },
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (
        !isRecord(data) ||
        typeof data.labelJobId !== 'string' ||
        data.waybillId !== waybillId ||
        !isPositiveInteger(data.latestWaybillVersion) ||
        !['QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED'].includes(String(data.status)) ||
        data.format !== format ||
        typeof data.createdAt !== 'string'
      ) {
        throw new Error('LABEL_JOB_RESULT_CONTRACT_INCOMPLETE');
      }
      return { version: data.latestWaybillVersion };
    },
    async batch(items, command, reason) {
      const response = await client.POST('/waybills:batch-command', {
        params: { header: aggregateHeaders() },
        body: { items, command, reason },
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (
        !isRecord(data) ||
        data.command !== command ||
        data.orderPreserved !== true ||
        !Array.isArray(data.outcomes) ||
        data.outcomes.length !== items.length
      ) {
        throw new Error('WAYBILL_BATCH_RESULT_CONTRACT_INCOMPLETE');
      }
      const result: WaybillBatchResult = { succeeded: [], failed: [] };
      for (const [index, outcome] of data.outcomes.entries()) {
        if (
          !isRecord(outcome) ||
          outcome.waybillId !== items[index]?.waybillId ||
          !isPositiveInteger(outcome.latestVersion)
        ) {
          throw new Error('WAYBILL_BATCH_RESULT_CONTRACT_INCOMPLETE');
        }
        if (outcome.disposition === 'SUCCEEDED') {
          result.succeeded.push(outcome.waybillId as string);
          continue;
        }
        if (
          outcome.disposition !== 'FAILED' ||
          !isRecord(outcome.error) ||
          typeof outcome.error.code !== 'string' ||
          typeof outcome.error.message !== 'string' ||
          typeof outcome.error.remediation !== 'string'
        ) {
          throw new Error('WAYBILL_BATCH_RESULT_CONTRACT_INCOMPLETE');
        }
        result.failed.push({
          id: outcome.waybillId as string,
          reason: outcome.error.message,
          latestVersion: outcome.latestVersion,
        });
      }
      return result;
    },
    async renumber(waybillId, version, waybillNo, reason) {
      const response = await client.POST('/waybills/{waybillId}:renumber', {
        params: { path: { waybillId }, header: versionedHeaders(version) },
        body: { newWaybillNo: waybillNo, reason },
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (
        !isRecord(data) ||
        data.waybillId !== waybillId ||
        typeof data.previousWaybillNo !== 'string' ||
        data.newWaybillNo !== waybillNo ||
        !isPositiveInteger(data.latestVersion)
      ) {
        throw new Error('WAYBILL_RENUMBER_RESULT_CONTRACT_INCOMPLETE');
      }
      return { version: data.latestVersion };
    },
    async split(waybillId, version, packageRefs, reason) {
      const response = await client.POST('/waybills:split', {
        params: { header: aggregateHeaders() },
        body: { waybillId, expectedVersion: version, packageRefs, reason },
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (
        !isRecord(data) ||
        !isLineageNode(data.source) ||
        data.source.waybillId !== waybillId ||
        !Array.isArray(data.children) ||
        data.children.length < 2 ||
        !data.children.every(isLineageNode)
      ) {
        throw new Error('WAYBILL_SPLIT_RESULT_CONTRACT_INCOMPLETE');
      }
      return data as WaybillSplitResult;
    },
    async merge(items, reason) {
      const response = await client.POST('/waybills:merge', {
        params: { header: aggregateHeaders() },
        body: { items, reason },
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (
        !isRecord(data) ||
        items.length < 2 ||
        !Array.isArray(data.sources) ||
        data.sources.length !== items.length ||
        !data.sources.every(
          (source, index) => isLineageNode(source) && source.waybillId === items[index]?.waybillId
        ) ||
        !isLineageNode(data.merged)
      ) {
        throw new Error('WAYBILL_MERGE_RESULT_CONTRACT_INCOMPLETE');
      }
      return data as WaybillMergeResult;
    },
  };
}
