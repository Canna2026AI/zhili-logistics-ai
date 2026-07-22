import { expect, test } from '@playwright/test';

test('运营端支持搜索、选择与详情抽屉', async ({ page }) => {
  await page.goto('/operations/orders?mock=1');
  await expect(page.getByRole('heading', { level: 1, name: '运营工作台' })).toBeVisible();
  await page.getByRole('button', { name: '运单管理' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '运单管理' })).toBeVisible();
  await page.getByRole('button', { name: 'S2505120004', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '运单详情' })).toContainText('123.50 kg');
  await page.screenshot({ path: 'artifacts/e2e/ui0/ops-1440x900.png', fullPage: true });
});
