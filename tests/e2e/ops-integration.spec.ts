import { expect, test } from '@playwright/test';
import axe from 'axe-core';

const quoteId = '01JY8Z8F6ME4F0Y9QH2X6D4R7B';
const optionId = '01JY8Z8F6ME4F0Y9QH2X6D4R7C';
const productId = '01JY8Z8F6ME4F0Y9QH2X6D4R7D';
const importId = '01JY8Z8F6ME4F0Y9QH2X6D4R7E';
const proposalId = '01JY8Z8F6ME4F0Y9QH2X6D4R7F';
const candidateId = '01JY8Z8F6ME4F0Y9QH2X6D4R7G';
const jobId = '01JY8Z8F6ME4F0Y9QH2X6D4R7H';

const calculatedQuote = {
  id: quoteId,
  quoteNo: 'Q-SERVER-20260723',
  status: 'CALCULATED',
  validUntil: '2099-07-23T18:00:00+08:00',
  version: 6,
  options: [
    {
      id: optionId,
      channelProductId: productId,
      chargeableWeightKg: '123.50',
      lines: [
        {
          code: 'REMOTE_RATE',
          label: '服务端运费',
          amount: { amount: '5320.00', currency: 'CNY' },
          ruleVersion: 'REMOTE-v9',
        },
      ],
      total: { amount: '5320.00', currency: 'CNY' },
      available: true,
    },
  ],
};

async function expectNoSeriousAxe(page: import('@playwright/test').Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const runtime = (globalThis as typeof globalThis & { axe: typeof axe }).axe;
    const result = await runtime.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    return result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );
  });
  expect(violations).toEqual([]);
}

async function gridTrackCount(
  locator: import('@playwright/test').Locator,
  property: 'gridTemplateColumns' | 'gridTemplateRows' = 'gridTemplateColumns'
) {
  return locator.evaluate(
    (element, computedProperty) =>
      getComputedStyle(element)[computedProperty].trim().split(/\s+/).filter(Boolean).length,
    property
  );
}

test('运营总入口在订单、履约与财务之间保持真实路由', async ({ page }) => {
  await page.goto('/operations/orders?mock=1');
  await expect(page.getByRole('heading', { level: 1, name: '运营工作台' })).toBeVisible();

  await page.getByRole('button', { name: '应收应付' }).click();
  await expect(page.getByRole('heading', { name: '物流财务结算' })).toBeVisible();
  await expect(page).toHaveURL(/\/operations\/fulfillment-finance\/finance\?mock=1$/);

  await page.getByRole('link', { name: '订单与报价' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '运营工作台' })).toBeVisible();
  await expect(page).toHaveURL(/\/operations\/orders\?mock=1$/);

  await page.getByRole('link', { name: '履约与财务' }).click();
  await expect(page.getByRole('heading', { name: '收货扫描' })).toBeVisible();
  await expect(page).toHaveURL(/\/operations\/fulfillment-finance\/warehouse\?mock=1$/);

  await page.getByRole('button', { name: /干线尾程/ }).click();
  await expect(page.getByRole('heading', { name: '干线与尾程履约' })).toBeVisible();
  await expect(page).toHaveURL(/\/operations\/fulfillment-finance\/linehaul\?mock=1$/);

  await page.goBack();
  await expect(page.getByRole('heading', { name: '收货扫描' })).toBeVisible();
  await expect(page).toHaveURL(/\/operations\/fulfillment-finance\/warehouse\?mock=1$/);
});

test('生产报价路由的 409 直接驱动价卡过期恢复态', async ({ page }) => {
  await page.route('**/api/v1/quotes', async (route) => {
    await route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        status: 409,
        code: 'STALE_VERSION',
        message: '价卡已发布新版本',
        remediation: '请按最新规则重新计算',
        requestId: 'REQ-QUOTE-409',
      }),
    });
  });
  await page.goto('/operations/orders');
  await page.getByRole('button', { name: '报价管理' }).click();
  await page.getByLabel('实重 (kg)').fill('188.25');
  await page.getByRole('button', { name: '刷新报价' }).click();

  await expect(page.getByText('报价规则已发布新版本')).toBeVisible();
  await expect(page.getByLabel('实重 (kg)')).toHaveValue('188.25');
  await expect(page.getByRole('button', { name: '返回正常流程' })).toHaveCount(0);
  await expectNoSeriousAxe(page);
});

test('生产 accept 路由的 410 保留输入并禁止继续接受', async ({ page }) => {
  await page.route('**/api/v1/quotes', async (route) => {
    await route.fulfill({ json: { data: calculatedQuote, meta: {} } });
  });
  await page.route(`**/api/v1/quotes/${quoteId}:accept`, async (route) => {
    await route.fulfill({
      status: 410,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        status: 410,
        code: 'QUOTE_EXPIRED',
        message: '报价快照已过期',
        remediation: '请重新计算',
        requestId: 'REQ-QUOTE-410',
      }),
    });
  });
  await page.goto('/operations/orders');
  await page.getByRole('button', { name: '报价管理' }).click();
  await page.getByLabel('实重 (kg)').fill('177.50');
  await page.getByRole('button', { name: '刷新报价' }).click();
  await expect(page.getByText('Q-SERVER-20260723')).toBeVisible();
  await page.getByRole('button', { name: '接受报价' }).click();

  await expect(page.getByText('报价已过有效期')).toBeVisible();
  await expect(page.getByLabel('实重 (kg)')).toHaveValue('177.50');
  await expect(page.getByRole('button', { name: '接受报价' })).toHaveCount(0);
});

