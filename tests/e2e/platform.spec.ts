import { expect, test } from '@playwright/test';
import axe from 'axe-core';

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
  await expect(page.getByRole('status')).toContainText(/剩余 (60:00|59:\d{2})/);
  await page.getByRole('button', { name: '运行中心' }).click();
  await page.getByLabel('运行状态').selectOption('partial');
  await expect(page.getByText(/部分作业执行失败/)).toBeVisible();
  await expect(page.getByRole('table', { name: '运行作业' })).toContainText('部分失败：2 / 384');
  await page.screenshot({ path: 'artifacts/e2e/f1c/platform-1440x900.png', fullPage: true });
});

test('平台配置回写当前租户实体且运行快照可比较', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '配额与用量' }).click();
  await page.getByLabel('配置租户').selectOption('2');
  await page.getByLabel('租户套餐').selectOption('企业版');
  await page.getByLabel('运单配额上限').fill('260000');
  await page.getByLabel('租户到期日').fill('2027-02-01');
  await page.getByRole('button', { name: '保存租户配置' }).click();
  await page.getByRole('button', { name: '租户管理' }).click();
  await page.getByRole('button', { name: '查看租户 深圳海运通物流有限公司' }).click();
  const detail = page.getByRole('dialog', { name: '租户详情' });
  await expect(detail).toContainText('企业版');
  await expect(detail).toContainText('120,000 / 260,000');
  await expect(detail).toContainText('2027-02-01');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '运行中心' }).click();
  await page.getByLabel('运行状态').selectOption('stale');
  await page.getByRole('button', { name: '刷新运行快照' }).click();
  await expect(page.locator('.platform-runtime-notice')).toContainText('snapshotAt 10:18 → 10:21');
  await page.getByRole('button', { name: '应用服务器快照' }).click();
  await expect(page.getByRole('table', { name: '运行作业' })).toBeVisible();
  await page.getByLabel('运行状态').selectOption('partial');
  await page.getByRole('button', { name: '仅重试 2 个失败项' }).click();
  await expect(page.getByText(/job-pay-382、job-pay-384 已合并成功/)).toBeVisible();
  await expect(
    page.locator('.platform-runtime-stats > div').filter({ hasText: '失败作业' })
  ).toContainText('0 / 384');
  await expect(page.getByRole('row', { name: /支付回调/ })).toContainText('健康：0 / 384 失败');
});

test('390px 紧凑导航覆盖六个页面并管理 aria、Escape 与焦点', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page.getByRole('button', { name: /平台导航/ });

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const firstDrawer = page.getByRole('dialog', { name: '平台导航菜单' });
  await expect(firstDrawer).toBeVisible();
  await expect(firstDrawer.getByRole('button', { name: '关闭' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(firstDrawer.getByRole('button', { name: '运行中心' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(firstDrawer.getByRole('button', { name: '关闭' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();

  for (const destination of [
    '租户管理',
    '套餐与模块',
    '配额与用量',
    '平台公告',
    '代入与审计',
    '运行中心',
  ]) {
    await trigger.click();
    const drawer = page.getByRole('dialog', { name: '平台导航菜单' });
    await drawer.getByRole('button', { name: destination }).click();
    await expect(page.getByRole('heading', { name: destination })).toBeVisible();
    await expect(drawer).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
});

test('平台全局搜索键盘打开规范租户、点击作业跳转并呈现真实零结果', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const searchbox = page.getByRole('combobox', { name: '平台全局搜索' });

  await searchbox.fill('上海智立');
  await expect(
    page.getByRole('option', { name: /上海智立科技有限公司.*租户.*zhili-sh/ })
  ).toBeVisible();
  await searchbox.press('ArrowDown');
  await searchbox.press('Enter');
  await expect(page.getByRole('dialog', { name: '租户详情' })).toContainText('zhili-sh');
  await page.keyboard.press('Escape');

  await searchbox.fill('支付回调');
  await page.getByRole('option', { name: /支付回调.*运行作业.*运行中心/ }).click();
  await expect(page.getByRole('heading', { name: '运行中心' })).toBeVisible();
  await expect(page.getByRole('table', { name: '运行作业' })).toContainText('支付回调');

  await searchbox.fill('绝对不存在的租户或作业');
  await expect(page.getByRole('status')).toContainText(
    '未找到与“绝对不存在的租户或作业”匹配的结果'
  );

  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const runtime = (globalThis as typeof globalThis & { axe: typeof axe }).axe;
    const result = await runtime.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    return result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );
  });
  expect(violations).toEqual([]);
});
