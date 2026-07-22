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
  await page.getByLabel('配置租户').selectOption({ label: '深圳海运通物流有限公司' });
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
  const tenantOption = page.getByRole('option', {
    name: /上海智立科技有限公司.*租户.*zhili-sh/,
  });
  await expect(tenantOption).toBeVisible();
  await expect(tenantOption).toHaveAttribute('tabindex', '-1');

  await searchbox.press('Tab');
  await expect(page.getByRole('button', { name: '新建租户' }).first()).toBeFocused();
  await expect(page.locator('body')).not.toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(searchbox).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: /平台导航/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(searchbox).toBeFocused();
  await expect(tenantOption).toBeVisible();
  await searchbox.press('Escape');
  await expect(searchbox).toBeFocused();
  await expect(tenantOption).not.toBeVisible();

  await searchbox.press('ArrowDown');
  await searchbox.press('Enter');
  await expect(page.getByRole('dialog', { name: '租户详情' })).toContainText('zhili-sh');
  await page.keyboard.press('Escape');
  await expect(searchbox).toBeFocused();

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

test('平台全局搜索实时跟随已发布公告和退出后的代入审计记录', async ({ page }) => {
  await page.goto('/');
  const searchbox = page.getByRole('combobox', { name: '平台全局搜索' });

  await page.getByRole('button', { name: '平台公告' }).click();
  await page.getByLabel('公告标题').fill('紧急港区升级通知');
  await page.getByRole('button', { name: '发布公告' }).click();
  await expect(page.getByText('紧急港区升级通知')).toBeVisible();
  await searchbox.fill('紧急港区升级通知');
  await expect(
    page.getByRole('option', { name: /紧急港区升级通知.*公告.*平台公告/ })
  ).toBeVisible();

  await searchbox.fill('租户管理');
  await page.getByRole('option', { name: /租户管理.*页面.*平台导航/ }).click();
  await page.getByRole('button', { name: '代入 上海智立科技有限公司' }).click();
  await page.getByLabel('代入原因').fill('核查自定义审计原因XYZ');
  await page.getByRole('button', { name: '以管理员身份进入' }).click();
  await expect(page.locator('.platform-session')).toContainText('核查自定义审计原因XYZ');
  await page.getByRole('button', { name: '立即退出' }).click();
  await expect(page.getByRole('button', { name: '立即退出' })).not.toBeVisible();
  await page.getByRole('button', { name: '代入与审计' }).click();
  await expect(page.getByRole('table', { name: '审计记录' })).toContainText(
    '核查自定义审计原因XYZ'
  );
  await searchbox.fill('核查自定义审计原因XYZ');
  await expect(
    page.getByRole('option', {
      name: /以管理员身份代入.*审计记录.*核查自定义审计原因XYZ/,
    })
  ).toBeVisible();
});

test('平台命令响应体丢失时复用原幂等键并从同一逻辑操作恢复', async ({ page }) => {
  const keys: Array<string | undefined> = [];
  let attempt = 0;
  await page.route('**/api/v1/platform/operations/health', async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    attempt += 1;
    if (attempt === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"data":',
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { operationId: 'OPS-HEALTH-RECOVERED', status: 'SUCCEEDED', message: '恢复完成' },
      }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '系统健康' }).click();

  await page.getByRole('button', { name: '运行健康检查' }).click();
  await expect(page.getByRole('alert')).toContainText('响应不完整');
  await page.getByRole('button', { name: '运行健康检查' }).click();

  await expect(page.getByRole('status')).toContainText('OPS-HEALTH-RECOVERED');
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});

