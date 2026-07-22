import { createZhiliClient } from '@zhili/api-client';
import type { ZhiliApiClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ETag: '"2"' },
  });
const meta = { requestId: 'req-f1c-platform', asOf: '2026-07-22T00:00:00.000Z' };
const mockFetch: typeof fetch = async (input) => {
  const request = input instanceof Request ? input : new Request(input);
  const path = new URL(request.url, window.location.origin).pathname;
  if (path.endsWith('/platform/tenants'))
    return json(
      {
        data: {
          id: '01JTENANT0000000000000006',
          name: '厦门远海物流有限公司',
          slug: 'yuanhai-xm',
          status: 'ACTIVE',
          version: 1,
        },
        meta,
      },
      201
    );
  if (path.endsWith('/platform/impersonations'))
    return json(
      {
        data: {
          id: '01JIMPERSONATE000000000001',
          tenantId: '01JTENANT0000000000000001',
          actorId: '01JADMIN000000000000000001',
          reason: '协助排查订单同步问题',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        meta,
      },
      201
    );
  if (path.endsWith('/platform/impersonations/current')) return new Response(null, { status: 204 });
  const tenantStatus = path.match(/\/platform\/tenants\/([^/]+):change-status$/);
  if (tenantStatus) {
    const body = (await request.clone().json()) as { status: 'ACTIVE' | 'SUSPENDED' };
    const currentVersion = Number(request.headers.get('If-Match')?.replaceAll('"', '') ?? 1);
    return json({
      data: {
        id: tenantStatus[1],
        name: '上海智立科技有限公司',
        slug: 'zhili-sh',
        status: body.status,
        version: currentVersion + 1,
      },
      meta,
    });
  }
  const tenantEntitlements = path.match(/\/platform\/tenants\/([^/]+)\/entitlements$/);
  if (tenantEntitlements) {
    const body = (await request
      .clone()
      .json()) as components['schemas']['UpdateTenantEntitlementsRequest'];
    const currentVersion = Number(request.headers.get('If-Match')?.replaceAll('"', '') ?? 1);
    return json({
      data: {
        tenantId: tenantEntitlements[1],
        modules: body.modules,
        version: currentVersion + 1,
      },
      meta,
    });
  }
  return json({ message: `No typed mock route for ${path}` }, 404);
};

export type RuntimeDifference = { field: string; local: string; server: string };

/** App-local port for platform operations pending inclusion in shared OpenAPI. */
const platformCommand = async <TResponse>(
  path: string,
  body: Record<string, unknown>
): Promise<TResponse> => {
  if (path === '/api/v1/platform/plans')
    return { id: 'PLAN-CUSTOM', name: body.name, status: 'DRAFT', version: 1 } as TResponse;
  if (path === '/api/v1/platform/announcements')
    return { id: 'ANN-20260722-01', status: 'PUBLISHED', version: 1 } as TResponse;
  if (path === '/api/v1/platform/runtime-snapshots:compare')
    return {
      serverVersion: 'runtime-v13',
      differences: [{ field: 'snapshotAt', local: '10:18', server: '10:21' }],
    } as TResponse;
  if (path === '/api/v1/platform/runtime-snapshots:refresh')
    return { version: 'runtime-v13', refreshedAt: '10:21' } as TResponse;
  if (path === '/api/v1/platform/runtime-jobs:retry-failed') {
    const itemIds = body.itemIds as string[];
    return { items: itemIds.map((id) => ({ id, status: 'SUCCEEDED' })) } as TResponse;
  }
  throw new Error(`未实现的平台命令：${path}`);
};

const client = createZhiliClient({ baseUrl: 'http://localhost/api/v1', fetch: mockFetch });
const key = () => `f1c-${crypto.randomUUID?.() ?? Date.now()}`;
const ensure = <T>(data: T | undefined, error: unknown): T => {
  if (!data || error) throw new Error('平台命令失败，输入已保留，请重试。');
  return data;
};
const entitlementCode = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'core';

type TenantResource = components['schemas']['Tenant'];
type TenantStatusResult = Omit<TenantResource, 'status'> & {
  status: 'ACTIVE' | 'SUSPENDED';
};
type EntitlementRequest = components['schemas']['UpdateTenantEntitlementsRequest'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveVersion(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
}

function isTenant(value: unknown): value is TenantResource {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    ['ACTIVE', 'SUSPENDED', 'EXPIRED'].includes(String(value.status)) &&
    isPositiveVersion(value.version)
  );
}

export function createPlatformApi(
  apiClient: Pick<ZhiliApiClient, 'POST' | 'PUT'>,
  createIdempotencyKey: () => string = () => `platform-${crypto.randomUUID()}`
) {
  return {
    async changeTenantStatus(
      tenant: TenantResource,
      status: 'ACTIVE' | 'SUSPENDED'
    ): Promise<TenantStatusResult> {
      const response = await apiClient.POST('/platform/tenants/{tenantId}:change-status', {
        params: {
          path: { tenantId: tenant.id },
          header: {
            'Idempotency-Key': createIdempotencyKey(),
            'If-Match': `"${tenant.version}"`,
          },
        },
        body: { status },
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (!isTenant(data) || data.id !== tenant.id || data.status !== status)
        throw new Error('TENANT_STATUS_RESPONSE_INCOMPLETE');
      return data as TenantStatusResult;
    },
    async saveEntitlements(
      tenantId: string,
      version: number,
      body: EntitlementRequest
    ): Promise<number> {
      const response = await apiClient.PUT('/platform/tenants/{tenantId}/entitlements', {
        params: {
          path: { tenantId },
          header: {
            'Idempotency-Key': createIdempotencyKey(),
            'If-Match': `"${version}"`,
          },
        },
        body,
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (
        !isRecord(data) ||
        data.tenantId !== tenantId ||
        !Array.isArray(data.modules) ||
        !isPositiveVersion(data.version)
      ) {
        throw new Error('TENANT_ENTITLEMENTS_RESPONSE_INCOMPLETE');
      }
      return data.version;
    },
  };
}

const typedPlatformApi = createPlatformApi(client, key);

export const platformPort = {
  async createTenant(name: string, slug: string, plan: string) {
    const response = await client.POST('/platform/tenants', {
      params: { header: { 'Idempotency-Key': key() } },
      body: { name, slug, defaultTimezone: 'Asia/Shanghai', defaultCurrency: 'CNY' },
    });
    const created = ensure(response.data, response.error).data;
    const version = await typedPlatformApi.saveEntitlements(created.id, created.version, {
      modules: [
        {
          moduleCode: entitlementCode(plan),
          enabled: true,
          quotas: { monthlyWaybills: 200000 },
        },
      ],
    });
    return { ...created, version };
  },
  async startImpersonation(tenantId: string, reason: string) {
    const response = await client.POST('/platform/impersonations', {
      params: { header: { 'Idempotency-Key': key() } },
      body: { tenantId, reason, durationMinutes: 60 },
    });
    return ensure(response.data, response.error).data;
  },
  async endImpersonation() {
    const response = await client.DELETE('/platform/impersonations/current');
    if (response.error) throw new Error('退出代入失败，请重试。');
  },
  changeTenantStatus: typedPlatformApi.changeTenantStatus,
  saveEntitlements: typedPlatformApi.saveEntitlements,
  setModuleEntitlement(tenantId: string, version: number, module: string, enabled: boolean) {
    return typedPlatformApi.saveEntitlements(tenantId, version, {
      modules: [{ moduleCode: entitlementCode(module), enabled, quotas: {} }],
    });
  },
  saveTenantConfiguration(
    tenantId: string,
    version: number,
    body: { plan: string; waybillLimit: number; expires: string }
  ) {
    return typedPlatformApi.saveEntitlements(tenantId, version, {
      modules: [
        {
          moduleCode: entitlementCode(body.plan),
          enabled: true,
          expiresAt: new Date(`${body.expires}T23:59:59.999Z`).toISOString(),
          quotas: { monthlyWaybills: body.waybillLimit },
        },
      ],
    });
  },
  async createPlan(name: string) {
    await platformCommand('/api/v1/platform/plans', { name });
  },
  async publishAnnouncement(title: string) {
    await platformCommand('/api/v1/platform/announcements', { title, audience: 'ALL_TENANTS' });
  },
  compareRuntime(localVersion: string) {
    return platformCommand<{ serverVersion: string; differences: RuntimeDifference[] }>(
      '/api/v1/platform/runtime-snapshots:compare',
      { localVersion }
    );
  },
  refreshRuntime(serverVersion = 'runtime-v13') {
    return platformCommand<{ version: string; refreshedAt: string }>(
      '/api/v1/platform/runtime-snapshots:refresh',
      { serverVersion }
    );
  },
  retryRuntimeJobs(itemIds: string[]) {
    return platformCommand<{ items: Array<{ id: string; status: 'SUCCEEDED' }> }>(
      '/api/v1/platform/runtime-jobs:retry-failed',
      { itemIds }
    );
  },
};
