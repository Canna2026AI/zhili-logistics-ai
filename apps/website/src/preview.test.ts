import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build, preview, type PreviewServer } from 'vite';

let server: PreviewServer;
let origin: string;

beforeAll(async () => {
  await build({ root: process.cwd(), logLevel: 'silent' });
  server = await preview({
    root: process.cwd(),
    logLevel: 'silent',
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('无法取得 preview 监听地址');
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve()))
  );
});

describe('官网 production preview 路由', () => {
  it.each([
    ['/zhili-logistics-ai/', '智立科技物流AI系统'],
    ['/zhili-logistics-ai/privacy/', '隐私政策'],
    ['/zhili-logistics-ai/terms/', '服务条款'],
    ['/zhili-logistics-ai/license/', '开源许可'],
  ])('%s 返回独立合法页面', async (path, title) => {
    const response = await fetch(`${origin}${path}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(title);
  });

  it('未知静态路径返回 404 且不回退首页', async () => {
    const response = await fetch(`${origin}/zhili-logistics-ai/not-found/`);
    const html = await response.text();
    expect(response.status).toBe(404);
    expect(html).not.toContain('跨境物流业务一体化平台');
  });
});
