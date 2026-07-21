import { expect, test } from '@playwright/test';

test('官网首屏与产品预览使用同一事实数据', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /把跨境物流的订单/ })).toBeVisible();
  const preview = page.getByLabel('智立系统产品预览');
  await expect(preview).toContainText('S2505120004');
  await expect(preview).toContainText('123.50 kg');
  await expect(preview).toContainText('0.48 m³');
  await page.screenshot({ path: 'artifacts/e2e/ui0/website-1440x900.png', fullPage: true });
});
