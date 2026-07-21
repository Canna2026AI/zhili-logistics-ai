import { expect, test } from '@playwright/test';

test('运营端支持搜索、选择与详情抽屉', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '运单管理' })).toBeVisible();
  await page.getByRole('searchbox', { name: '全局搜索' }).fill('S2505120004');
  await page.getByRole('searchbox', { name: '全局搜索' }).press('Enter');
  await expect(page.getByRole('table', { name: '运单列表' }).getByRole('row')).toHaveCount(2);
  await page.getByRole('button', { name: 'S2505120004' }).click();
  await expect(page.getByRole('dialog', { name: '运单详情' })).toContainText('123.50 kg');
  await page.screenshot({ path: 'artifacts/e2e/ui0/ops-1440x900.png', fullPage: true });
});
