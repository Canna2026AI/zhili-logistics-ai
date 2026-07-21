// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './app';

afterEach(cleanup);

describe('平台控制台', () => {
  it('创建租户后立即进入隔离的租户列表', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByRole('button', { name: '新建租户' })[0]);
    await user.type(screen.getByLabelText('租户名称'), '厦门远海物流有限公司');
    await user.type(screen.getByLabelText('租户 SLUG'), 'yuanhai-xm');
    await user.click(screen.getByRole('button', { name: '确认创建租户' }));
    expect(await screen.findByRole('status')).toHaveTextContent('租户已创建');
    expect(screen.getByRole('table', { name: '租户列表' })).toHaveTextContent(
      '厦门远海物流有限公司'
    );
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
    expect(await screen.findByRole('status')).toHaveTextContent('剩余 60 分钟');
    await user.click(screen.getByRole('button', { name: '代入与审计' }));
    expect(screen.getByRole('table', { name: '审计记录' })).toHaveTextContent(
      '协助排查订单同步问题'
    );
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
    }
  });
});
