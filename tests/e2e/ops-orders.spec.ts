import { expect, test } from '@playwright/test';

const storybook = 'http://127.0.0.1:6006/iframe.html';

test('F1A 运营端运单密度、筛选、Drawer 与危险批量命令', async ({ page }) => {
  await page.setViewportSize({ width: 1586, height: 992 });
  await page.goto(`${storybook}?id=f1a-opsorders--dense-waybill-list&viewMode=story`);
  await expect(page.getByRole('table', { name: '运单列表' }).getByRole('row')).toHaveCount(13);
  await page.getByRole('tab', { name: /问题件\s*46/ }).click();
  await expect(page.getByRole('table', { name: '运单列表' }).getByRole('row')).toHaveCount(2);
  await page.getByRole('tab', { name: /全部运单\s*1,248/ }).click();
  const canonicalRow = page.getByRole('row', { name: /S2505120004/ });
  await canonicalRow.getByRole('checkbox').check();
  await canonicalRow.getByRole('button', { name: 'S2505120004', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '运单详情' })).toContainText('123.50 kg');
  await page.screenshot({ path: 'artifacts/e2e/f1a/ops-waybill-1586x992.png', fullPage: false });
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '批量操作（1）' }).click();
  await page.getByRole('button', { name: '取消运单' }).click();
  await expect(page.getByRole('button', { name: '确认取消' })).toBeDisabled();
});

test('F1A 下单报价保留标准数据、查价解释与唯一主命令', async ({ page }) => {
  await page.setViewportSize({ width: 1585, height: 992 });
  await page.goto(`${storybook}?id=f1a-opsorders--order-quote&viewMode=story`);
  await expect(page.getByRole('heading', { name: '新建运单与报价说明' })).toBeVisible();
  await expect(page.getByText('CNY 5,320.00')).toHaveCount(2);
  await page.getByRole('button', { name: '查看解释' }).click();
  await expect(page.getByText(/RATE-DHL-CN-US-2026\.05-v3/)).toBeVisible();
  await expect(page.getByRole('button', { name: '提交预报' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/e2e/f1a/ops-quote-1585x992.png', fullPage: false });
});

test('F1A 权限模拟不把拒绝伪装成空数据', async ({ page }) => {
  await page.goto(`${storybook}?id=f1a-opsorders--permission-simulation&viewMode=story`);
  await page.getByRole('button', { name: '模拟只读权限' }).click();
  await expect(page.getByText(/waybill\.write 被 DENY/)).toBeVisible();
  await expect(page.getByText(/缺少 waybill\.read/)).toBeVisible();
});
