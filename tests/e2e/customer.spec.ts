import { expect, test } from '@playwright/test';

test('客户门户只呈现当前企业数据边界', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('深圳鑫源贸易有限公司').first()).toBeVisible();
  await page.getByRole('button', { name: '账单与付款' }).click();
  await expect(page.getByRole('button', { name: '账单与付款' })).toHaveAttribute(
    'data-active',
    'true'
  );
  await expect(page.getByRole('table', { name: '最近账单' })).toContainText('ST202605-0008');
  await page.screenshot({ path: 'artifacts/e2e/ui0/customer-1440x900.png', fullPage: true });
});
