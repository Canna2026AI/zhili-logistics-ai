// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { customerPort } from './api';
import * as customerApiModule from './api';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  cleanup();
});

describe('客户门户', () => {
  it('报价关联 mock 的强 ETag 与权威订单版本一致', async () => {
    const customerMockFetch = (customerApiModule as unknown as { customerMockFetch?: typeof fetch })
      .customerMockFetch;
    expect(customerMockFetch).toBeTypeOf('function');
    if (!customerMockFetch) return;

    const response = await customerMockFetch(
      new Request('http://localhost/api/v1/orders/01JORDER000000000000000006:link-accepted-quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'If-Match': '"7"' },
        body: JSON.stringify({
          quoteId: '01JQUOTE000000000000000042',
          quoteOptionId: '01JQUOTEOPTION0000000000001',
          acceptedQuoteVersion: 2,
        }),
      })
    );
    const body = (await response.json()) as { data: { orderVersion: number } };
    expect(body.data.orderVersion).toBe(8);
    expect(response.headers.get('ETag')).toBe('"8"');
  });

  it('折叠菜单提供十个页面、隔离背景并在 Escape 后恢复触发点焦点', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const trigger = screen.getByRole('button', { name: '折叠菜单' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('.portal-content')).toHaveAttribute('inert');
    const drawer = screen.getByRole('dialog', { name: '客户门户菜单' });
    const drawerNavigation = within(drawer).getByRole('navigation', {
      name: '移动端完整导航',
    });
    expect(within(drawerNavigation).getAllByRole('button')).toHaveLength(10);
    for (const destination of [
      '工作台',
      '新建运单',
      '批量导入',
      '查价',
      '我的运单',
      '轨迹查询',
      '账单与付款',
      '问题工单',
      '地址簿',
      'API',
    ]) {
      expect(within(drawerNavigation).getByRole('button', { name: destination })).toBeVisible();
    }
    expect(within(drawer).getByRole('button', { name: '关闭' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '客户门户菜单' })).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    expect(container.querySelector('.portal-content')).not.toHaveAttribute('inert');
  });

  it('折叠菜单选择移动端专属页面后关闭并进入真实页面', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '折叠菜单' }));
    await user.click(
      within(screen.getByRole('navigation', { name: '移动端完整导航' })).getByRole('button', {
        name: 'API',
      })
    );

    expect(screen.queryByRole('dialog', { name: '客户门户菜单' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'API 申请' })).toBeVisible();
  });

  it('全局搜索点击 canonical 运单结果进入对应轨迹对象', async () => {
    const user = userEvent.setup();
    render(<App />);
    const search = screen.getByRole('combobox', { name: '全局搜索' });

    await user.type(search, 'S2505120004');
    expect(search).toHaveAttribute('aria-expanded', 'true');
    const results = screen.getByRole('listbox', { name: '全局搜索结果' });
    expect(within(results).getByRole('option', { name: /运单 S2505120004/ })).toHaveTextContent(
      'HBL2505120004'
    );
    await user.click(within(results).getByRole('option', { name: /运单 S2505120004/ }));

    expect(screen.getByRole('heading', { name: '运单轨迹' })).toBeVisible();
    expect(screen.getByText('S2505120004')).toBeVisible();
    expect(search).toHaveValue('');
    expect(search).toHaveAttribute('aria-expanded', 'false');
    expect(search).toHaveFocus();
  });

  it('全局搜索支持键盘选择结果并提交到第二个真实运单', async () => {
    const user = userEvent.setup();
    render(<App />);
    const search = screen.getByRole('combobox', { name: '全局搜索' });

    await user.type(search, 'S250512000');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(screen.getByRole('heading', { name: '运单轨迹' })).toBeVisible();
    expect(screen.getByText('S2505120002')).toBeVisible();
    expect(search).toHaveFocus();
  });

  it('全局搜索使用单一虚拟焦点并在 Tab 边界关闭结果', async () => {
    const user = userEvent.setup();
    render(<App />);
    const search = screen.getByRole('combobox', { name: '全局搜索' });

    await user.type(search, 'S250512000');
    const results = screen.getByRole('listbox', { name: '全局搜索结果' });
    const options = within(results).getAllByRole('option');
    expect(options).toHaveLength(5);
    for (const option of options) expect(option).toHaveAttribute('tabindex', '-1');
    expect(search).toHaveFocus();
    expect(search).toHaveAttribute('aria-activedescendant', options[0]?.id);

    await user.keyboard('{ArrowDown}');
    expect(search).toHaveFocus();
    expect(search).toHaveAttribute('aria-activedescendant', options[1]?.id);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(search).toHaveAttribute('aria-activedescendant', options[0]?.id);
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(search).toHaveAttribute('aria-activedescendant', options[4]?.id);
    await user.keyboard('{ArrowDown}');
    expect(search).toHaveAttribute('aria-activedescendant', options[4]?.id);

    await user.tab();
    expect(screen.queryByRole('listbox', { name: '全局搜索结果' })).not.toBeInTheDocument();
    expect(search).not.toHaveAttribute('aria-activedescendant');
    expect(screen.getByLabelText('演示状态')).toHaveFocus();
    expect(options.every((option) => option !== document.activeElement)).toBe(true);

    await user.click(search);
    expect(screen.getByRole('listbox', { name: '全局搜索结果' })).toBeVisible();
    await user.tab({ shift: true });
    expect(screen.queryByRole('listbox', { name: '全局搜索结果' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '折叠菜单' })).toHaveFocus();
  });

  it('全局搜索在外部点击时关闭且不把焦点留给结果选项', async () => {
    const user = userEvent.setup();
    render(<App />);
    const search = screen.getByRole('combobox', { name: '全局搜索' });

    await user.type(search, 'S2505120004');
    expect(screen.getByRole('listbox', { name: '全局搜索结果' })).toBeVisible();
    await user.click(screen.getByRole('heading', { name: /下午好/ }));

    expect(screen.queryByRole('listbox', { name: '全局搜索结果' })).not.toBeInTheDocument();
    expect(document.activeElement).not.toHaveAttribute('role', 'option');
  });

  it('全局搜索不返回当前无法恢复详情的报价对象', async () => {
    const user = userEvent.setup();
    render(<App />);
    const search = screen.getByRole('combobox', { name: '全局搜索' });

    await user.type(search, 'Q2505120042');
    expect(screen.getByRole('listbox', { name: '全局搜索结果' })).toBeEmptyDOMElement();
    expect(screen.getByRole('status', { name: '全局搜索状态' })).toHaveTextContent(
      '未找到匹配结果'
    );
    expect(screen.queryByRole('option', { name: /Q2505120042/ })).not.toBeInTheDocument();
  });

  it('全局搜索呈现零结果并允许 Escape 关闭而保留受控查询', async () => {
    const user = userEvent.setup();
    render(<App />);
    const search = screen.getByRole('combobox', { name: '全局搜索' });

    await user.type(search, 'NOT-A-CUSTOMER-RECORD');
    expect(screen.getByRole('status', { name: '全局搜索状态' })).toHaveTextContent(
      '未找到匹配结果'
    );
    expect(screen.getByRole('listbox', { name: '全局搜索结果' })).toBeEmptyDOMElement();
    expect(search).toHaveAttribute('aria-controls', 'customer-global-search-results');
    expect(search).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('status', { name: '全局搜索状态' })).not.toBeInTheDocument();
    expect(search).toHaveAttribute('aria-expanded', 'false');
    expect(search).toHaveValue('NOT-A-CUSTOMER-RECORD');
    expect(search).toHaveFocus();
  });

  it('无权限状态禁用完整导航和全局搜索而不暴露结果', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('演示状态'), 'forbidden');

    expect(screen.getByRole('button', { name: '折叠菜单' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '全局搜索' })).toBeDisabled();
    expect(screen.queryByRole('listbox', { name: '全局搜索结果' })).not.toBeInTheDocument();
  });

  it('工作台提供工单、通知、付款凭证和在线客服入口', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '最近工单' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '通知中心' })).toBeVisible();
    expect(screen.getByRole('button', { name: '提交付款凭证' })).toBeVisible();
    expect(screen.getByRole('button', { name: '在线客服' })).toBeVisible();
  });

  it('快捷入口编辑通过 API port 持久化布局', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '编辑' }));
    await user.click(screen.getByRole('button', { name: '隐藏 提交付款凭证' }));
    expect(await screen.findByRole('status')).toHaveTextContent('快捷入口布局已保存');
    expect(screen.queryByRole('button', { name: '隐藏 提交付款凭证' })).not.toBeInTheDocument();
    expect(
      localStorage.getItem('zhili.customer.tenant-xinyuan.customer-xinyuan.shortcuts')
    ).not.toContain('账单与付款');
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

  it('查价端口消费用户输入并回显本次请求快照', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '立即查价' }));
    await user.clear(screen.getByLabelText('始发地'));
    await user.type(screen.getByLabelText('始发地'), 'CN-XMN');
    await user.type(screen.getByLabelText('目的地邮编'), '33101');
    await user.clear(screen.getByLabelText('实重（kg）'));
    await user.type(screen.getByLabelText('实重（kg）'), '77.25');
    await user.clear(screen.getByLabelText('体积（m³）'));
    await user.type(screen.getByLabelText('体积（m³）'), '0.66');
    await user.click(screen.getByRole('button', { name: '获取报价' }));

    expect(await screen.findByRole('region', { name: '报价 Q2505120042' })).toHaveTextContent(
      'CN-XMN → 33101 · 77.25 kg · 0.66 m³'
    );
  });

  it('typed 报价返回可接受的 quote、option 与版本标识', async () => {
    const quote = await customerPort.quote({
      origin: 'CN-SZX',
      destinationPostalCode: '90001',
      weightKg: 123.5,
      volumeM3: 0.48,
    });

    expect(quote).toEqual(
      expect.objectContaining({
        id: '01JQUOTE000000000000000042',
        optionId: '01JQUOTEOPTION0000000000001',
        version: 1,
      })
    );
  });

  it('正常报价基于请求时钟跨日期生成八小时有效期', async () => {
    const requestedAt = new Date('2031-01-02T23:30:00.000Z').getTime();
    const quote = await customerPort.quote(
      {
        origin: 'CN-SZX',
        destinationPostalCode: '90001',
        weightKg: 123.5,
        volumeM3: 0.48,
      },
      () => requestedAt
    );

    expect(quote.validUntil).toBe('2031-01-03T07:30:00.000Z');
  });

  it('过期与服务端 410 哨兵不受跨日期请求时钟影响', async () => {
    const requestedAt = new Date('2031-01-02T23:30:00.000Z').getTime();
    const now = () => requestedAt;
    const expired = await customerPort.quote(
      {
        origin: 'CN-SZX',
        destinationPostalCode: 'EXPIRED',
        weightKg: 123.5,
        volumeM3: 0.48,
      },
      now
    );
    const gone = await customerPort.quote(
      {
        origin: 'CN-SZX',
        destinationPostalCode: '41000',
        weightKg: 123.5,
        volumeM3: 0.48,
      },
      now
    );

    expect(new Date(expired.validUntil).getTime()).toBeLessThan(requestedAt);
    expect(new Date(gone.validUntil).getTime()).toBeGreaterThan(requestedAt);
    await expect(customerPort.acceptQuote(gone)).rejects.toMatchObject({
      code: 'QUOTE_EXPIRED',
    });
  });

  it('接受报价后订单显式携带已接受 quoteId、optionId 与 version', async () => {
    const create = vi.spyOn(customerPort, 'createOrder');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '立即查价' }));
    await user.click(screen.getByRole('button', { name: '获取报价' }));
    await user.click(screen.getByRole('button', { name: '选择此报价' }));
    await user.type(screen.getByLabelText('收件人'), 'Quote Bound User');
    await user.type(screen.getByLabelText('目的地'), 'US-LAX 90001');
    await user.click(screen.getByRole('button', { name: '提交预报' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedQuote: {
          quoteId: '01JQUOTE000000000000000042',
          optionId: '01JQUOTEOPTION0000000000001',
          version: 2,
        },
      })
    );
  });

  it('创建订单后通过审计 port 关联已接受报价且不丢弃版本', async () => {
    const linkAcceptedQuote = vi.spyOn(customerPort, 'linkAcceptedQuote').mockResolvedValue({
      quoteId: '01JQUOTE000000000000000042',
      quoteOptionId: '01JQUOTEOPTION0000000000001',
      quoteVersion: 2,
      linkId: '01JQUOTELINK00000000000001',
      linkVersion: 1,
      orderId: '01JORDER000000000000000006',
      waybillId: '01JWAYBILL000000000000001',
      orderVersion: 2,
      waybillVersion: 1,
    });

    await customerPort.createOrder({
      origin: 'CN-SZX 518000',
      recipient: 'Audit User',
      destination: 'US-LAX 90001',
      phone: '+1 213 555 0108',
      commodity: '样品',
      pieces: 1,
      weightKg: 1,
      acceptedQuote: {
        quoteId: '01JQUOTE000000000000000042',
        optionId: '01JQUOTEOPTION0000000000001',
        version: 2,
      },
    });

    expect(linkAcceptedQuote).toHaveBeenCalledWith({
      orderId: '01JORDER000000000000000006',
      orderVersion: 1,
      quoteId: '01JQUOTE000000000000000042',
      optionId: '01JQUOTEOPTION0000000000001',
      acceptedQuoteVersion: 2,
    });
  });

  it('服务端 accept 返回 410 时停留查价页并要求重新查价', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '立即查价' }));
    await user.type(screen.getByLabelText('目的地邮编'), '41000');
    await user.click(screen.getByRole('button', { name: '获取报价' }));
    await user.click(screen.getByRole('button', { name: '选择此报价' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '报价已在服务端过期，请按当前规则重新查价'
    );
    expect(screen.getByRole('heading', { name: '多渠道查价' })).toBeVisible();
    expect(screen.getByRole('button', { name: '按当前规则重新查价' })).toBeVisible();
  });

  it('页面停留跨过 validUntil 后用注入时钟自动禁用接受', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let currentTime = new Date('2031-01-02T23:30:00.000Z').getTime();
    const ClockedApp = App as ComponentType<{ now: () => number }>;
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ClockedApp now={() => currentTime} />);
    await user.click(screen.getByRole('button', { name: '立即查价' }));
    await user.click(screen.getByRole('button', { name: '获取报价' }));
    expect(screen.getByRole('button', { name: '选择此报价' })).toBeEnabled();

    currentTime = new Date('2031-01-03T07:30:01.000Z').getTime();
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByRole('region', { name: '报价 Q2505120042' })).toHaveTextContent('已过期');
    expect(screen.getByRole('button', { name: '选择此报价' })).toBeDisabled();
  });

  it('过期报价不能接受并明确要求重新查价', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '立即查价' }));
    await user.type(screen.getByLabelText('目的地邮编'), 'EXPIRED');
    await user.click(screen.getByRole('button', { name: '获取报价' }));

    const quote = await screen.findByRole('region', { name: '报价 Q2505120042' });
    expect(quote).toHaveTextContent('已过期');
    expect(within(quote).getByRole('button', { name: '选择此报价' })).toBeDisabled();
    expect(within(quote).getByRole('button', { name: '按当前规则重新查价' })).toBeVisible();
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
    expect(screen.getByRole('table', { name: '我的运单列表' })).toHaveTextContent('S2505120006');
    expect(screen.queryByText('华南跨境供应链')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看轨迹 S2505120006' }));
    expect(screen.getByRole('heading', { name: '运单轨迹' })).toBeVisible();
    expect(screen.getByText('预报已提交 · 等待仓库收货')).toBeVisible();
  });

  it('新建订单把实际地址和包裹数据传给端口并持久化', async () => {
    const create = vi.spyOn(customerPort, 'createOrder');
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: '客户门户导航' })).getByRole('button', {
        name: '新建运单',
      })
    );
    await user.clear(screen.getByLabelText('发货地'));
    await user.type(screen.getByLabelText('发货地'), 'CN-XMN 361000');
    await user.type(screen.getByLabelText('收件人'), 'Mia Receiver');
    await user.type(screen.getByLabelText('目的地'), 'US-MIA 33101');
    await user.clear(screen.getByLabelText('联系电话'));
    await user.type(screen.getByLabelText('联系电话'), '+1 305 555 0188');
    await user.clear(screen.getByLabelText('品名'));
    await user.type(screen.getByLabelText('品名'), '精密仪器');
    await user.clear(screen.getByLabelText('件数'));
    await user.type(screen.getByLabelText('件数'), '7');
    await user.clear(screen.getByLabelText('预报重（kg）'));
    await user.type(screen.getByLabelText('预报重（kg）'), '77.25');
    await user.click(screen.getByRole('button', { name: '提交预报' }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'CN-XMN 361000',
        recipient: 'Mia Receiver',
        destination: 'US-MIA 33101',
        phone: '+1 305 555 0188',
        commodity: '精密仪器',
        pieces: 7,
        weightKg: 77.25,
      })
    );
    const saved = localStorage.getItem('zhili.customer.tenant-xinyuan.customer-xinyuan.orders');
    expect(saved).toContain('US-MIA 33101');
    expect(saved).toContain('77.25');
  });

  it('账单付款只保留统一的权威状态流程，不暴露旧支付弹窗入口', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '账单与付款' }));
    expect(screen.getByText('待支付账单 2 张')).toBeVisible();
    expect(screen.getByText('待支付总额 CNY 70,740.00')).toBeVisible();
    expect(screen.getByText('当前账单 INV-202607-018')).toBeVisible();
    expect(screen.queryByRole('button', { name: '支付 ST202605-0008' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '确认支付' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '查看账单 INV-202607-018' }));
    await user.click(screen.getByRole('button', { name: '立即支付' }));
    await user.click(screen.getByRole('button', { name: '确认付款' }));
    expect(await screen.findByRole('heading', { name: '支付订单已创建' })).toBeVisible();
  });

  it('报价使用 canonical 分项且费用守恒', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '立即查价' }));
    await user.click(screen.getByRole('button', { name: '获取报价' }));
    const result = screen.getByRole('region', { name: '报价 Q2505120042' });
    expect(result).toHaveTextContent('基础运费CNY 4,680.00');
    expect(result).toHaveTextContent('燃油附加费CNY 514.80');
    expect(result).toHaveTextContent('偏远附加费CNY 80.00');
    expect(result).toHaveTextContent('操作费CNY 45.20');
    expect(result).toHaveTextContent('CNY 5,320.00');
  });

  it('草稿、批量导入、地址簿、付款凭证、查询和导出都有状态闭环', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: '客户门户导航' })).getByRole('button', {
        name: '新建运单',
      })
    );
    await user.type(screen.getByLabelText('收件人'), 'Draft User');
    await user.click(screen.getByRole('button', { name: '保存草稿' }));
    expect(await screen.findByRole('status')).toHaveTextContent('草稿已保存');

    await user.click(screen.getByRole('button', { name: '批量导入' }));
    await user.upload(screen.getByLabelText('导入文件'), new File(['a,b'], 'orders.csv'));
    await user.click(screen.getByRole('button', { name: '开始导入' }));
    expect(await screen.findByRole('status')).toHaveTextContent('导入完成');

    await user.click(screen.getByRole('button', { name: '地址簿' }));
    await user.type(screen.getByLabelText('地址名称'), '洛杉矶仓');
    await user.click(screen.getByRole('button', { name: '保存地址' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      '请先补全国家、城市、详细地址和邮编'
    );
    expect(screen.getByRole('table', { name: '地址列表' })).not.toHaveTextContent('洛杉矶仓');

    await user.click(screen.getByRole('button', { name: '账单与付款' }));
    await user.upload(
      screen.getByLabelText('付款凭证'),
      new File(['proof'], 'proof.png', { type: 'image/png' })
    );
    await user.click(screen.getByRole('button', { name: '上传并关联凭证' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('付款凭证已关联'));

    await user.click(screen.getByRole('button', { name: '我的运单' }));
    await user.type(screen.getByLabelText('搜索运单'), '0004');
    await user.click(screen.getByRole('button', { name: '查询' }));
    expect(screen.getByRole('table', { name: '我的运单列表' })).not.toHaveTextContent(
      'S2505120001'
    );
    await user.click(screen.getByRole('button', { name: '导出当前结果' }));
    expect(await screen.findByRole('status')).toHaveTextContent('导出任务已创建');
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
    expect(screen.queryByText('CNY 128,560.00')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('navigation', { name: '客户门户导航' })).getByRole('button', {
        name: '新建运单',
      })
    ).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('演示状态'), 'stale');
    expect(screen.getByRole('alert')).toHaveTextContent('页面数据已过期');
    await user.selectOptions(screen.getByLabelText('演示状态'), 'empty');
    expect(screen.getByText(/当前筛选没有数据/)).toBeVisible();
  });

  it('过期快照先调用比较端口并展示字段级版本差异', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('演示状态'), 'stale');
    await user.click(screen.getByRole('button', { name: '刷新并比较' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '版本差异：snapshotAt 10:18 → 10:21'
    );
    expect(screen.getByRole('button', { name: '应用服务器版本' })).toBeVisible();
  });

  it('部分失败只重试失败项并在端口拒绝时保留失败状态', async () => {
    vi.spyOn(customerPort, 'retryFailedNotifications').mockRejectedValueOnce(
      new Error('notification-5 重试失败；失败状态已保留。')
    );
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('演示状态'), 'partial');
    expect(screen.getByRole('status')).toHaveTextContent('失败项 notification-5');
    await user.click(screen.getByRole('button', { name: '仅重试失败项' }));
    expect(await screen.findByRole('status')).toHaveTextContent('notification-5 重试失败');
    expect(screen.getByRole('button', { name: '仅重试失败项' })).toBeVisible();
  });

  it('部分失败成功恢复时只提交失败 ID 并合并回正常数据', async () => {
    const retry = vi.spyOn(customerPort, 'retryFailedNotifications');
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('演示状态'), 'partial');
    await user.click(screen.getByRole('button', { name: '仅重试失败项' }));
    expect(retry).toHaveBeenCalledWith(['notification-5']);
    expect(await screen.findByRole('status')).toHaveTextContent('notification-5 已合并成功');
    expect(screen.getByRole('heading', { name: /下午好/ })).toBeVisible();
  });

  it('本地持久化按租户和客户隔离，切换客户不会串读', async () => {
    const ScopedApp = App as ComponentType<{
      tenantId: string;
      customerId: string;
      companyName: string;
    }>;
    const user = userEvent.setup();
    const first = render(
      <ScopedApp tenantId="tenant-a" customerId="customer-a" companyName="A 客户" />
    );
    await user.click(screen.getByRole('button', { name: '地址簿' }));
    await user.type(screen.getByLabelText('地址名称'), 'A 客户专属仓');
    await user.click(screen.getByRole('button', { name: '保存地址' }));
    first.unmount();

    render(<ScopedApp tenantId="tenant-a" customerId="customer-b" companyName="B 客户" />);
    await user.click(screen.getByRole('button', { name: '地址簿' }));
    expect(screen.getByRole('table', { name: '地址列表' })).not.toHaveTextContent('A 客户专属仓');
    expect(
      localStorage.getItem('zhili.customer.tenant-a.customer-a.addresses') ?? ''
    ).not.toContain('A 客户专属仓');
    expect(
      localStorage.getItem('zhili.customer.tenant-a.customer-b.addresses') ?? ''
    ).not.toContain('A 客户专属仓');
  });

  it('API 写失败时保留输入且不伪造运单', async () => {
    vi.spyOn(customerPort, 'createOrder').mockRejectedValueOnce(new Error('网关失败，请重试'));
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      within(screen.getByRole('navigation', { name: '客户门户导航' })).getByRole('button', {
        name: '新建运单',
      })
    );
    await user.type(screen.getByLabelText('收件人'), '保留的收件人');
    await user.type(screen.getByLabelText('目的地'), 'US-LAX');
    await user.click(screen.getByRole('button', { name: '提交预报' }));
    expect(await screen.findByRole('status')).toHaveTextContent('网关失败');
    expect(screen.getByLabelText('收件人')).toHaveValue('保留的收件人');
    expect(
      localStorage.getItem('zhili.customer.tenant-xinyuan.customer-xinyuan.waybills') ?? ''
    ).not.toContain('S2505120006');
  });
});
