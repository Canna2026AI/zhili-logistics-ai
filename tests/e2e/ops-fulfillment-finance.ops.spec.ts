import { expect, test } from '@playwright/test';
import axe from 'axe-core';

const previewPath = '/src/features/fulfillment-finance/e2e.html';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1586, height: 992 });
});

test('F1B warehouse receipt, loading, tracking and finance commands are executable', async ({
  page,
}) => {
  await page.goto(previewPath);
  await expect(page.getByRole('button', { name: /仓库作业/ })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(page.getByRole('heading', { name: '收货扫描' })).toBeVisible();
  await expect(page.getByText('123.50 kg', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('0.48 m³ / 80.00 kg')).toBeVisible();

  await page.getByRole('button', { name: '确认收货' }).click();
  await expect(page.getByRole('status')).toContainText('收货已确认，已进入待分货');
  await expect(page.getByRole('status')).toContainText('AUD-confirmReceipt-1');
  await page.screenshot({
    path: 'artifacts/e2e/F1B/warehouse-1586x992.png',
    fullPage: true,
  });

  await page.getByRole('button', { name: /干线尾程/ }).click();
  await expect(page.getByRole('button', { name: /干线尾程/ })).toHaveAttribute(
    'aria-current',
    'page'
  );
  await expect(page.getByRole('heading', { name: '干线与尾程履约' })).toBeVisible();
  await page.getByRole('button', { name: '确认出库' }).click();
  await expect(page.getByRole('status')).toContainText('已出库');

  await page.getByRole('button', { name: /轨迹客服/ }).click();
  await page.getByRole('button', { name: '解决问题' }).click();
  await expect(page.getByRole('status')).toContainText('JOB-NOTIFY-5001');
});

test('final application assembly executes WH-08, LM-05/06 and finance P0 workflows', async ({
  page,
}) => {
  await page.goto(previewPath);
  await page.getByRole('button', { name: '打印交接单' }).click();
  await expect(page.getByLabel('WH-08 打印任务')).toContainText('PRINT-S2505120004');

  await page.getByRole('button', { name: /干线尾程/ }).click();
  await page.getByRole('button', { name: '同步合作方' }).click();
  await expect(page.getByLabel('合作方同步状态')).toContainText('已完成 42 条');
  await page.getByRole('button', { name: '重放事件' }).click();
  await expect(page.getByLabel('合作方同步状态')).toContainText('未产生重复状态');
  await page.getByRole('button', { name: '生成尾程费用' }).click();
  await expect(page.getByLabel('合作方同步状态')).toContainText('应收 ¥860.00 / 应付 ¥620.00');

  await page.getByRole('button', { name: /财务结算/ }).click();
  for (const [label, result] of [
    ['校验应付导入', '98 成功 / 2 失败'],
    ['提交部分成功项', '98 已提交 / 2 条保留失败'],
    ['执行应付对账', '差异 2 条'],
    ['分配付款', '未分配 0.00'],
    ['发起账单争议', 'DSP-ST202605-0008-01'],
    ['审批发票', 'INV-202607-018 已审批'],
  ] as const) {
    await page.getByRole('button', { name: label }).click();
    await expect(page.getByLabel('财务流程状态')).toContainText(result);
  }
});

test('F06-DANGER-UNREVIEW requires impact, reason, version and audit destination', async ({
  page,
}) => {
  await page.goto(previewPath);
  await page.getByRole('button', { name: /财务结算/ }).click();
  await expect(page.getByRole('heading', { name: '物流财务结算' })).toBeVisible();
  await expect(page.getByRole('table', { name: '应收费用列表' })).toContainText('S2505120004');
  await expect(page.getByLabel('应收详情')).toContainText('¥5,320.00');

  await page.getByRole('button', { name: '反审核' }).click();
  const dialog = page.getByRole('dialog', { name: '反审核费用' });
  await expect(dialog).toContainText('影响');
  await expect(dialog).toContainText('预期版本 11');
  await expect(dialog).toContainText('audit://finance/charges/CHG-S2505120004');
  await expect(dialog.getByRole('button', { name: '确认反审核' })).toBeDisabled();
  await dialog.getByRole('textbox', { name: '操作原因' }).fill('承运商补传尾程费用');
  await dialog.getByRole('button', { name: '确认反审核' }).click();
  await expect(page.getByRole('status')).toContainText('反审核已提交 · 审计 AUD-unreviewCharge-1');
  await page.screenshot({
    path: 'artifacts/e2e/F1B/finance-1586x992.png',
    fullPage: true,
  });
});

test('shared state matrix exposes loading, empty, failed, forbidden, stale and partial states', async ({
  page,
}) => {
  await page.goto(previewPath);
  const stateSelect = page.getByRole('combobox', { name: '验收状态' });
  for (const [state, evidence] of [
    ['loading', '正在加载履约数据'],
    ['empty', '当前筛选没有数据'],
    ['failed', 'REQ-FIN-5001'],
    ['forbidden', '缺少权限 finance.charge.review'],
    ['stale', '本地版本 10 / 服务器版本 11'],
    ['partial', '成功 8 条，失败 2 条'],
  ] as const) {
    await stateSelect.selectOption(state);
    await expect(page.getByText(evidence)).toBeVisible();
  }
});

test('F1B warehouse and finance assembly have no serious or critical axe violations', async ({
  page,
}) => {
  await page.goto(previewPath);
  await page.addScriptTag({ content: axe.source });

  const collectSeriousViolations = () =>
    page.evaluate(async () => {
      const runtime = (
        globalThis as typeof globalThis & {
          axe: {
            run: (
              context: Document,
              options: { runOnly: { type: string; values: string[] } }
            ) => Promise<{
              violations: Array<{ id: string; impact: string | null; nodes: unknown[] }>;
            }>;
          };
        }
      ).axe;
      const result = await runtime.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return result.violations.filter(
        (violation) => violation.impact === 'critical' || violation.impact === 'serious'
      );
    });

  expect(await collectSeriousViolations()).toEqual([]);
  await page.getByRole('button', { name: /财务结算/ }).click();
  expect(await collectSeriousViolations()).toEqual([]);
});