test('生产 AI 提案路由的 422 携带 proposal 进入人工映射', async ({ page }) => {
  const proposal = {
    id: proposalId,
    importId,
    model: 'Zhili-Map 2.1',
    promptVersion: '2026.07',
    status: 'READY',
    version: 3,
    candidates: [
      {
        id: candidateId,
        sourceColumn: 'province',
        targetField: 'receiverState',
        confidence: 0.32,
        evidence: ['列名与历史映射部分匹配'],
        risk: 'MEDIUM',
        autoApplicable: false,
      },
    ],
  };
  await page.route('**/api/v1/imports', async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: importId,
          status: 'UPLOADED',
          totalRows: 1,
          validRows: 0,
          invalidRows: 0,
          version: 4,
        },
        meta: {},
      },
    });
  });
  await page.route(`**/api/v1/ai/imports/${importId}/mapping-proposals`, async (route) => {
    await route.fulfill({
      status: 202,
      json: {
        data: {
          id: jobId,
          type: 'AI_MAPPING_PROPOSAL',
          status: 'SUCCEEDED',
          progress: 1,
          resultRef: proposalId,
          createdAt: '2026-07-23T08:00:00+08:00',
        },
        meta: {},
      },
    });
  });
  await page.route(
    `**/api/v1/ai/imports/${importId}/mapping-proposals/${proposalId}`,
    async (route) => {
      await route.fulfill({
        status: 422,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 422,
          code: 'AI_LOW_CONFIDENCE',
          message: 'AI 字段映射置信度不足',
          remediation: '请人工确认',
          requestId: 'REQ-AI-422',
          context: { proposal },
        }),
      });
    }
  );
  await page.goto('/operations/orders');
  await page.getByRole('button', { name: '导入运单' }).click();
  await page.getByLabel('导入 CSV').fill('客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX');
  await page.getByRole('button', { name: '解析并映射' }).click();

  await expect(page.getByText('4 个字段置信度不足')).toBeVisible();
  await page.getByRole('button', { name: '进入人工映射' }).click();
  await expect(page.getByRole('option', { name: /province.*32%/ })).toHaveValue(candidateId);
});

test('生产履约 412 进入 F04 装载并发恢复态', async ({ page }) => {
  let dispatchedRequest: import('@playwright/test').Request | undefined;
  await page.route(
    /\/api\/v1\/linehaul\/load-units\/CNT-SZX-260722-01:dispatch$/,
    async (route) => {
      dispatchedRequest = route.request();
      await route.fulfill({
        status: 412,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          status: 412,
          code: 'PRECONDITION_FAILED',
          detail: '装载单已推进到版本 8',
          remediation: '刷新装载单后重试',
          requestId: 'REQ-LOAD-412',
        }),
      });
    }
  );
  await page.goto('/operations/fulfillment-finance/linehaul');
  await page.getByRole('button', { name: '确认出库' }).click();

  await expect(page.getByText('装载任务已被他人更新')).toBeVisible();
  await expect(page.getByRole('button', { name: '确认出库' })).toBeDisabled();
  expect(dispatchedRequest?.headers()['if-match']).toBe('"4"');
  expect(dispatchedRequest?.headers()['idempotency-key']).toMatch(
    /^dispatchLoadUnit:CNT-SZX-260722-01:v4:p[0-9a-f]{16}$/
  );
  await expectNoSeriousAxe(page);
});

test('生产 390px 报价页无横向画布且 axe serious critical 为 0', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/operations/orders');
  await page.getByRole('button', { name: '报价管理' }).click();
  expect(await gridTrackCount(page.locator('.quote-workbench'))).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectNoSeriousAxe(page);
});

test('390px F10 映射为单列且无横向画布', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/operations/orders?mock=1');
  await page.getByRole('button', { name: '导入运单' }).click();
  await page.getByLabel('导入 CSV').fill('客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX');
  await page.getByRole('button', { name: '解析并映射' }).click();
  await expect(page.getByRole('button', { name: '应用字段映射' })).toBeVisible();

  expect(await gridTrackCount(page.locator('.order-row'))).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectNoSeriousAxe(page);
});

test('390px F04 卡片为单列且主工作区不越界', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/operations/fulfillment-finance/linehaul?mock=1');
  await expect(page.getByRole('heading', { name: '干线与尾程履约' })).toBeVisible();

  expect(await gridTrackCount(page.locator('.ff-three-panels'))).toBe(1);
  expect(
    await page.locator('.ff-workbench').evaluate((element) => element.getBoundingClientRect().right)
  ).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expectNoSeriousAxe(page);
});
