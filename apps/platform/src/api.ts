import { createZhiliClient } from '@zhili/api-client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ETag: '"2"' },
  });
const meta = { requestId: 'req-f1c-platform', asOf: '2026-07-22T00:00:00.000Z' };
const mockFetch: typeof fetch = async (input) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(raw, window.location.origin).pathname;
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
  return json({
    data: { resourceId: '01JCOMMAND000000000000002', status: 'SUCCEEDED', version: 2 },
    meta,
  });
};

const client = createZhiliClient({ baseUrl: 'http://localhost/api/v1', fetch: mockFetch });
const key = () => `f1c-${crypto.randomUUID?.() ?? Date.now()}`;
const ensure = <T>(data: T | undefined, error: unknown): T => {
  if (!data || error) throw new Error('平台命令失败，输入已保留，请重试。');
  return data;
};

export const platformPort = {
  async createTenant(name: string, slug: string) {
    const response = await client.POST('/platform/tenants', {
      params: { header: { 'Idempotency-Key': key() } },
      body: { name, slug, defaultTimezone: 'Asia/Shanghai', defaultCurrency: 'CNY' },
    });
    return ensure(response.data, response.error).data;
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
  async publishAnnouncement(title: string) {
    const response = await client.POST('/notification-templates:publish', {
      params: { header: { 'Idempotency-Key': key(), 'If-Match': '"1"' } },
      body: { channel: 'IN_APP', audience: 'ALL_TENANTS', title },
    });
    ensure(response.data, response.error);
  },
};
