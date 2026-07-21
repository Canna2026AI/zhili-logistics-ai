// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './app';

afterEach(cleanup);

describe('客户门户', () => {
  it('工作台提供工单、通知、付款凭证和在线客服入口', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '最近工单' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '通知中心' })).toBeVisible();
    expect(screen.getByRole('button', { name: '提交付款凭证' })).toBeVisible();
    expect(screen.getByRole('button', { name: '在线客服' })).toBeVisible();
  });

  it('完成查价并把报价带入新建预报', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '立即查价' }));
    expect(screen.getByRole('heading', { name: '多渠道查价' })).toBeVisible();
    await user.type(screen.getByLabelText('目的地邮编'), '90001');
    await user.click(screen.getByRole('button', { name: '获取报价' }));
    expect(await screen.findByText('CNY 5,320.00')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '选择此报价' }));
    expect(screen.getByRole('heading', { name: '新建运单' })).toBeVisible();
    expect(screen.getByText('已选择：智立海运专线 · CNY 5,320.00')).toBeVisible();
  });

  it('提交预报后可在本企业运单与轨迹中查询', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      within(screen.getByRole('navigation', { name: '客户门户导航' })).getByRole('button', {
        name: '新建运单',
      })
    );
    await user.type(screen.getByLabelText('收件人'), 'John Smith');
    await user.type(screen.getByLabelText('目的地'), 'US-LAX');
    await user.click(screen.getByRole('button', { name: '提交预报' }));
    expect(await screen.findByRole('status')).toHaveTextContent('预报已提交');
    await user.click(screen.getByRole('button', { name: '我的运单' }));
    expect(screen.getByRole('table', { name: '我的运单列表' })).toHaveTextContent('S2505120004');
    expect(screen.queryByText('华南跨境供应链')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看轨迹 S2505120004' }));
    expect(screen.getByRole('heading', { name: '运单轨迹' })).toBeVisible();
    expect(screen.getByText('已收货 · 悉尼仓库')).toBeVisible();
  });

  it('付款需要危险确认，成功后写入付款记录', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '账单与付款' }));
    expect(screen.getByText('预存款 CNY 128,560.00')).toBeVisible();
    expect(screen.getByText('未分配收款 CNY 1,200.00')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '支付 ST202605-0008' }));
    const dialog = screen.getByRole('dialog', { name: '确认支付' });
    expect(dialog).toHaveTextContent('CNY 2,320.00');
    await user.click(screen.getByRole('button', { name: '确认支付' }));
    expect(await screen.findByRole('status')).toHaveTextContent('支付订单已创建');
    expect(screen.getByRole('table', { name: '付款记录' })).toHaveTextContent('PAY-20260512-01');
  });

  it('创建工单可呈现部分成功并能申请 API', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '问题工单' }));
    await user.type(screen.getByLabelText('问题描述'), '运单轨迹已停滞超过 48 小时');
    await user.click(screen.getByRole('button', { name: '提交工单' }));
    expect(await screen.findByRole('status')).toHaveTextContent('工单已创建，通知发送失败');
    await user.click(screen.getByRole('button', { name: 'API' }));
    await user.click(screen.getByRole('checkbox', { name: '运单查询' }));
    await user.click(screen.getByRole('button', { name: '提交 API 申请' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('API 申请已提交'));
  });

  it('异常状态明确区分失败、无权限、过期与空数据', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText('演示状态'), 'failed');
    expect(screen.getByRole('alert')).toHaveTextContent('请求失败');
    await user.selectOptions(screen.getByLabelText('演示状态'), 'forbidden');
    expect(screen.getByRole('alert')).toHaveTextContent('缺少 ticket.read 权限');
    await user.selectOptions(screen.getByLabelText('演示状态'), 'stale');
    expect(screen.getByRole('alert')).toHaveTextContent('页面数据已过期');
    await user.selectOptions(screen.getByLabelText('演示状态'), 'empty');
    expect(screen.getByText(/当前筛选没有数据/)).toBeVisible();
  });
});
