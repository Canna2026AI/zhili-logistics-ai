// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { platformPort } from './api';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  cleanup();
});

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
    expect(await screen.findByRole('status')).toHaveTextContent('ENT-0002');
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
    await user.selectOptions(screen.getByLabelText('配置租户'), '2');
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
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '套餐与模块' }));
    await user.click(screen.getByRole('switch', { name: '客户门户' }));
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
});
