import { expect, test } from '@playwright/test';

test('客户门户只呈现当前企业数据边界', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('深圳鑫源贸易有限公司').first()).toBeVisible();
  await expect(page.getByText('华南跨境供应链')).toHaveCount(0);
  await page.screenshot({
    path: 'artifacts/e2e/f1c/customer-dashboard-1440x900.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '账单与付款' }).click();
  await expect(page.getByRole('button', { name: '账单与付款' })).toHaveAttribute(
    'data-active',
    'true'
  );
  await expect(page.getByRole('table', { name: '最近账单' })).toContainText('ST202605-0008');
  await expect(page.getByRole('table', { name: '付款记录' })).not.toContainText('PAY-20260512-01');
  await page.getByRole('button', { name: '支付 ST202605-0008' }).click();
  await expect(page.getByRole('dialog', { name: '确认支付' })).toContainText('CNY 2,320.00');
  await page.getByRole('button', { name: '确认支付' }).click();
  await expect(page.getByRole('status')).toContainText('支付订单已创建');
  await page.screenshot({ path: 'artifacts/e2e/f1c/customer-1440x900.png', fullPage: true });
});

test('客户从查价进入新建运单并查看租户内轨迹', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '立即查价', exact: true }).click();
  await page.getByLabel('目的地邮编').fill('90001');
  await page.getByRole('button', { name: '获取报价' }).click();
  await expect(page.getByText('CNY 5,320.00')).toBeVisible();
  await page.getByRole('button', { name: '选择此报价' }).click();
  await expect(page.getByText('已选择：智立海运专线 · CNY 5,320.00')).toBeVisible();
  await page.getByLabel('收件人').fill('John Smith');
  await page.getByLabel('目的地').fill('US-LAX');
  await page.getByRole('button', { name: '提交预报' }).click();
  await expect(page.getByRole('status')).toContainText('预报已提交');
  await page.getByRole('button', { name: '我的运单' }).click();
  await expect(page.getByRole('table', { name: '我的运单列表' })).toContainText('S2505120006');
  await page.getByRole('button', { name: '查看轨迹 S2505120006' }).click();
  await expect(page.getByRole('heading', { name: '运单轨迹' })).toBeVisible();
  await expect(page.getByText('预报已提交 · 等待仓库收货')).toBeVisible();
});

test('客户门户 390px 无页面级横向溢出且触控导航可用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  await page.getByRole('button', { name: '运单', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的运单' })).toBeVisible();
  await expect(page.locator('.portal-table-wrap')).toHaveCSS('overflow-x', 'auto');
  await page.screenshot({ path: 'artifacts/e2e/f1c/customer-390x844.png', fullPage: true });
});
