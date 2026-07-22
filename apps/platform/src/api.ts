import { createZhiliClient } from '@zhili/api-client';

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
  if (/\/platform\/tenants\/[^/]+(?::change-status|\/entitlements)$/.test(path))
    return json({
      data: { resourceId: '01JCOMMAND000000000000002', status: 'SUCCEEDED', version: 2 },
      meta,
    });
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

export const platformPort = {
  async createTenant(name: string, slug: string, plan: string) {
    const response = await client.POST('/platform/tenants', {
      params: { header: { 'Idempotency-Key': key() } },
      body: { name, slug, defaultTimezone: 'Asia/Shanghai', defaultCurrency: 'CNY' },
    });
    const created = ensure(response.data, response.error).data;
    await this.saveEntitlements(created.id, { plan, waybillLimit: 200000, initialized: true });
    return created;
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
  async changeTenantStatus(tenantId: string, status: 'ACTIVE' | 'SUSPENDED') {
    const response = await client.POST('/platform/tenants/{tenantId}:change-status', {
      params: {
        path: { tenantId },
        header: { 'Idempotency-Key': key(), 'If-Match': '"1"' },
      },
      body: { id: tenantId, name: 'tenant', slug: 'tenant', status, version: 1 },
    });
    ensure(response.data, response.error);
  },
  async saveEntitlements(tenantId: string, body: Record<string, unknown>) {
    const response = await client.PUT('/platform/tenants/{tenantId}/entitlements', {
      params: {
        path: { tenantId },
        header: { 'Idempotency-Key': key(), 'If-Match': '"1"' },
      },
      body,
    });
    return ensure(response.data, response.error).data.version;
  },
  saveTenantConfiguration(
    tenantId: string,
    body: { plan: string; waybillLimit: number; expires: string }
  ) {
    return this.saveEntitlements(tenantId, body);
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
