import { expect, test } from '@playwright/test';

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
});
