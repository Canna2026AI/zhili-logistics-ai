// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app';
import * as customerApi from '../api';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/?mock=1');
  cleanup();
});

describe('Figma Customer 关键工作流', () => {
  it('F01 从新建运单连续完成地址、询价、报价和提交', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '快速新建运单' }));
    expect(screen.getByRole('heading', { name: '创建物流运单' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '选择地址' }));
    expect(screen.getByRole('heading', { name: '选择寄收件地址' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '查询报价' }));
    expect(await screen.findByRole('heading', { name: '选择承运商方案' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '提交运单' }));
    expect(await screen.findByRole('heading', { name: '运单创建成功' })).toBeVisible();
    expect(screen.getByText('S2505120006')).toBeVisible();
  });

  it('F03 补充异常资料后保留通知部分失败并可单独重试', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '问题件 17 较昨日 +3' }));
    expect(screen.getByRole('heading', { name: '待处理物流异常' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /EXC-24118/ }));
    await user.click(screen.getByRole('button', { name: '补充资料' }));
    await user.upload(
      screen.getByLabelText('入口照片'),
      new File(['gate'], 'gate-east.jpg', { type: 'image/jpeg' })
    );
    await user.click(screen.getByRole('button', { name: '提交资料' }));

    expect(await screen.findByRole('heading', { name: '资料已提交，通知部分失败' })).toBeVisible();
    expect(screen.getByText('PARTIAL · 3 / 4 个通知渠道成功')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '仅重试失败通知' }));
    expect(await screen.findByText('所有通知渠道已送达')).toBeVisible();
  });

  it('F05 从轨迹停滞创建工单并完成关闭', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '轨迹查询' }));
    expect(screen.getByRole('heading', { name: '轨迹长时间未更新' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '创建工单' }));
    await user.click(screen.getByRole('button', { name: '提交工单' }));
    expect(await screen.findByText('TKT-20260723-086')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '准备关闭' }));
    await user.click(screen.getByRole('button', { name: '确认关闭' }));
    expect(screen.getByRole('heading', { name: '轨迹问题已解决' })).toBeVisible();
  });

  it('F06 支付后先部分核销，再处理并发刷新并完成全额核销', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '账单与付款' }));
    await user.click(screen.getByRole('button', { name: '查看账单 INV-202607-018' }));
    await user.click(screen.getByRole('button', { name: '立即支付' }));
    await user.click(screen.getByRole('button', { name: '确认付款' }));
    expect(await screen.findByText('PARTIAL · 已核销 99.12%')).toBeVisible();

    await user.click(screen.getByRole('button', { name: '模拟并发更新' }));
    expect(screen.getByRole('heading', { name: '账单已被其他操作员更新' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '刷新数据' }));
    await user.click(screen.getByRole('button', { name: '分配剩余金额' }));
    expect(screen.getByRole('heading', { name: '账单已完成全额核销' })).toBeVisible();
  });

  it('ACCOUNT 在地址簿、API 权限和安全设置之间形成真实入口', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '地址簿' }));
    expect(screen.getByRole('heading', { name: '企业常用地址' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '进入 API 接入' }));
    expect(screen.getByRole('heading', { name: '申请物流 API 权限' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '提交申请' }));
    expect(screen.getByRole('heading', { name: '无法提交生产环境申请' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '进入安全设置' }));
    const security = screen.getByRole('region', { name: '企业账户安全' });
    expect(within(security).getByText('企业安全评分 92 / 100')).toBeVisible();
  });

  it('只有 mock=1 使用浏览器内 mock，普通地址继续走真实 API transport', () => {
    const resolver = (
      customerApi as unknown as {
        resolveCustomerTransport?: (search: string, mode?: string) => typeof fetch | undefined;
      }
    ).resolveCustomerTransport;

    expect(resolver).toBeTypeOf('function');
    expect(resolver?.('?mock=1', 'production')).toBe(customerApi.customerMockFetch);
    expect(resolver?.('', 'production')).toBeUndefined();
  });
});
