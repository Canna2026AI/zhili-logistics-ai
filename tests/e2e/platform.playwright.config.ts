import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const platformCwd = resolve(process.cwd(), 'apps/platform');

export default defineConfig({
  testDir: '.',
  testMatch: /platform\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4113',
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4113 --strictPort',
    cwd: platformCwd,
    url: 'http://127.0.0.1:4113',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
