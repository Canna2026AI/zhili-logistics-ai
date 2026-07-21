import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const storybookCwd = resolve(process.cwd(), 'apps/storybook');

export default defineConfig({
  testDir: '.',
  testMatch: /ops-orders\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:6006',
    viewport: { width: 1586, height: 992 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node_modules/.bin/storybook dev -p 6006 --no-open --host 127.0.0.1',
    cwd: storybookCwd,
    url: 'http://127.0.0.1:6006',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
