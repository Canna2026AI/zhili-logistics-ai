import { expect, test } from '@playwright/test';

test('PDA 扫描反馈与离线队列状态可操作', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('待同步队列接近上限（183/200）')).toBeVisible();
  const scanInput = page.getByLabel('扫描运单号');
  await scanInput.focus();
  await expect
    .poll(() => scanInput.evaluate((element) => getComputedStyle(element).outlineStyle))
    .not.toBe('none');
  await page.getByRole('button', { name: '确认收货' }).click();
  await expect(page.getByText('收货成功：实收 123.50 kg')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('收货成功：实收 123.50 kg');
  await expect(page.getByText('#1842 · S2505120004 · 待同步')).toBeVisible();
  await page.screenshot({ path: 'artifacts/e2e/ui0/pda-390x844.png', fullPage: true });
});
