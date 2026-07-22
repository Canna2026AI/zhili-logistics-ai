import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },
  projects: [
    {
      name: 'a11y',
      testMatch: /a11y\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'ops',
      testMatch: /ops\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4100',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'ops-integration',
      testMatch: /ops-integration\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4100',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'ops-orders',
      testMatch: /ops-orders\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:6006',
        viewport: { width: 1586, height: 992 },
      },
    },
    {
      name: 'customer',
      testMatch: /customer\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4101',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'pda',
      testMatch: /pda\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4102',
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'platform',
      testMatch: /platform\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4103',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'website',
      testMatch: /website\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4104',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'website-mobile',
      testMatch: /website-mobile\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://127.0.0.1:4104',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @zhili/ops dev --host 127.0.0.1',
      url: 'http://127.0.0.1:4100',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @zhili/customer-portal dev --host 127.0.0.1',
      url: 'http://127.0.0.1:4101',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @zhili/pda dev --host 127.0.0.1',
      url: 'http://127.0.0.1:4102',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @zhili/platform dev --host 127.0.0.1',
      url: 'http://127.0.0.1:4103',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter @zhili/website dev --host 127.0.0.1',
      url: 'http://127.0.0.1:4104',
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        'pnpm --filter @zhili/storybook exec storybook dev -p 6006 --no-open --host 127.0.0.1',
      url: 'http://127.0.0.1:6006',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
