import { expect, test } from '@playwright/test';

const previewPath = '/src/features/fulfillment-finance/e2e.html';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1586, height: 992 });
});

test('F1B warehouse receipt, loading, tracking and finance commands are executable', async ({
  page,
}) => {
  await page.goto(previewPath);
  await expect(page.getByRole('heading', { name: '收货扫描' })).toBeVisible();
  await expect(page.getByText('123.50 kg', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('0.48 m³ / 80.00 kg')).toBeVisible();

  await page.getByRole('button', { name: '确认收货' }).click();
  await expect(page.getByRole('status')).toContainText('收货已确认，已进入待分货');
  await page.screenshot({
    path: 'artifacts/e2e/F1B/warehouse-1586x992.png',
    fullPage: true,
  });

  await page.getByRole('button', { name: /干线尾程/ }).click();
  await expect(page.getByRole('heading', { name: '干线与尾程履约' })).toBeVisible();
  await page.getByRole('button', { name: '确认出库' }).click();
  await expect(page.getByRole('status')).toContainText('已出库');

  await page.getByRole('button', { name: /轨迹客服/ }).click();
  await page.getByRole('button', { name: '解决问题' }).click();
  await expect(page.getByRole('status')).toContainText('JOB-NOTIFY-5001');
});

test('F06-DANGER-UNREVIEW requires impact, reason, version and audit destination', async ({
  page,
}) => {
  await page.goto(previewPath);
  await page.getByRole('button', { name: /财务结算/ }).click();
  await expect(page.getByRole('heading', { name: '物流财务结算' })).toBeVisible();
  await expect(page.getByRole('table', { name: '应收费用列表' })).toContainText('S2505120004');
  await expect(page.getByLabel('应收详情')).toContainText('¥5,320.00');

  await page.getByRole('button', { name: '反审核' }).click();
  const dialog = page.getByRole('dialog', { name: '反审核费用' });
  await expect(dialog).toContainText('影响');
  await expect(dialog).toContainText('预期版本 11');
  await expect(dialog).toContainText('audit://finance/charges/CHG-S2505120004');
  await expect(dialog.getByRole('button', { name: '确认反审核' })).toBeDisabled();
  await dialog.getByRole('textbox', { name: '操作原因' }).fill('承运商补传尾程费用');
  await dialog.getByRole('button', { name: '确认反审核' }).click();
  await expect(page.getByRole('status')).toContainText('反审核已提交，审计事件已记录');
  await page.screenshot({
    path: 'artifacts/e2e/F1B/finance-1586x992.png',
    fullPage: true,
  });
});

test('shared state matrix exposes loading, empty, failed, forbidden, stale and partial states', async ({
  page,
}) => {
  await page.goto(previewPath);
  const stateSelect = page.getByRole('combobox', { name: '验收状态' });
  for (const [state, evidence] of [
    ['loading', '正在加载履约数据'],
    ['empty', '当前筛选没有数据'],
    ['failed', 'REQ-FIN-5001'],
    ['forbidden', '缺少权限 finance.charge.review'],
    ['stale', '本地版本 10 / 服务器版本 11'],
    ['partial', '成功 8 条，失败 2 条'],
  ] as const) {
    await stateSelect.selectOption(state);
    await expect(page.getByText(evidence)).toBeVisible();
  }
});
