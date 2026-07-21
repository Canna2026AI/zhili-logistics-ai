import { expect, test } from '@playwright/test';

test('平台端代入必须展示审计影响与原因', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '租户管理' })).toBeVisible();
  await page.getByRole('button', { name: '代入', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '代入租户' });
  await expect(dialog).toContainText('所有操作都会审计');
  await expect(dialog.getByRole('textbox', { name: '代入原因' })).toHaveValue(
    '协助排查订单同步问题'
  );
  await page.screenshot({ path: 'artifacts/e2e/ui0/platform-1440x900.png', fullPage: true });
});
