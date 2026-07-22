import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WaybillList } from '../ui/waybill-list';
import { filterWaybills, waybillFixtures } from '../model/waybill';

describe('waybill list', () => {
  it('keeps the accepted dense 12-row desktop table and canonical fixture', () => {
    render(<WaybillList />);
    expect(screen.getAllByRole('row')).toHaveLength(13);
    expect(screen.getByRole('button', { name: 'S2505120004' })).toBeInTheDocument();
    expect(screen.getByText('共 1,248 条')).toBeInTheDocument();
  });

  it('applies state filters and search without loading a million rows locally', () => {
    expect(filterWaybills(waybillFixtures, { query: '洛杉矶', state: '全部运单' })).toHaveLength(2);
    render(<WaybillList />);
    fireEvent.click(screen.getByRole('tab', { name: /问题件46/ }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('S2505120007')).toBeInTheDocument();
  });

  it('opens a quick drawer with canonical facts and closes without losing selection', async () => {
    render(<WaybillList />);
    const row = screen.getByRole('button', { name: 'S2505120004' }).closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'S2505120004' }));
    expect(screen.getByRole('dialog', { name: '运单详情' })).toBeInTheDocument();
    expect(await screen.findByText('123.50 kg')).toBeInTheDocument();
    expect(screen.getByText('0.48 m³')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));
    expect(within(row!).getByRole('checkbox')).toBeChecked();
  });

  it('requires impact, reason, version and audit destination for cancellation', () => {
    render(<WaybillList />);
    const row = screen.getByRole('button', { name: 'S2505120004' }).closest('tr')!;
    fireEvent.click(within(row).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '批量操作（1）' }));
    fireEvent.click(screen.getByRole('button', { name: '取消运单' }));
    expect(screen.getByText(/将取消 1 票运单/)).toBeInTheDocument();
    expect(screen.getByText(/S2505120004 v7/)).toBeInTheDocument();
    expect(screen.getByText(/审计：waybill\.batch-command/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认取消' })).toBeDisabled();
  });

  it.each([
    ['loading', '正在加载运单'],
    ['empty', '当前筛选无运单'],
    ['failed', '运单加载失败'],
    ['forbidden', '缺少 waybill.read'],
    ['expired', '会话已过期'],
    ['stale', '运单版本已更新'],
  ] as const)('renders %s as an explicit actionable state', (state, copy) => {
    render(<WaybillList state={state} />);
    expect(screen.getByText(new RegExp(copy))).toBeInTheDocument();
  });

  it('shows item-level outcomes when a batch is partially successful', () => {
    render(<WaybillList state="partial" />);
    expect(screen.getByText('批量执行：成功 2，失败 1')).toBeInTheDocument();
    expect(screen.getByText(/S2505120007：状态不允许/)).toBeInTheDocument();
  });

  it('loads the selected waybill detail without leaking another customer', async () => {
    const get = vi.fn(async (id: string) => ({
      id,
      waybillNo: id === 'wb-002' ? 'S2505120002' : 'S2505120004',
      masterNo: id === 'wb-002' ? 'HBL2505120002' : 'HBL2505120004',
      customer: id === 'wb-002' ? '欧陆贸易' : '深圳鑫源贸易有限公司',
      customerCode: id === 'wb-002' ? 'CUST-EU-18' : 'CUST00256',
      contactName: id === 'wb-002' ? 'Anna Müller' : '王志强',
      contactPhone: id === 'wb-002' ? '+49 69 123 8800' : '139 2654 8800',
      route: id === 'wb-002' ? 'CN-SZX → DE-FRA' : 'CN-SZX → US-LAX',
      service: id === 'wb-002' ? 'Lufthansa Cargo' : 'DHL Express Worldwide',
      transport: id === 'wb-002' ? '空运' : '海运整箱',
      pieces: id === 'wb-002' ? 5 : 18,
      forecastWeightKg: id === 'wb-002' ? '318.00' : '122.00',
      actualWeightKg: id === 'wb-002' ? '320.00' : '123.50',
      volumeM3: id === 'wb-002' ? '1.18' : '0.48',
      createdAt: '2025-05-12 09:48',
      state: '待收货',
      version: 2,
      branch: '深圳分公司',
      timeline: ['待收货 · 深圳仓库'],
    }));
    render(<WaybillList port={{ get } as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'S2505120002' }));
    expect(await screen.findByText('CN-SZX → DE-FRA')).toBeInTheDocument();
    expect(screen.getByText('Anna Müller')).toBeInTheDocument();
    expect(screen.queryByText('王志强')).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('wb-002');
  });

  it('awaits label and batch cancellation ports and renders partial outcomes', async () => {
    const port = {
      get: vi.fn(),
      submit: vi.fn(async () => ({ version: 8 })),
      createLabel: vi.fn(async () => ({ id: 'label-1', status: 'QUEUED', version: 1 })),
      batch: vi.fn(async (ids: string[]) => ({
        succeeded: ids.filter((id) => id === 'wb-004'),
        failed: ids.filter((id) => id === 'wb-007').map((id) => ({ id, reason: '状态不允许' })),
      })),
    };
    render(<WaybillList port={port as never} />);
    const row4 = screen.getByRole('button', { name: 'S2505120004' }).closest('tr')!;
    const row7 = screen.getByRole('button', { name: 'S2505120007' }).closest('tr')!;
    fireEvent.click(within(row4).getByRole('checkbox'));
    fireEvent.click(within(row7).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: '批量操作（2）' }));
    fireEvent.click(screen.getByRole('button', { name: '生成标签' }));
    await waitFor(() => expect(port.createLabel).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '批量操作（2）' }));
    fireEvent.click(screen.getByRole('button', { name: '取消运单' }));
    fireEvent.change(screen.getByLabelText('取消原因'), {
      target: { value: '客户书面通知取消运输' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认取消' }));
    await waitFor(() => expect(port.batch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('批量执行：成功 1，失败 1')).toBeInTheDocument();
  });

  it.each([
    ['生成标签', 'createLabel'],
    ['提交预报', 'submit'],
  ] as const)(
    'keeps per-waybill outcomes when %s is only partially successful',
    async (command, method) => {
      const port = {
        get: vi.fn(),
        submit: vi.fn(),
        createLabel: vi.fn(),
        batch: vi.fn(),
      };
      port[method]
        .mockResolvedValueOnce({ version: 8 })
        .mockRejectedValueOnce(new Error('VERSION_CONFLICT'));
      render(<WaybillList port={port as never} />);
      for (const number of ['S2505120004', 'S2505120007']) {
        const row = screen.getByRole('button', { name: number }).closest('tr')!;
        fireEvent.click(within(row).getByRole('checkbox'));
      }
      fireEvent.click(screen.getByRole('button', { name: '批量操作（2）' }));
      fireEvent.click(screen.getByRole('button', { name: command }));
      expect(await screen.findByText('批量执行：成功 1，失败 1')).toBeInTheDocument();
      expect(screen.getByText(/S2505120007：VERSION_CONFLICT/)).toBeInTheDocument();
    }
  );

  it('cancels each selected resource with its own displayed version', async () => {
    const batch = vi.fn(async (ids: string[]) => ({ succeeded: ids, failed: [] }));
    render(<WaybillList port={{ batch } as never} />);
    for (const number of ['S2505120004', 'S2505120007']) {
      const row = screen.getByRole('button', { name: number }).closest('tr')!;
      fireEvent.click(within(row).getByRole('checkbox'));
    }
    fireEvent.click(screen.getByRole('button', { name: '批量操作（2）' }));
    fireEvent.click(screen.getByRole('button', { name: '取消运单' }));
    expect(screen.getByText(/S2505120004 v7/)).toBeInTheDocument();
    expect(screen.getByText(/S2505120007 v6/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('取消原因'), {
      target: { value: '客户书面通知取消运输' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认取消' }));
    await waitFor(() => expect(batch).toHaveBeenCalledTimes(2));
    expect(batch).toHaveBeenNthCalledWith(1, ['wb-004'], 'CANCEL', 7, '客户书面通知取消运输');
    expect(batch).toHaveBeenNthCalledWith(2, ['wb-007'], 'CANCEL', 6, '客户书面通知取消运输');
  });

  it('keeps read access while disabling every write action', () => {
    render(<WaybillList readOnly dataScope="深圳分公司" />);
    expect(screen.getByRole('table', { name: '运单列表' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增预报' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '批量操作（0）' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /复制 S/ })[0]).toBeDisabled();
  });

  it('applies the readonly field policy inside the detail drawer and never exposes clear PII', async () => {
    render(<WaybillList readOnly dataScope="深圳分公司" />);
    fireEvent.click(screen.getByRole('button', { name: 'S2505120004' }));
    const drawer = screen.getByRole('dialog', { name: '运单详情' });
    await waitFor(() =>
      expect(within(drawer).queryByText('139 2654 8800')).not.toBeInTheDocument()
    );
    expect(within(drawer).getByText('139 **** 8800')).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: '问题件登记' })).toBeDisabled();
  });

  it('disables unavailable visible controls with an explicit integration reason', () => {
    render(<WaybillList />);
    expect(screen.getByRole('button', { name: '高级筛选' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '高级筛选' })).toHaveAttribute(
      'title',
      expect.stringMatching(/待集成/)
    );
    expect(screen.getByRole('button', { name: '刷新' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /复制 S/ })[0]).toBeDisabled();
    expect(screen.getByText(/待服务端查询与命令端口接入/)).toBeInTheDocument();
  });

  it('renders detail rejection without showing protected customer fields', async () => {
    render(
      <WaybillList port={{ get: vi.fn().mockRejectedValue(new Error('FORBIDDEN')) } as never} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'S2505120004' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('详情加载失败');
    expect(screen.queryByText('139 2654 8800')).not.toBeInTheDocument();
  });
});
