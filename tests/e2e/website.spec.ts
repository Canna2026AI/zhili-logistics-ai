import { expect, test } from '@playwright/test';

test('官网首屏与产品预览使用同一事实数据', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /把跨境物流的订单/ })).toBeVisible();
  await expect(page.getByRole('region', { name: '智立物流 AI 产品介绍' })).toHaveCSS(
    'background-color',
    'rgb(31, 41, 55)'
  );
  const preview = page.getByLabel('智立系统产品预览');
  await expect(preview).toContainText('S2505120004');
  await expect(preview).toContainText('123.50 kg');
  await expect(preview).toContainText('0.48 m³');
  await expect(page.getByRole('heading', { name: '安全可靠，自主可控' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/e2e/f1c/website-1440x900.png', fullPage: true });
  await page.getByRole('button', { name: '预约演示' }).click();
  await page.getByLabel('企业名称').fill('深圳鑫源贸易有限公司');
  await page.getByLabel('联系电话').fill('13800138000');
  await page.getByRole('button', { name: '提交预约' }).click();
  await expect(page.getByRole('status')).toContainText('预约已提交');
  await page.goto('/zhili-logistics-ai/privacy/');
  await expect(page.getByRole('heading', { name: '隐私政策' })).toBeVisible();
  await expect(page).toHaveTitle('隐私政策｜智立科技物流AI系统');
  expect(
    await page.locator('script[type="application/ld+json"]').evaluate((node) => node.textContent)
  ).toContain('WebPage');
  await page.screenshot({ path: 'artifacts/e2e/f1c/website-legal-1440x900.png', fullPage: true });
});
