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
  if (path.endsWith('/auth/wechat/authorization'))
    return new Response(
      JSON.stringify({
        data: {
          authorizationUrl:
            'https://open.weixin.qq.com/connect/oauth2/authorize?state=server-owned',
          stateExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
        meta,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  return new Response(JSON.stringify({ message: `No typed mock route for ${path}` }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  });
};
const client = createZhiliClient({ baseUrl: 'http://localhost/api/v1', fetch: mockFetch });
const key = () => `f1c-${crypto.randomUUID?.() ?? Date.now()}`;

type DemoRequest = { company: string; phone: string; source: 'PUBLIC_WEBSITE' };
const websiteCommandFetch = async (request: Request) => {
  const path = new URL(request.url).pathname;
  if (path !== '/api/v1/public/demo-requests')
    return new Response(JSON.stringify({ message: `Unknown public command ${path}` }), {
      status: 404,
    });
  const body = (await request.json()) as DemoRequest;
  if (!body.company.trim() || !body.phone.trim())
    return new Response(JSON.stringify({ message: 'company and phone are required' }), {
      status: 422,
    });
  return new Response(
    JSON.stringify({ data: { id: 'DEMO-20260722-01', status: 'SUBMITTED', version: 1 } }),
    { status: 201, headers: { 'content-type': 'application/json' } }
  );
};

export const websitePort = {
  async login(account: string, password: string) {
    const response = await client.POST('/auth/password/sessions', { body: { account, password } });
    if (!response.data || response.error) throw new Error('账号或密码错误，请检查后重试。');
    return response.data.data;
  },
  async requestDemo(company: string, phone: string) {
    // Public demo requests are not in shared OpenAPI yet; keep a semantic app-local DTO/path.
    const request = new Request('http://localhost/api/v1/public/demo-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key() },
      body: JSON.stringify({ company, phone, source: 'PUBLIC_WEBSITE' }),
    });
    const response = await websiteCommandFetch(request);
    if (!response.ok) throw new Error('预约提交失败，输入已保留。');
  },
  async startWechat() {
    const response = await client.POST('/auth/wechat/authorization', {
      body: {
        redirectUri: `${window.location.origin}/auth/wechat/callback`,
        clientNonce: key(),
      },
    });
    if (!response.data || response.error) throw new Error('微信授权入口暂不可用。');
  },
};
