import { expect, test } from '@playwright/test';

test('平台端代入必须展示审计影响与原因', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '租户管理' })).toBeVisible();
  await page.screenshot({
    path: 'artifacts/e2e/f1c/platform-tenants-1440x900.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '查看租户 上海智立科技有限公司' }).click();
  await expect(page.getByRole('dialog', { name: '租户详情' })).toContainText('尾程派送与 POD');
  await page.screenshot({
    path: 'artifacts/e2e/f1c/platform-tenants-detail-1440x900.png',
    fullPage: true,
  });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '代入 上海智立科技有限公司' }).click();
  const dialog = page.getByRole('dialog', { name: '代入租户' });
  await expect(dialog).toContainText('所有操作都会审计');
  await expect(dialog.getByRole('textbox', { name: '代入原因' })).toHaveValue(
    '协助排查订单同步问题'
  );
  await dialog.getByRole('button', { name: '以管理员身份进入' }).click();
  await expect(page.getByRole('status')).toContainText('剩余 60 分钟');
  await page.getByRole('button', { name: '运行中心' }).click();
  await page.getByLabel('运行状态').selectOption('partial');
  await expect(page.getByText(/部分作业执行失败/)).toBeVisible();
  await expect(page.getByRole('table', { name: '运行作业' })).toContainText('部分失败：2 / 384');
  await page.screenshot({ path: 'artifacts/e2e/f1c/platform-1440x900.png', fullPage: true });
});
