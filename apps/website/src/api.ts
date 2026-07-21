import { createZhiliClient } from '../../../packages/api-client/src/index';

const meta = { requestId: 'req-f1c-website', asOf: '2026-07-22T00:00:00.000Z' };
const mockFetch: typeof fetch = async (input) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(raw, window.location.origin).pathname;
  if (path.endsWith('/auth/password/sessions'))
    return new Response(
      JSON.stringify({
        data: {
          id: '01JSESSION0000000000000001',
          subjectId: '01JADMIN000000000000000001',
          tenantId: '01JTENANT0000000000000001',
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
          permissionsVersion: 1,
        },
        meta,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  return new Response(
    JSON.stringify({
      data: { resourceId: '01JDEMO00000000000000001', status: 'SUCCEEDED', version: 1 },
      meta,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
};
const client = createZhiliClient({ baseUrl: 'http://localhost/api/v1', fetch: mockFetch });
const key = () => `f1c-${crypto.randomUUID?.() ?? Date.now()}`;

export const websitePort = {
  async login(account: string, password: string) {
    const response = await client.POST('/auth/password/sessions', { body: { account, password } });
    if (!response.data || response.error) throw new Error('账号或密码错误，请检查后重试。');
    return response.data.data;
  },
  async requestDemo(company: string, phone: string) {
    const response = await client.POST('/portal/api-access-requests', {
      params: { header: { 'Idempotency-Key': key(), 'If-Match': '"1"' } },
      body: { kind: 'DEMO_REQUEST', company, phone },
    });
    if (!response.data || response.error) throw new Error('预约提交失败，输入已保留。');
  },
  async startWechat() {
    const response = await client.POST('/auth/wechat/authorization', {
      body: { channel: 'WECHAT' },
    });
    if (!response.data || response.error) throw new Error('微信授权入口暂不可用。');
  },
};
