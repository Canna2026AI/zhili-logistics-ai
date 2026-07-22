// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { calculateQuote, memoryQuotePort, quoteInputFixture } from '@zhili/feature-rates-routing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpsOrdersWorkspace } from './index';

afterEach(cleanup);

describe('ops orders workspace', () => {
  it('opens the quote page from the only primary list command', () => {
    render(<OpsOrdersWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: '新增预报' }));
    expect(screen.getByRole('heading', { name: '新建运单与报价说明' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '新建预报 / 报价' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('simulates read-only permission without hiding the scope reason', () => {
    render(<OpsOrdersWorkspace showPermissionController />);
    fireEvent.click(screen.getByRole('button', { name: '模拟只读权限' }));
    expect(screen.getByText(/权限模拟：王丽/)).toBeInTheDocument();
    expect(screen.getByText(/waybill\.write 被 DENY/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: '运单列表' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增预报' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '主数据' }));
    fireEvent.click(screen.getByRole('tab', { name: '联系人' }));
    expect(screen.getByText(/139 \*\*\*\* 8800/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '结束模拟' }));
    expect(screen.queryByText(/权限模拟：王丽/)).not.toBeInTheDocument();
  });

  it('keeps the default production workspace free of demo-only permission controls', () => {
    render(<OpsOrdersWorkspace />);
    expect(screen.queryByRole('button', { name: '模拟只读权限' })).not.toBeInTheDocument();
  });

  it('navigates independently to master data, rate catalog and import modules', () => {
    render(<OpsOrdersWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: '主数据' }));
    expect(screen.getByRole('heading', { level: 1, name: '主数据' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '渠道价卡' }));
    expect(screen.getByRole('heading', { name: '渠道与价卡' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '导入运单' }));
    expect(screen.getByRole('heading', { name: '运单批量导入' })).toBeInTheDocument();
  });

  it('blocks accepting an expired quote until the real quote port resolves a new snapshot', async () => {
    let resolveQuote: ((value: ReturnType<typeof calculateQuote>) => void) | undefined;
    const create = vi.fn(
      () =>
        new Promise<ReturnType<typeof calculateQuote>>((resolve) => {
          resolveQuote = resolve;
        })
    );
    render(
      <OpsOrdersWorkspace initialPage="quotes" ports={{ quotes: { ...memoryQuotePort, create } }} />
    );

    fireEvent.change(screen.getByRole('combobox', { name: '报价状态' }), {
      target: { value: 'expired' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('报价已过有效期');
    expect(screen.getByText(/原报价快照/)).toBeVisible();
    expect(screen.queryByRole('button', { name: '接受报价' })).not.toBeInTheDocument();

    const recalculate = screen.getByRole('button', { name: '按当前规则重算' });
    fireEvent.click(recalculate);
    expect(recalculate).toBeDisabled();
    fireEvent.click(recalculate);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      quote: quoteInputFixture.request,
      orderContext: { orderType: 'STANDARD' },
    });

    resolveQuote?.(calculateQuote(quoteInputFixture));
    await waitFor(() => expect(screen.getByRole('button', { name: '接受报价' })).toBeEnabled());
    expect(screen.getByRole('status')).toHaveTextContent(/已生成新报价.*quote:/);
  });

  it('keeps quote expiry active when requote rejects', async () => {
    const create = vi.fn(async () => {
      throw new Error('价卡服务 503');
    });
    render(
      <OpsOrdersWorkspace initialPage="quotes" ports={{ quotes: { ...memoryQuotePort, create } }} />
    );
    fireEvent.change(screen.getByRole('combobox', { name: '报价状态' }), {
      target: { value: 'expired' },
    });
    fireEvent.click(screen.getByRole('button', { name: '按当前规则重算' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('价卡服务 503');
    expect(screen.getByRole('combobox', { name: '报价状态' })).toHaveValue('expired');
    expect(screen.queryByRole('button', { name: '接受报价' })).not.toBeInTheDocument();
  });

  it('opens an actual audited AI mapping region and isolates it from quote state', async () => {
    render(<OpsOrdersWorkspace initialPage="quotes" />);
    fireEvent.change(screen.getByRole('combobox', { name: '报价状态' }), {
      target: { value: 'expired' },
    });

    fireEvent.click(screen.getByRole('button', { name: '导入运单' }));
    expect(screen.getByRole('combobox', { name: 'AI 导入状态' })).toHaveValue('normal');
    fireEvent.change(screen.getByRole('combobox', { name: 'AI 导入状态' }), {
      target: { value: 'low-confidence' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('4 个字段置信度不足');
    expect(screen.getByText(/Zhili-Map 2\.1/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '进入人工映射' }));
    expect(await screen.findByRole('region', { name: 'AI 人工字段映射' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '收件州候选字段' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(/clientAction.*CLIENT-F10-MAP/);

    fireEvent.change(screen.getByRole('combobox', { name: 'AI 导入状态' }), {
      target: { value: 'forbidden' },
    });
    expect(screen.getByLabelText('导入 CSV')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '报价管理' }));
    expect(screen.getByRole('combobox', { name: '报价状态' })).toHaveValue('normal');
    expect(screen.queryByRole('region', { name: 'AI 人工字段映射' })).not.toBeInTheDocument();
  });
});
