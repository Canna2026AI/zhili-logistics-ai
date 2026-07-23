import { expect, test, type Locator } from '@playwright/test';
import axe from 'axe-core';

async function getOptionVisibility(option: Locator) {
  return option.evaluate((element) => {
    const listbox = element.closest<HTMLElement>('[role="listbox"]')!;
    const listboxRect = listbox.getBoundingClientRect();
    const optionRect = element.getBoundingClientRect();
    return {
      scrollTop: listbox.scrollTop,
      listboxTop: listboxRect.top,
      listboxBottom: listboxRect.bottom,
      optionTop: optionRect.top,
      optionBottom: optionRect.bottom,
      fullyVisible: optionRect.top >= listboxRect.top && optionRect.bottom <= listboxRect.bottom,
    };
  });
}

async function expectNoSeriousAxeViolations(page: import('@playwright/test').Page) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await (
      globalThis as typeof globalThis & {
        axe: {
          run: (
            context: Document,
            options: { runOnly: { type: string; values: string[] } }
          ) => Promise<{ violations: Array<{ id: string; impact: string | null }> }>;
        };
      }
    ).axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    return result.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious'
    );
  });
  expect(violations).toEqual([]);
}

test('客户门户只呈现当前企业数据边界', async ({ page }) => {
  await page.goto('/?mock=1');
  await expect(page.getByText('深圳鑫源贸易有限公司').first()).toBeVisible();
  await expect(page.getByText('华南跨境供应链')).toHaveCount(0);
  await page.screenshot({
    path: 'artifacts/e2e/f1c/customer-dashboard-1440x900.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '账单与付款' }).click();
  await expect(page.getByRole('button', { name: '账单与付款' })).toHaveAttribute(
    'data-active',
    'true'
  );
  await expect(page.getByRole('table', { name: '最近账单' })).toContainText('INV-202607-018');
  await expect(page.getByRole('table', { name: '付款记录' })).not.toContainText('PAY-20260512-01');
  await page.getByRole('button', { name: '查看账单 INV-202607-018' }).click();
  await page.getByRole('button', { name: '立即支付' }).click();
  await page.getByRole('button', { name: '确认付款' }).click();
  await expect(page.getByRole('heading', { name: '支付订单已创建' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/e2e/f1c/customer-1440x900.png', fullPage: true });
});

test('客户从查价进入新建运单并查看租户内轨迹', async ({ page }) => {
  await page.goto('/?mock=1');
  await page.getByRole('button', { name: '立即查价', exact: true }).click();
  await page.getByLabel('目的地邮编').fill('90001');
  await page.getByRole('button', { name: '获取报价' }).click();
  await expect(page.getByText('CNY 5,320.00')).toBeVisible();
  await page.getByRole('button', { name: '选择此报价' }).click();
  await expect(page.getByText('已选择：智立海运专线 · CNY 5,320.00')).toBeVisible();
  await page.getByLabel('收件人').fill('John Smith');
  await page.getByLabel('目的地').fill('US-LAX');
  await page.getByRole('button', { name: '提交预报' }).click();
  await expect(page.getByRole('status')).toContainText('预报已提交');
  await page.getByRole('button', { name: '我的运单' }).click();
  const waybills = page.getByRole('table', { name: '我的运单列表' });
  await expect(waybills).toContainText('S2505120006');
  await expect(waybills).toContainText('US-LAX');
  await expect(waybills).toContainText('122.00');
  await page.getByRole('button', { name: '查看轨迹 S2505120006' }).click();
  await expect(page.getByRole('heading', { name: '运单轨迹' })).toBeVisible();
  await expect(page.getByText('预报已提交 · 等待仓库收货')).toBeVisible();
});

test('客户过期报价被阻止且陈旧快照展示服务端版本差异', async ({ page }) => {
  await page.goto('/?mock=1');
  await page.getByRole('button', { name: '立即查价', exact: true }).click();
  await page.getByLabel('目的地邮编').fill('EXPIRED');
  await page.getByRole('button', { name: '获取报价' }).click();
  const quote = page.getByRole('region', { name: '报价 Q2505120042' });
  await expect(quote).toContainText('已过期');
  await expect(quote.getByRole('button', { name: '选择此报价' })).toBeDisabled();
  await quote.getByRole('button', { name: '按当前规则重新查价' }).click();
  await page.getByLabel('目的地邮编').fill('41000');
  await page.getByRole('button', { name: '获取报价' }).click();
  await page.getByRole('button', { name: '选择此报价' }).click();
  await expect(page.getByRole('alert')).toContainText('报价已在服务端过期');
  await expect(page.getByRole('heading', { name: '多渠道查价' })).toBeVisible();

  await page.getByLabel('演示状态').selectOption('stale');
  await page.getByRole('button', { name: '刷新并比较' }).click();
  await expect(page.getByRole('alert')).toContainText('snapshotAt 10:18 → 10:21');
});

test('客户门户 390px 完整抽屉导航可达且管理焦点和 aria 状态', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mock=1');
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);

  const menuTrigger = page.getByRole('button', { name: '折叠菜单' });
  await expect(menuTrigger).toHaveAttribute('aria-expanded', 'false');
  await menuTrigger.click();
  await expect(menuTrigger).toHaveAttribute('aria-expanded', 'true');
  const drawer = page.getByRole('dialog', { name: '客户门户菜单' });
  const drawerNavigation = drawer.getByRole('navigation', { name: '移动端完整导航' });
  await expect(drawerNavigation.getByRole('button')).toHaveCount(10);
  await expect(page.locator('.portal-content')).toHaveAttribute('inert', '');
  const drawerClose = drawer.getByRole('button', { name: '关闭' });
  await expect(drawerClose).toBeFocused();
  await expect(drawerClose).toBeInViewport();
  expect((await drawer.boundingBox())?.width).toBeLessThanOrEqual(390);
  await expectNoSeriousAxeViolations(page);

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(menuTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(menuTrigger).toBeFocused();

  for (const [destination, heading] of [
    ['批量导入', '批量导入'],
    ['查价', '多渠道查价'],
    ['轨迹查询', '运单轨迹'],
    ['地址簿', '地址簿'],
    ['API', '申请物流 API 权限'],
  ] as const) {
    await menuTrigger.click();
    await drawerNavigation.getByRole('button', { name: destination, exact: true }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }

  await page.getByRole('button', { name: '运单', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的运单' })).toBeVisible();
  await expect(page.locator('.portal-table-wrap')).toHaveCSS('overflow-x', 'auto');
  await page.screenshot({ path: 'artifacts/e2e/f1c/customer-390x844.png', fullPage: true });
});

test('客户门户全局搜索在移动端打开 canonical 运单并通过 axe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mock=1');
  const search = page.getByRole('combobox', { name: '全局搜索' });
  await expect(search).toBeVisible();
  await search.fill('S2505120004');
  const results = page.getByRole('listbox', { name: '全局搜索结果' });
  await expect(results.getByRole('option', { name: /运单 S2505120004/ })).toContainText(
    'HBL2505120004'
  );
  await expectNoSeriousAxeViolations(page);
  await results.getByRole('option', { name: /运单 S2505120004/ }).click();
  await expect(page.getByRole('heading', { name: '运单轨迹' })).toBeVisible();
  await expect(page.getByText('S2505120004', { exact: true })).toBeVisible();
  await expect(search).toBeFocused();
});

test('客户门户全局搜索键盘虚拟焦点始终滚入长列表可视区', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mock=1');
  const search = page.getByRole('combobox', { name: '全局搜索' });
  await search.fill('页面');
  const results = page.getByRole('listbox', { name: '全局搜索结果' });
  const options = results.getByRole('option');
  await expect(options).toHaveCount(10);

  const firstOption = options.first();
  const lastOption = options.last();
  const firstOptionId = await firstOption.getAttribute('id');
  const lastOptionId = await lastOption.getAttribute('id');
  await expect(search).toHaveAttribute('aria-activedescendant', firstOptionId!);
  expect((await getOptionVisibility(firstOption)).fullyVisible).toBe(true);

  for (let index = 1; index < 10; index += 1) {
    await search.press('ArrowDown');
    const activeOption = options.nth(index);
    await expect(search).toHaveAttribute(
      'aria-activedescendant',
      (await activeOption.getAttribute('id'))!
    );
    const activeMetrics = await getOptionVisibility(activeOption);
    expect(
      activeMetrics.fullyVisible,
      `ArrowDown index ${index}: ${JSON.stringify(activeMetrics)}`
    ).toBe(true);
  }
  await expect(search).toHaveAttribute('aria-activedescendant', lastOptionId!);
  await expect(lastOption).toHaveAttribute('aria-selected', 'true');
  const lastMetrics = await getOptionVisibility(lastOption);
  expect(lastMetrics.scrollTop).toBeGreaterThan(0);
  expect(lastMetrics.fullyVisible).toBe(true);

  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', lastOptionId!);
  expect((await getOptionVisibility(lastOption)).fullyVisible).toBe(true);

  for (let index = 8; index >= 0; index -= 1) {
    await search.press('ArrowUp');
    const activeOption = options.nth(index);
    await expect(search).toHaveAttribute(
      'aria-activedescendant',
      (await activeOption.getAttribute('id'))!
    );
    const activeMetrics = await getOptionVisibility(activeOption);
    expect(
      activeMetrics.fullyVisible,
      `ArrowUp index ${index}: ${JSON.stringify(activeMetrics)}`
    ).toBe(true);
  }
  await expect(search).toHaveAttribute('aria-activedescendant', firstOptionId!);
  await expect(firstOption).toHaveAttribute('aria-selected', 'true');
  const firstMetrics = await getOptionVisibility(firstOption);
  expect(firstMetrics.scrollTop).toBe(0);
  expect(firstMetrics.fullyVisible).toBe(true);

  await search.press('ArrowUp');
  await expect(search).toHaveAttribute('aria-activedescendant', firstOptionId!);
  expect((await getOptionVisibility(firstOption)).fullyVisible).toBe(true);
});

test('客户门户全局搜索支持键盘选择和零结果关闭', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mock=1');
  const search = page.getByRole('combobox', { name: '全局搜索' });
  await search.fill('S250512000');
  const results = page.getByRole('listbox', { name: '全局搜索结果' });
  const options = results.getByRole('option');
  await expect(options).toHaveCount(5);
  expect(await options.evaluateAll((items) => items.every((item) => item.tabIndex === -1))).toBe(
    true
  );
  const firstOptionId = await options.nth(0).getAttribute('id');
  const secondOptionId = await options.nth(1).getAttribute('id');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-activedescendant', firstOptionId!);
  await search.press('ArrowDown');
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-activedescendant', secondOptionId!);
  await search.press('ArrowUp');
  await search.press('ArrowUp');
  await expect(search).toHaveAttribute('aria-activedescendant', firstOptionId!);

  await search.press('Tab');
  await expect(results).toBeHidden();
  await expect(search).not.toHaveAttribute('aria-activedescendant');
  await expect(page.locator(':focus')).not.toHaveAttribute('role', 'option');

  await search.focus();
  await expect(results).toBeVisible();
  await search.press('Shift+Tab');
  await expect(results).toBeHidden();
  await expect(page.getByRole('button', { name: '折叠菜单' })).toBeFocused();

  await search.focus();
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: '运单轨迹' })).toBeVisible();
  await expect(page.getByText('S2505120002', { exact: true })).toBeVisible();
  await expect(search).toBeFocused();

  await search.fill('Q2505120042');
  await expect(page.getByRole('listbox', { name: '全局搜索结果' }).getByRole('option')).toHaveCount(
    0
  );
  await expect(page.getByRole('status', { name: '全局搜索状态' })).toContainText('未找到匹配结果');

  await search.fill('NOT-A-CUSTOMER-RECORD');
  await expect(page.getByRole('status', { name: '全局搜索状态' })).toContainText('未找到匹配结果');
  await expect(page.getByRole('listbox', { name: '全局搜索结果' })).toBeAttached();
  await expect(search).toHaveAttribute('aria-controls', 'customer-global-search-results');
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await search.press('Escape');
  await expect(page.getByRole('status', { name: '全局搜索状态' })).toBeHidden();
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(search).toHaveValue('NOT-A-CUSTOMER-RECORD');
  await expect(search).toBeFocused();

  await search.fill('S2505120004');
  await page.mouse.click(200, 600);
  await expect(page.getByRole('listbox', { name: '全局搜索结果' })).toBeHidden();
});