test('策略保存后清理 410 保留回执且重开采用服务端规范化 statements', async ({ page }) => {
  const meta = { requestId: 'req-platform-fault', asOf: '2026-07-23T00:00:00.000Z' };
  let roleSaves = 0;
  let tenantSaves = 0;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON() as Record<string, unknown>;
    if (path.includes('/effective-permissions:preview')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            userId: '01JUSER000000000000000001',
            effectiveStatements: [],
            differences: [],
          },
          meta,
        }),
      });
      return;
    }
    if (path.endsWith('/iam/field-policy:preview')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            subjectId: '01JUSER000000000000000001',
            effectivePolicies: body.proposedPolicies,
            differences: [],
          },
          meta,
        }),
      });
      return;
    }
    if (path.endsWith('/iam/permission-simulations') && request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: '01JSIMULATION0000000000001',
            userId: '01JUSER000000000000000001',
            actorId: '01JADMIN000000000000000001',
            expiresAt: '2099-12-31T23:59:59.000Z',
          },
          meta,
        }),
      });
      return;
    }
    if (path.endsWith(':verify')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { allowed: true, trace: ['role'] }, meta }),
      });
      return;
    }
    if (path.includes('/iam/permission-simulations/') && request.method() === 'DELETE') {
      await route.fulfill({
        status: 410,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'SIMULATION_EXPIRED', message: 'already gone' }),
      });
      return;
    }
    if (path.includes('/iam/roles/') && path.endsWith('/policy')) {
      roleSaves += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            roleId: '01JROLE000000000000000001',
            version: 19,
            statements: [
              { effect: 'ALLOW', resource: 'waybill', actions: ['read'], dataScope: 'TENANT' },
            ],
          },
          meta,
        }),
      });
      return;
    }
    if (path.endsWith('/entitlements')) {
      tenantSaves += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            tenantId: '01JTENANT0000000000000001',
            modules: body.modules,
            version: 2,
          },
          meta,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'UNHANDLED_TEST_ROUTE', message: path }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '查看租户 上海智立科技有限公司' }).click();
  await page.getByRole('button', { name: '配置授权与策略' }).click();
  await page.getByRole('button', { name: '继续：角色策略' }).click();
  await page.getByRole('button', { name: '预览最终权限' }).click();
  await page.getByRole('button', { name: '确认并配置字段' }).click();
  await page.getByRole('button', { name: '以用户视角模拟' }).click();
  await page.getByRole('button', { name: '结束模拟并验证' }).click();

  await expect(page.getByRole('dialog', { name: '角色策略已验证并保存' })).toBeVisible();
  expect(roleSaves).toBe(1);
  expect(tenantSaves).toBe(1);
  await page.getByRole('button', { name: '完成' }).click();
  await page.getByRole('button', { name: '查看租户 上海智立科技有限公司' }).click();
  await page.getByRole('button', { name: '配置授权与策略' }).click();
  await page.getByRole('button', { name: '继续：角色策略' }).click();
  await expect(page.getByRole('checkbox', { name: '运单管理编辑' })).not.toBeChecked();
});

test('代入丢响应复用同意图 key，明确 422 后跨租户使用新 key', async ({ page }) => {
  const starts: Array<{ key?: string; tenantId?: string }> = [];
  let attempt = 0;
  await page.route('**/api/v1/platform/impersonations**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/impersonations') && request.method() === 'POST') {
      const body = request.postDataJSON() as { tenantId?: string; reason?: string };
      starts.push({ key: request.headers()['idempotency-key'], tenantId: body.tenantId });
      attempt += 1;
      if (attempt === 1) {
        await route.abort('failed');
        return;
      }
      if (attempt === 2) {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'INVALID_REASON', message: 'reason rejected' }),
        });
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: '01JIMPERSONATE000000000002',
            tenantId: body.tenantId,
            actorId: '01JADMIN000000000000000001',
            reason: body.reason,
            expiresAt: '2099-12-31T23:59:59.000Z',
          },
          meta: { requestId: 'req-impersonation', asOf: '2026-07-23T00:00:00.000Z' },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          sessionId: '01JIMPERSONATE000000000002',
          status: 'ACTIVE',
          permissionsVersion: 19,
          eventId: 'ACL-19',
        },
      }),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '代入 上海智立科技有限公司' }).click();
  const submit = page.getByRole('button', { name: '以管理员身份进入' });
  await submit.click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(submit).toBeEnabled();
  await page.getByRole('button', { name: '取消' }).click();
  await page.getByRole('button', { name: '代入 深圳海运通物流有限公司' }).click();
  await page.getByRole('button', { name: '以管理员身份进入' }).click();

  await expect(page.locator('.platform-session')).toContainText('深圳海运通物流有限公司');
  expect(starts).toHaveLength(3);
  expect(starts[1]?.key).toBe(starts[0]?.key);
  expect(starts[2]?.key).not.toBe(starts[1]?.key);
  expect(starts[2]?.tenantId).toBe('01JTENANT0000000000000002');
});
