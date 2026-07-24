// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { PlatformApiError, platformPort } from './api';

beforeEach(() => {
  window.history.replaceState({}, '', '/?mock=1');
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  cleanup();
  vi.unstubAllGlobals();
});

async function reachPermissionSimulation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '查看租户 上海智立科技有限公司' }));
  await user.click(screen.getByRole('button', { name: '配置授权与策略' }));
  await user.click(screen.getByRole('button', { name: '继续：角色策略' }));
  await user.click(screen.getByRole('button', { name: '预览最终权限' }));
  await user.click(screen.getByRole('button', { name: '确认并配置字段' }));
  await user.click(screen.getByRole('button', { name: '以用户视角模拟' }));
  expect(await screen.findByRole('dialog', { name: '用户视角模拟' })).toBeVisible();
}

async function saveDefaultPolicy(user: ReturnType<typeof userEvent.setup>) {
  await reachPermissionSimulation(user);
  await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));
  expect(await screen.findByRole('dialog', { name: '角色策略已验证并保存' })).toBeVisible();
}

describe('平台控制台', () => {
  it('创建租户后立即进入隔离的租户列表', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: '新建租户' })[0]);
    await user.type(screen.getByLabelText('租户名称'), '厦门远海物流有限公司');
    await user.type(screen.getByLabelText('租户 SLUG'), 'yuanhai-xm');
    await user.selectOptions(screen.getByLabelText('默认套餐'), '企业版');
    await user.click(screen.getByRole('button', { name: '确认创建租户' }));
    expect(await screen.findByRole('status')).toHaveTextContent('租户已创建');
    expect(screen.getByRole('table', { name: '租户列表' })).toHaveTextContent(
      '厦门远海物流有限公司'
    );
    expect(screen.getByRole('table', { name: '租户列表' })).toHaveTextContent('企业版');
  });

  it('租户详情包含套餐、模块、配额和到期信息', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '查看租户 上海智立科技有限公司' }));
    const detail = screen.getByRole('dialog', { name: '租户详情' });
    expect(detail).toHaveTextContent('企业版');
    expect(detail).toHaveTextContent('320,000 / 500,000');
    expect(detail).toHaveTextContent('2026-08-31');
    expect(detail).toHaveTextContent('尾程派送与 POD');
  });

  it('代入必须填写原因并生成限时身份横幅和审计记录', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '代入 上海智立科技有限公司' }));
    expect(screen.getByRole('dialog', { name: '代入租户' })).toBeVisible();
    const reason = screen.getByLabelText('代入原因');
    await user.clear(reason);
    expect(screen.getByRole('button', { name: '以管理员身份进入' })).toBeDisabled();
    await user.type(reason, '协助排查订单同步问题');
    await user.click(screen.getByRole('button', { name: '以管理员身份进入' }));
    expect(await screen.findByRole('status')).toHaveTextContent('张伟（系统管理员）');
    expect(screen.getByRole('status')).toHaveTextContent('协助排查订单同步问题');
    expect(screen.getByRole('status')).toHaveTextContent('剩余 60:00');
    expect(screen.getByRole('button', { name: '套餐与模块' })).toBeDisabled();
    expect(screen.getByRole('region', { name: '代入租户上下文' })).toHaveTextContent(
      '平台套餐、模块、配额、公告与租户生命周期写操作已隔离'
    );
    expect(screen.queryByRole('button', { name: '新建租户' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '代入与审计' }));
    expect(screen.getByRole('table', { name: '审计记录' })).toHaveTextContent(
      '协助排查订单同步问题'
    );
  });

  it('代入会真实倒计时并在到期后安全返回平台上下文', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<App />);
    await user.click(screen.getByRole('button', { name: '代入 上海智立科技有限公司' }));
    await user.click(screen.getByRole('button', { name: '以管理员身份进入' }));
    expect(await screen.findByRole('status')).toHaveTextContent('剩余 60:00');
    await act(() => vi.advanceTimersByTimeAsync(60 * 60 * 1000));
    expect(await screen.findByRole('status')).toHaveTextContent('代入会话已过期');
    expect(screen.getByRole('button', { name: '套餐与模块' })).toBeEnabled();
    vi.useRealTimers();
  });

  it('租户可停用恢复，套餐配额和到期可保存新版本', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '查看租户 上海智立科技有限公司' }));
    await user.click(screen.getByRole('button', { name: '停用租户' }));
    expect(await screen.findByRole('status')).toHaveTextContent('租户已停用');
    await user.click(screen.getByRole('button', { name: '恢复租户' }));
    expect(await screen.findByRole('status')).toHaveTextContent('租户已恢复');
    await user.click(screen.getByRole('button', { name: '配额与用量' }));
    await user.clear(screen.getByLabelText('运单配额上限'));
    await user.type(screen.getByLabelText('运单配额上限'), '600000');
    await user.selectOptions(screen.getByLabelText('租户套餐'), '专业版');
    await user.clear(screen.getByLabelText('租户到期日'));
    await user.type(screen.getByLabelText('租户到期日'), '2027-08-31');
    await user.click(screen.getByRole('button', { name: '保存租户配置' }));
    expect(await screen.findByRole('status')).toHaveTextContent('ENT-0004');
    expect(screen.getAllByText(/320,000 \/ 600,000/)[0]).toBeVisible();
    await user.click(screen.getByRole('button', { name: '租户管理' }));
    await user.click(screen.getByRole('button', { name: '查看租户 上海智立科技有限公司' }));
    const updated = screen.getByRole('dialog', { name: '租户详情' });
    expect(updated).toHaveTextContent('专业版');
    expect(updated).toHaveTextContent('320,000 / 600,000');
    expect(updated).toHaveTextContent('2027-08-31');
  });

  it('配置页修改当前选中的租户而不是固定的默认租户', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '配额与用量' }));
    await user.selectOptions(screen.getByLabelText('配置租户'), '01JTENANT0000000000000002');
    expect(screen.getByRole('heading', { name: '深圳海运通物流有限公司' })).toBeVisible();
    await user.selectOptions(screen.getByLabelText('租户套餐'), '企业版');
    await user.clear(screen.getByLabelText('运单配额上限'));
    await user.type(screen.getByLabelText('运单配额上限'), '260000');
    await user.clear(screen.getByLabelText('租户到期日'));
    await user.type(screen.getByLabelText('租户到期日'), '2027-02-01');
    await user.click(screen.getByRole('button', { name: '保存租户配置' }));
    await user.click(screen.getByRole('button', { name: '租户管理' }));
    await user.click(screen.getByRole('button', { name: '查看租户 深圳海运通物流有限公司' }));
    const detail = screen.getByRole('dialog', { name: '租户详情' });
    expect(detail).toHaveTextContent('企业版');
    expect(detail).toHaveTextContent('120,000 / 260,000');
    expect(detail).toHaveTextContent('2027-02-01');
  });

  it('可管理套餐模块、公告和运行中心', async () => {
    const setModuleEntitlement = vi.spyOn(platformPort, 'setModuleEntitlement');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '套餐与模块' }));
    await user.click(screen.getByRole('switch', { name: '客户门户' }));
    expect(setModuleEntitlement).toHaveBeenCalledWith(
      '01JTENANT0000000000000001',
      1,
      '客户门户',
      false
    );
    expect(screen.getByRole('status')).toHaveTextContent('模块授权已保存');
    await user.click(screen.getByRole('button', { name: '平台公告' }));
    await user.type(screen.getByLabelText('公告标题'), '系统维护窗口');
    await user.click(screen.getByRole('button', { name: '发布公告' }));
    expect(screen.getByText('系统维护窗口')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '运行中心' }));
    expect(screen.getByRole('heading', { name: '运行中心' })).toBeVisible();
    expect(screen.getByText('支付回调')).toBeVisible();
    expect(screen.getByText('部分失败：2 / 384')).toBeVisible();
  });

  it('运行状态覆盖加载、失败、无权限、过期和部分成功', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '运行中心' }));

    for (const [value, expected] of [
      ['loading', '正在加载运行数据'],
      ['failed', '运行数据请求失败'],
      ['forbidden', '缺少 platform.operations.read 权限'],
      ['stale', '运行快照已过期'],
      ['partial', '部分作业执行失败'],
    ]) {
      await user.selectOptions(screen.getByLabelText('运行状态'), value);
      expect(screen.getByRole(value === 'failed' ? 'alert' : 'status')).toHaveTextContent(expected);
      if (value === 'failed' || value === 'forbidden') {
        expect(screen.queryByRole('table', { name: '运行作业' })).not.toBeInTheDocument();
      }
    }
  });

  it('运行中心比较过期版本且失败项重试拒绝时不丢失失败状态', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '运行中心' }));
    await user.selectOptions(screen.getByLabelText('运行状态'), 'stale');
    await user.click(screen.getByRole('button', { name: '刷新运行快照' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      '版本差异：snapshotAt 10:18 → 10:21'
    );

    vi.spyOn(platformPort, 'retryRuntimeJobs').mockRejectedValueOnce(
      new Error('失败项重试被拒绝；job-pay-382、job-pay-384 仍保持失败。')
    );
    await user.selectOptions(screen.getByLabelText('运行状态'), 'partial');
    expect(screen.getByRole('status')).toHaveTextContent('失败项 job-pay-382、job-pay-384');
    await user.click(screen.getByRole('button', { name: '仅重试 2 个失败项' }));
    expect(await screen.findByRole('status')).toHaveTextContent('失败项重试被拒绝');
    expect(screen.getByRole('button', { name: '仅重试 2 个失败项' })).toBeVisible();
  });

  it('失败项重试成功后按 ID 合并并把统计与回调行更新为健康', async () => {
    const retry = vi.spyOn(platformPort, 'retryRuntimeJobs');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '运行中心' }));
    await user.selectOptions(screen.getByLabelText('运行状态'), 'partial');
    await user.click(screen.getByRole('button', { name: '仅重试 2 个失败项' }));

    expect(retry).toHaveBeenCalledWith(['job-pay-382', 'job-pay-384']);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'job-pay-382、job-pay-384 已合并成功'
    );
    expect(screen.getByText('失败作业').parentElement).toHaveTextContent('0 / 384');
    const callbackRow = screen.getByText('支付回调').closest('tr');
    expect(callbackRow).not.toBeNull();
    expect(callbackRow).toHaveTextContent('384');
    expect(callbackRow).toHaveTextContent('0');
    expect(callbackRow).toHaveTextContent('健康');
    expect(callbackRow).not.toHaveTextContent('部分失败');
  });

  it('租户创建失败时保留对话框输入且不写列表', async () => {
    vi.spyOn(platformPort, 'createTenant').mockRejectedValueOnce(new Error('租户服务失败'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: '新建租户' })[0]);
    await user.type(screen.getByLabelText('租户名称'), '失败租户');
    await user.type(screen.getByLabelText('租户 SLUG'), 'failed-tenant');
    await user.click(screen.getByRole('button', { name: '确认创建租户' }));
    expect(await screen.findByRole('status')).toHaveTextContent('租户服务失败');
    expect(screen.getByRole('dialog', { name: '新建租户' })).toBeVisible();
    expect(screen.getByLabelText('租户名称')).toHaveValue('失败租户');
    expect(screen.getByRole('table', { name: '租户列表' })).not.toHaveTextContent('失败租户');
  });

  it('紧凑导航在六个页面间切换并在关闭后把焦点还给触发按钮', async () => {
    const user = userEvent.setup();
    render(<App />);
    const trigger = screen.getByRole('button', { name: '打开平台导航' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    const drawer = screen.getByRole('dialog', { name: '平台导航菜单' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(drawer).getAllByRole('button')).toHaveLength(7);
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(drawer).getByRole('button', { name: '运行中心' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '平台导航菜单' })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();

    for (const destination of [
      '租户管理',
      '套餐与模块',
      '配额与用量',
      '平台公告',
      '代入与审计',
      '运行中心',
    ]) {
      await user.click(trigger);
      await user.click(
        within(screen.getByRole('dialog', { name: '平台导航菜单' })).getByRole('button', {
          name: destination,
        })
      );
      expect(screen.getByRole('heading', { name: destination })).toBeVisible();
      expect(screen.queryByRole('dialog', { name: '平台导航菜单' })).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    }
  });

  it('全局搜索支持键盘选择规范租户、真实页面跳转与零结果', async () => {
    const user = userEvent.setup();
    render(<App />);
    const searchbox = screen.getByRole('combobox', { name: '平台全局搜索' });

    await user.type(searchbox, '上海智立');
    expect(screen.getByRole('listbox', { name: '平台全局搜索结果' })).toBeVisible();
    expect(
      screen.getByRole('option', { name: /上海智立科技有限公司.*租户.*zhili-sh/ })
    ).toBeVisible();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: '租户详情' })).toHaveTextContent('zhili-sh');
    await user.keyboard('{Escape}');

    await user.clear(searchbox);
    await user.type(searchbox, '支付回调');
    await user.click(screen.getByRole('option', { name: /支付回调.*运行作业.*运行中心/ }));
    expect(screen.getByRole('heading', { name: '运行中心' })).toBeVisible();
    expect(screen.getByRole('table', { name: '运行作业' })).toHaveTextContent('支付回调');

    await user.clear(searchbox);
    await user.type(searchbox, '绝对不存在的租户或作业');
    expect(screen.getByRole('status')).toHaveTextContent(
      '未找到与“绝对不存在的租户或作业”匹配的结果'
    );
    expect(screen.queryByRole('listbox', { name: '平台全局搜索结果' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText(/未找到与“绝对不存在/)).not.toBeInTheDocument();
  });

  it('搜索结果使用虚拟焦点且 Tab 和 Escape 不会把焦点丢到 body', async () => {
    const user = userEvent.setup();
    render(<App />);
    const searchbox = screen.getByRole('combobox', { name: '平台全局搜索' });

    await user.type(searchbox, '上海智立');
    const tenantOption = screen.getByRole('option', {
      name: /上海智立科技有限公司.*租户.*zhili-sh/,
    });
    expect(tenantOption).toHaveAttribute('tabindex', '-1');

    await user.tab();
    expect(screen.getAllByRole('button', { name: '新建租户' })[0]).toHaveFocus();
    expect(document.body).not.toHaveFocus();

    await user.tab({ shift: true });
    expect(searchbox).toHaveFocus();
    expect(screen.getByRole('listbox', { name: '平台全局搜索结果' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(searchbox).toHaveFocus();
    expect(screen.queryByRole('listbox', { name: '平台全局搜索结果' })).not.toBeInTheDocument();

    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('dialog', { name: '租户详情' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(searchbox).toHaveFocus();
  });

  it('新发布公告立即进入与公告页相同的全局搜索索引', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '平台公告' }));
    await user.type(screen.getByLabelText('公告标题'), '紧急港区升级通知');
    await user.click(screen.getByRole('button', { name: '发布公告' }));
    expect(await screen.findByText('紧急港区升级通知')).toBeVisible();

    const searchbox = screen.getByRole('combobox', { name: '平台全局搜索' });
    await user.type(searchbox, '紧急港区升级通知');
    expect(screen.getByRole('option', { name: /紧急港区升级通知.*公告.*平台公告/ })).toBeVisible();
  });

  it('退出代入后全局搜索仍索引审计表显示的自定义原因', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '代入 上海智立科技有限公司' }));
    const reason = screen.getByLabelText('代入原因');
    await user.clear(reason);
    await user.type(reason, '核查自定义审计原因XYZ');
    await user.click(screen.getByRole('button', { name: '以管理员身份进入' }));
    expect(await screen.findByRole('status')).toHaveTextContent('核查自定义审计原因XYZ');
    await user.click(screen.getByRole('button', { name: '立即退出' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '立即退出' })).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: '代入与审计' }));
    expect(screen.getByRole('table', { name: '审计记录' })).toHaveTextContent(
      '核查自定义审计原因XYZ'
    );

    const searchbox = screen.getByRole('combobox', { name: '平台全局搜索' });
    await user.type(searchbox, '核查自定义审计原因XYZ');
    expect(
      screen.getByRole('option', { name: /以管理员身份代入.*审计记录.*核查自定义审计原因XYZ/ })
    ).toBeVisible();
  });

  it('代入态只暴露允许访问的全局搜索结果', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '代入 上海智立科技有限公司' }));
    await user.click(screen.getByRole('button', { name: '以管理员身份进入' }));

    const searchbox = screen.getByRole('combobox', { name: '平台全局搜索' });
    await user.type(searchbox, '上海智立');
    expect(
      screen.queryByRole('option', { name: /上海智立科技有限公司.*租户/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /以管理员身份代入.*审计记录/ })).toBeVisible();
    await user.clear(searchbox);
    await user.type(searchbox, '运行中心');
    expect(screen.getByRole('option', { name: /运行中心.*页面/ })).toBeVisible();
  });

  it('按 F08 主链路完成租户授权、角色、Diff、字段策略和用户视角验证', async () => {
    window.history.replaceState({}, '', '/?mock=1');
    const saveEntitlements = vi.spyOn(platformPort, 'saveEntitlements');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '查看租户 上海智立科技有限公司' }));
    await user.click(screen.getByRole('button', { name: '配置授权与策略' }));
    expect(screen.getByRole('dialog', { name: '租户详情 · 授权配置' })).toHaveTextContent(
      '320,000 / 500,000'
    );
    await user.click(screen.getByRole('button', { name: '继续：角色策略' }));
    expect(screen.getByRole('dialog', { name: '角色策略编辑' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '预览最终权限' }));
    expect(screen.getByRole('dialog', { name: '最终权限 Diff' })).toHaveTextContent(
      '新增 3 项 · 移除 1 项'
    );
    await user.click(screen.getByRole('button', { name: '确认并配置字段' }));
    expect(screen.getByRole('dialog', { name: '字段策略' })).toHaveTextContent('客户手机号');
    await user.click(screen.getByRole('button', { name: '以用户视角模拟' }));
    expect(screen.getByRole('dialog', { name: '用户视角模拟' })).toHaveTextContent('138****6612');
    expect(screen.getByRole('dialog', { name: '用户视角模拟' })).toHaveTextContent('151****0821');
    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));
    expect(screen.getByRole('dialog', { name: '角色策略已验证并保存' })).toHaveTextContent(
      '版本 v19 已生效'
    );
    expect(saveEntitlements).toHaveBeenCalledWith(
      '01JTENANT0000000000000001',
      1,
      expect.objectContaining({ modules: expect.any(Array) }),
      expect.any(String)
    );
  });

  it('把用户修改的模块配额角色和字段策略原样提交给强类型端口', async () => {
    const saveEntitlements = vi.spyOn(platformPort, 'saveEntitlements');
    const updateRolePolicy = vi.spyOn(platformPort, 'updateRolePolicy');
    const previewEffectivePermissions = vi.spyOn(platformPort, 'previewEffectivePermissions');
    const previewFieldPolicy = vi.spyOn(platformPort, 'previewFieldPolicy');
    const startPermissionSimulation = vi.spyOn(platformPort, 'startPermissionSimulation');
    const verifyPermissionSimulation = vi.spyOn(platformPort, 'verifyPermissionSimulation');
    const endPermissionSimulation = vi.spyOn(platformPort, 'endPermissionSimulation');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '查看租户 上海智立科技有限公司' }));
    await user.click(screen.getByRole('button', { name: '配置授权与策略' }));
    await user.click(screen.getByRole('switch', { name: '授权 AI 自动化' }));
    await user.click(screen.getByRole('switch', { name: '授权 仓库扫描' }));
    await user.clear(screen.getByLabelText('授权运单配额'));
    await user.type(screen.getByLabelText('授权运单配额'), '640000');
    await user.click(screen.getByRole('button', { name: '继续：角色策略' }));
    await user.selectOptions(screen.getByLabelText('策略角色'), '01JROLE000000000000000002');
    await user.selectOptions(screen.getByLabelText('模拟用户'), '01JUSER000000000000000002');
    await user.click(screen.getByRole('checkbox', { name: '运单管理审批' }));
    await user.click(screen.getByRole('button', { name: '预览最终权限' }));
    await user.click(screen.getByRole('button', { name: '确认并配置字段' }));
    await user.selectOptions(screen.getByLabelText('客户手机号字段决策'), 'DENY');
    await user.click(screen.getByRole('button', { name: '以用户视角模拟' }));
    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));

    expect(saveEntitlements).toHaveBeenCalledWith(
      '01JTENANT0000000000000001',
      1,
      {
        modules: expect.arrayContaining([
          expect.objectContaining({ moduleCode: 'ai-automation', enabled: true }),
          expect.objectContaining({ moduleCode: 'warehouse-scan', enabled: false }),
          expect.objectContaining({ quotas: { monthlyWaybills: 640000 } }),
        ]),
      },
      expect.any(String)
    );
    expect(updateRolePolicy).toHaveBeenCalledWith(
      '01JROLE000000000000000002',
      7,
      {
        statements: expect.arrayContaining([
          expect.objectContaining({
            effect: 'ALLOW',
            resource: 'waybill',
            actions: ['read', 'approve'],
            dataScope: 'TENANT',
          }),
        ]),
        reason: '季度权限复核',
      },
      expect.any(String)
    );
    expect(previewEffectivePermissions).toHaveBeenCalledWith('01JUSER000000000000000002', {
      proposedRoleIds: ['01JROLE000000000000000002'],
      proposedStatements: expect.arrayContaining([
        expect.objectContaining({ resource: 'waybill', actions: ['read', 'approve'] }),
      ]),
    });
    expect(previewFieldPolicy).toHaveBeenCalledWith({
      subjectId: '01JUSER000000000000000002',
      proposedPolicies: expect.arrayContaining([
        {
          resource: 'waybill',
          field: 'customerPhone',
          decision: 'DENY',
          contexts: ['VIEW', 'EXPORT'],
        },
      ]),
    });
    expect(startPermissionSimulation).toHaveBeenCalledWith(
      {
        userId: '01JUSER000000000000000002',
        reason: '季度权限复核',
        durationMinutes: 15,
      },
      expect.any(String)
    );
    expect(verifyPermissionSimulation).toHaveBeenCalledWith(expect.any(String), {
      resource: 'waybill',
      action: 'read',
      field: 'customerPhone',
    });
    expect(endPermissionSimulation).toHaveBeenCalledWith(expect.any(String));
  });

  it('授权弹窗支持 Escape 关闭并把焦点恢复到发起租户', async () => {
    const user = userEvent.setup();
    render(<App />);
    const tenantButton = screen.getByRole('button', {
      name: '查看租户 上海智立科技有限公司',
    });
    await user.click(tenantButton);
    await user.click(screen.getByRole('button', { name: '配置授权与策略' }));
    expect(screen.getByRole('button', { name: '关闭授权配置' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '租户详情 · 授权配置' })).not.toBeInTheDocument();
    await waitFor(() => expect(tenantButton).toHaveFocus());
  });

  it('保存期间禁止 Escape 和退出，失败后保留完整草稿供重试', async () => {
    let rejectSave!: (error: Error) => void;
    const pending = new Promise<never>((_, reject) => {
      rejectSave = reject;
    });
    vi.spyOn(platformPort, 'updateRolePolicy').mockReturnValueOnce(pending);
    const saveEntitlements = vi.spyOn(platformPort, 'saveEntitlements');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '查看租户 上海智立科技有限公司' }));
    await user.click(screen.getByRole('button', { name: '配置授权与策略' }));
    await user.click(screen.getByRole('switch', { name: '授权 AI 自动化' }));
    await user.click(screen.getByRole('button', { name: '继续：角色策略' }));
    await user.click(screen.getByRole('checkbox', { name: '运单管理审批' }));
    await user.click(screen.getByRole('button', { name: '预览最终权限' }));
    await user.click(screen.getByRole('button', { name: '确认并配置字段' }));
    await user.selectOptions(screen.getByLabelText('客户手机号字段决策'), 'DENY');
    await user.click(screen.getByRole('button', { name: '以用户视角模拟' }));
    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));
    expect(screen.getByRole('button', { name: '退出模拟' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: '用户视角模拟' })).toBeVisible();
    rejectSave(new Error('409 STALE：角色版本已变化'));
    expect(await screen.findByRole('alert')).toHaveTextContent('409 STALE');
    expect(screen.getByRole('dialog', { name: '用户视角模拟' })).toBeVisible();
    expect(screen.getByRole('button', { name: '结束模拟并验证' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));
    expect(await screen.findByRole('dialog', { name: '角色策略已验证并保存' })).toBeVisible();
    expect(saveEntitlements).toHaveBeenCalledTimes(1);
  });

  it('恢复已过期代入会话时展示 expired 证据而不是静默丢弃', async () => {
    localStorage.setItem(
      'zhili.platform.impersonation',
      JSON.stringify({
        id: '01JIMPERSONATE000000000001',
        permissionsVersion: 19,
        tenant: {
          ...{ id: '01JTENANT0000000000000001', name: '上海智立科技有限公司' },
          slug: 'zhili-sh',
        },
        reason: '恢复测试',
        expiresAt: Date.now() - 1000,
      })
    );
    render(<App />);
    expect(await screen.findByRole('region', { name: '代入已过期' })).toBeVisible();
  });

  it('恢复 active 会话时由 Port 权限版本检查判定 revoked', async () => {
    localStorage.setItem(
      'zhili.platform.impersonation',
      JSON.stringify({
        id: '01JIMPERSONATE000000000001',
        permissionsVersion: 19,
        tenant: { id: '01JTENANT0000000000000001', name: '上海智立科技有限公司', slug: 'zhili-sh' },
        reason: '撤权恢复测试',
        expiresAt: Date.now() + 60_000,
      })
    );
    const check = vi
      .spyOn(platformPort, 'checkImpersonation')
      .mockResolvedValue({ status: 'REVOKED', permissionsVersion: 20, eventId: 'ACL-SERVER-20' });
    render(<App />);
    expect(await screen.findByRole('region', { name: '会话已撤权' })).toHaveTextContent(
      '权限基线 v20'
    );
    expect(check).toHaveBeenCalledWith('01JIMPERSONATE000000000001', 19);
  });

  it('全局搜索索引全部四个系统运维页面', async () => {
    const user = userEvent.setup();
    render(<App />);
    const searchbox = screen.getByRole('combobox', { name: '平台全局搜索' });
    for (const page of ['系统健康', '任务与队列', '审计日志', '版本发布']) {
      await user.clear(searchbox);
      await user.type(searchbox, page);
      expect(
        screen.getByRole('option', { name: new RegExp(`${page}.*页面.*系统运维`) })
      ).toBeVisible();
    }
  });

  it('运维主按钮调用 app-local Port 并展示服务端回执与可重试错误', async () => {
    const execute = vi
      .spyOn(platformPort, 'executeOperation')
      .mockResolvedValueOnce({
        operationId: 'OPS-HEALTH-21',
        status: 'SUCCEEDED',
        message: '24 个服务检查完成',
      })
      .mockRejectedValueOnce(new Error('503 健康检查暂不可用'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '系统健康' }));
    await user.click(screen.getByRole('button', { name: '运行健康检查' }));
    expect(execute).toHaveBeenCalledWith('系统健康');
    expect(await screen.findByRole('status')).toHaveTextContent('OPS-HEALTH-21');
    await user.click(screen.getByRole('button', { name: '运行健康检查' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('503 健康检查暂不可用');
    expect(screen.getByRole('button', { name: '运行健康检查' })).toBeEnabled();
  });

  it('权限 Diff 进入 STALE 后阻断确认并可重新加载恢复', async () => {
    window.history.replaceState({}, '', '/?mock=1');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '查看租户 上海智立科技有限公司' }));
    await user.click(screen.getByRole('button', { name: '配置授权与策略' }));
    await user.click(screen.getByRole('button', { name: '继续：角色策略' }));
    await user.click(screen.getByRole('button', { name: '预览最终权限' }));
    await user.click(screen.getByRole('button', { name: '模拟版本冲突' }));

    const stale = screen.getByRole('dialog', { name: '最终权限 Diff · STALE' });
    expect(stale).toHaveTextContent('权限基线已由其他管理员更新');
    expect(screen.queryByRole('button', { name: '确认并配置字段' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '重新加载并比较' }));
    expect(screen.getByRole('dialog', { name: '最终权限 Diff' })).toHaveTextContent(
      '权限基线已同步'
    );
    expect(screen.getByRole('button', { name: '确认并配置字段' })).toBeEnabled();
  });

  it('撤销最后管理员会进入锁定保护且可以返回修正', async () => {
    window.history.replaceState({}, '', '/?mock=1');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '查看租户 上海智立科技有限公司' }));
    await user.click(screen.getByRole('button', { name: '配置授权与策略' }));
    await user.click(screen.getByRole('button', { name: '继续：角色策略' }));
    await user.click(screen.getByRole('checkbox', { name: '撤销最后一个平台管理员' }));
    await user.click(screen.getByRole('button', { name: '预览最终权限' }));

    const lockout = screen.getByRole('dialog', { name: '管理员账号锁定保护' });
    expect(lockout).toHaveTextContent('至少保留 1 名平台管理员');
    await user.click(screen.getByRole('button', { name: '返回修正策略' }));
    expect(screen.getByRole('dialog', { name: '角色策略编辑' })).toBeVisible();
  });

  it('版本发布的 FORBIDDEN 与代入撤权结果都是可恢复的持久状态', async () => {
    window.history.replaceState({}, '', '/?mock=1');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '版本发布' }));
    await user.click(screen.getByRole('button', { name: '创建发布计划' }));
    expect(screen.getByRole('region', { name: '禁止访问' })).toHaveTextContent(
      'platform.release.publish'
    );
    await user.click(screen.getByRole('button', { name: '返回版本列表' }));
    expect(screen.getByRole('heading', { name: '版本发布' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '租户管理' }));
    await user.click(screen.getByRole('button', { name: '代入 上海智立科技有限公司' }));
    await user.click(screen.getByRole('button', { name: '以管理员身份进入' }));
    await user.click(screen.getByRole('button', { name: '模拟权限撤回' }));
    expect(screen.getByRole('region', { name: '会话已撤权' })).toHaveTextContent('权限基线 v20');
    await user.click(screen.getByRole('button', { name: '重新登录' }));
    expect(screen.getByRole('heading', { name: '租户管理' })).toBeVisible();
    expect(screen.queryByRole('region', { name: '会话已撤权' })).not.toBeInTheDocument();
  });

  it('切换角色会加载该角色自己的权威版本和 statements', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '查看租户 上海智立科技有限公司' }));
    await user.click(screen.getByRole('button', { name: '配置授权与策略' }));
    await user.click(screen.getByRole('button', { name: '继续：角色策略' }));
    expect(screen.getByRole('checkbox', { name: '运单管理编辑' })).toBeChecked();

    await user.selectOptions(screen.getByLabelText('策略角色'), '01JROLE000000000000000002');

    expect(screen.getByRole('dialog', { name: '角色策略编辑' })).toHaveTextContent('财务管理员');
    expect(screen.getByRole('checkbox', { name: '运单管理编辑' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '应收应付审批' })).toBeChecked();
  });

  it('保存成功会回写角色版本，关闭重开后的第二次保存使用新基线', async () => {
    const updateRolePolicy = vi.spyOn(platformPort, 'updateRolePolicy');
    const user = userEvent.setup();
    render(<App />);

    await saveDefaultPolicy(user);
    await user.click(screen.getByRole('button', { name: '完成' }));
    await saveDefaultPolicy(user);

    expect(updateRolePolicy.mock.calls.map(([, version]) => version)).toEqual([18, 19]);
  });

  it('保存成功会缓存服务端规范化后的权威 statements 供第二次编辑', async () => {
    const authoritativeStatements = [
      { effect: 'ALLOW' as const, resource: 'waybill', actions: ['read'], dataScope: 'TENANT' },
    ];
    const updateRolePolicy = vi.spyOn(platformPort, 'updateRolePolicy').mockResolvedValueOnce({
      roleId: '01JROLE000000000000000001',
      statements: authoritativeStatements,
      version: 19,
    });
    const user = userEvent.setup();
    render(<App />);

    await saveDefaultPolicy(user);
    await user.click(screen.getByRole('button', { name: '完成' }));
    await user.click(screen.getByRole('button', { name: '查看租户 上海智立科技有限公司' }));
    await user.click(screen.getByRole('button', { name: '配置授权与策略' }));
    await user.click(screen.getByRole('button', { name: '继续：角色策略' }));

    expect(screen.getByRole('checkbox', { name: '运单管理编辑' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: '预览最终权限' }));
    await user.click(screen.getByRole('button', { name: '确认并配置字段' }));
    await user.click(screen.getByRole('button', { name: '以用户视角模拟' }));
    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));

    expect(updateRolePolicy.mock.calls[1]?.[2]).toMatchObject({
      statements: authoritativeStatements,
    });
  });

  it('退出模拟必定结束服务端 simulation，再关闭工作流', async () => {
    const endPermissionSimulation = vi.spyOn(platformPort, 'endPermissionSimulation');
    const user = userEvent.setup();
    render(<App />);
    await reachPermissionSimulation(user);

    await user.click(screen.getByRole('button', { name: '退出模拟' }));

    await waitFor(() => expect(endPermissionSimulation).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: '用户视角模拟' })).not.toBeInTheDocument();
  });

  it.each([404, 410])('策略已保存后 simulation DELETE %s 视为幂等清理成功', async (status) => {
    const updateRolePolicy = vi.spyOn(platformPort, 'updateRolePolicy');
    const saveEntitlements = vi.spyOn(platformPort, 'saveEntitlements');
    vi.spyOn(platformPort, 'endPermissionSimulation').mockRejectedValueOnce(
      new PlatformApiError(
        status,
        status === 410 ? 'SIMULATION_EXPIRED' : 'SIMULATION_NOT_FOUND',
        'simulation already gone'
      )
    );
    const user = userEvent.setup();
    render(<App />);
    await reachPermissionSimulation(user);

    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));

    expect(await screen.findByRole('dialog', { name: '角色策略已验证并保存' })).toBeVisible();
    expect(updateRolePolicy).toHaveBeenCalledTimes(1);
    expect(saveEntitlements).toHaveBeenCalledTimes(1);
  });

  it('角色保存失败不会结束 simulation，原会话可直接重试', async () => {
    const updateRolePolicy = vi
      .spyOn(platformPort, 'updateRolePolicy')
      .mockRejectedValueOnce(new Error('role save unavailable'));
    const verify = vi.spyOn(platformPort, 'verifyPermissionSimulation');
    const endPermissionSimulation = vi.spyOn(platformPort, 'endPermissionSimulation');
    const user = userEvent.setup();
    render(<App />);
    await reachPermissionSimulation(user);

    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('role save unavailable');
    expect(endPermissionSimulation).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));
    expect(await screen.findByRole('dialog', { name: '角色策略已验证并保存' })).toBeVisible();
    expect(verify).toHaveBeenCalledTimes(2);
    expect(endPermissionSimulation).toHaveBeenCalledTimes(1);
    expect(updateRolePolicy.mock.calls[1]?.[3]).toBe(updateRolePolicy.mock.calls[0]?.[3]);
  });

  it('412 stale 会结束旧 simulation，重载权威版本后用新 If-Match 保存', async () => {
    const updateRolePolicy = vi
      .spyOn(platformPort, 'updateRolePolicy')
      .mockRejectedValueOnce(new PlatformApiError(412, 'ETAG_MISMATCH', 'role baseline changed'));
    const reload = vi.spyOn(platformPort, 'reloadAccessPolicyBaseline');
    const endPermissionSimulation = vi.spyOn(platformPort, 'endPermissionSimulation');
    const user = userEvent.setup();
    render(<App />);
    await reachPermissionSimulation(user);

    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));
    expect(await screen.findByRole('dialog', { name: '最终权限 Diff · STALE' })).toBeVisible();
    expect(endPermissionSimulation).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '重新加载并比较' }));
    expect(await screen.findByRole('dialog', { name: '最终权限 Diff' })).toHaveTextContent(
      '服务端基线 v19'
    );
    expect(reload).toHaveBeenCalledWith(
      '01JTENANT0000000000000001',
      1,
      '01JROLE000000000000000001',
      18,
      '01JUSER000000000000000001'
    );
    await user.click(screen.getByRole('button', { name: '确认并配置字段' }));
    await user.click(screen.getByRole('button', { name: '以用户视角模拟' }));
    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));
    expect(await screen.findByRole('dialog', { name: '角色策略已验证并保存' })).toBeVisible();
    expect(updateRolePolicy.mock.calls.map(([, version]) => version)).toEqual([18, 19]);
  });

  it('simulation 410 会退出失效会话并回到字段策略重新创建', async () => {
    vi.spyOn(platformPort, 'verifyPermissionSimulation').mockRejectedValueOnce(
      new PlatformApiError(410, 'SIMULATION_EXPIRED', 'simulation expired')
    );
    const user = userEvent.setup();
    render(<App />);
    await reachPermissionSimulation(user);

    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));

    expect(await screen.findByRole('dialog', { name: '字段策略' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('模拟会话已过期，请重新创建');
    expect(screen.queryByRole('dialog', { name: '用户视角模拟' })).not.toBeInTheDocument();
  });

  it('非 simulation 语义的 410 不会被误报为会话过期', async () => {
    vi.spyOn(platformPort, 'verifyPermissionSimulation').mockRejectedValueOnce(
      new PlatformApiError(410, 'ROLE_GONE', 'role no longer exists')
    );
    const user = userEvent.setup();
    render(<App />);
    await reachPermissionSimulation(user);

    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('role no longer exists');
    expect(screen.getByRole('dialog', { name: '用户视角模拟' })).toBeVisible();
  });

  it('只有明确的锁定保护 code 才把 422 映射为管理员锁定', async () => {
    vi.spyOn(platformPort, 'updateRolePolicy').mockRejectedValueOnce(
      new PlatformApiError(422, 'INVALID_STATEMENT', 'statement invalid')
    );
    const user = userEvent.setup();
    render(<App />);
    await reachPermissionSimulation(user);

    await user.click(screen.getByRole('button', { name: '结束模拟并验证' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('statement invalid');
    expect(screen.getByRole('dialog', { name: '用户视角模拟' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: '管理员账号锁定保护' })).not.toBeInTheDocument();
  });

  it('代入创建防双击并持续轮询到服务端撤权', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let resolveStart!: (value: Awaited<ReturnType<typeof platformPort.startImpersonation>>) => void;
    const start = vi.spyOn(platformPort, 'startImpersonation').mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      })
    );
    const check = vi
      .spyOn(platformPort, 'checkImpersonation')
      .mockResolvedValueOnce({ status: 'ACTIVE', permissionsVersion: 19, eventId: 'ACL-19' })
      .mockResolvedValueOnce({ status: 'ACTIVE', permissionsVersion: 20, eventId: 'ACL-20' })
      .mockResolvedValueOnce({ status: 'REVOKED', permissionsVersion: 21, eventId: 'ACL-21' });
    render(<App />);
    await user.click(screen.getByRole('button', { name: '代入 上海智立科技有限公司' }));
    const submit = screen.getByRole('button', { name: '以管理员身份进入' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(start).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    resolveStart({
      id: '01JIMPERSONATE000000000001',
      tenantId: '01JTENANT0000000000000001',
      actorId: '01JADMIN000000000000000001',
      reason: '协助排查订单同步问题',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await act(() => Promise.resolve());
    expect(await screen.findByRole('status')).toHaveTextContent('正在代入');

    await act(() => vi.advanceTimersByTimeAsync(2_500));

    expect(await screen.findByRole('region', { name: '会话已撤权' })).toHaveTextContent(
      '权限基线 v21'
    );
    expect(check.mock.calls.length).toBeGreaterThanOrEqual(3);
    const callsAfterRevocation = check.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(check).toHaveBeenCalledTimes(callsAfterRevocation);
    vi.useRealTimers();
  });

  it('代入未决同意图复用 key，明确 422 后取消切租户必须隔离新 key', async () => {
    const start = vi
      .spyOn(platformPort, 'startImpersonation')
      .mockRejectedValueOnce(
        new PlatformApiError(
          503,
          'IMPERSONATION_RETRYABLE_FAILURE',
          'upstream unavailable',
          undefined,
          true
        )
      )
      .mockRejectedValueOnce(new PlatformApiError(422, 'INVALID_REASON', 'reason rejected'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '代入 上海智立科技有限公司' }));
    const submit = screen.getByRole('button', { name: '以管理员身份进入' });

    await user.click(submit);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '取消' }));

    await user.click(screen.getByRole('button', { name: '代入 深圳海运通物流有限公司' }));
    await user.click(screen.getByRole('button', { name: '以管理员身份进入' }));
    await waitFor(() =>
      expect(document.querySelector('.platform-session')).toHaveTextContent(
        '正在代入：深圳海运通物流有限公司'
      )
    );

    expect(start.mock.calls[1]?.[2]).toBe(start.mock.calls[0]?.[2]);
    expect(start.mock.calls[2]?.[2]).not.toBe(start.mock.calls[1]?.[2]);
    expect(start.mock.calls[2]?.[0]).toBe('01JTENANT0000000000000002');
  });

  it('切换运维页面会清理上一页回执，搜索 option id 使用安全 slug', async () => {
    vi.spyOn(platformPort, 'executeOperation').mockResolvedValue({
      operationId: 'OPS-HEALTH-RESET',
      status: 'SUCCEEDED',
      message: 'done',
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '系统健康' }));
    await user.click(screen.getByRole('button', { name: '运行健康检查' }));
    expect(await screen.findByRole('status')).toHaveTextContent('OPS-HEALTH-RESET');
    await user.click(screen.getByRole('button', { name: '任务与队列' }));
    expect(screen.queryByText(/OPS-HEALTH-RESET/)).not.toBeInTheDocument();

    const searchbox = screen.getByRole('combobox', { name: '平台全局搜索' });
    await user.type(searchbox, '尾程派送');
    const option = screen.getByRole('option', { name: /尾程派送与 POD.*模块/ });
    expect(option.id).toMatch(/^platform-search-result-[a-z0-9-]+$/);
    await user.keyboard('{ArrowDown}');
    expect(searchbox).toHaveAttribute('aria-activedescendant', option.id);
  });
});
