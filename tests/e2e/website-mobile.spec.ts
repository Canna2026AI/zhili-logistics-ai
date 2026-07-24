import { expect, test } from '@playwright/test';

test('官网移动端无横向溢出且 CTA 可见', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /预约演示/ })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow).toBe(false);
  await expect(page.getByLabel('智立系统产品预览')).toContainText('123.50 kg');
  await page.screenshot({ path: 'artifacts/e2e/f1c/website-390x844.png', fullPage: true });
});
