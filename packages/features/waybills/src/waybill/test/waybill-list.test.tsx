import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

  it('opens a quick drawer with canonical facts and closes without losing selection', () => {
    render(<WaybillList />);
    const row = screen.getByRole('button', { name: 'S2505120004' }).closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'S2505120004' }));
    expect(screen.getByRole('dialog', { name: '运单详情' })).toBeInTheDocument();
    expect(screen.getByText('123.50 kg')).toBeInTheDocument();
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
    expect(screen.getByText(/版本 v7/)).toBeInTheDocument();
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
});
