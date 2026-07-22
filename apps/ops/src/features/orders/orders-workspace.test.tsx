// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { calculateQuote, memoryQuotePort, quoteInputFixture } from '@zhili/feature-rates-routing';
import { memoryImportPort } from '@zhili/feature-waybills';
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
    const accept = vi.fn(async (_quoteId: string, optionId: string, version: number) => ({
      acceptedOptionId: optionId,
      version: version + 1,
    }));
    render(
      <OpsOrdersWorkspace
        initialPage="quotes"
        showScenarioControls
        ports={{ quotes: { ...memoryQuotePort, create, accept } }}
      />
    );

    fireEvent.change(screen.getByLabelText('实重 (kg)'), { target: { value: '150.75' } });

    fireEvent.change(screen.getByRole('combobox', { name: '报价状态' }), {
      target: { value: 'expired' },
    });
    expect(screen.getByText('报价已过有效期')).toBeVisible();
    expect(screen.getByText(/原报价快照/)).toBeVisible();
    expect(screen.queryByRole('button', { name: '接受报价' })).not.toBeInTheDocument();

    const recalculate = screen.getByRole('button', { name: '按当前规则重算' });
    fireEvent.click(recalculate);
    expect(recalculate).toBeDisabled();
    fireEvent.click(recalculate);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        quote: expect.objectContaining({
          packages: [expect.objectContaining({ weightKg: '150.75' })],
        }),
        orderContext: { orderType: 'STANDARD' },
      })
    );

    const authoritative = calculateQuote({
      ...quoteInputFixture,
      request: {
        ...quoteInputFixture.request,
        packages: [{ ...quoteInputFixture.request.packages[0]!, weightKg: '150.75' }],
      },
    });
    authoritative.id = 'quote-server-20260723';
    authoritative.quoteNo = 'Q-SERVER-20260723';
    authoritative.version = 9;
    authoritative.options[0] = { ...authoritative.options[0]!, id: 'server-option-01' };
    resolveQuote?.(authoritative);
    await waitFor(() => expect(screen.getByRole('button', { name: '接受报价' })).toBeEnabled());
    expect(screen.getByText('Q-SERVER-20260723')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '接受报价' }));
    await waitFor(() =>
      expect(accept).toHaveBeenCalledWith('quote-server-20260723', 'server-option-01', 9)
    );
  });

  it('keeps quote expiry active when requote rejects', async () => {
    const create = vi.fn(async () => {
      throw new Error('价卡服务 503');
    });
    render(
      <OpsOrdersWorkspace
        initialPage="quotes"
        showScenarioControls
        ports={{ quotes: { ...memoryQuotePort, create } }}
      />
    );
    fireEvent.change(screen.getByLabelText('实重 (kg)'), { target: { value: '166.25' } });
    fireEvent.change(screen.getByRole('combobox', { name: '报价状态' }), {
      target: { value: 'expired' },
    });
    fireEvent.click(screen.getByRole('button', { name: '按当前规则重算' }));
    expect(await screen.findByText(/操作失败：价卡服务 503/)).toBeVisible();
    expect(screen.getByRole('combobox', { name: '报价状态' })).toHaveValue('expired');
    expect(screen.queryByRole('button', { name: '接受报价' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回正常流程' }));
    expect(screen.getByLabelText('实重 (kg)')).toHaveValue('166.25');
  });

  it('opens an actual audited AI mapping region and isolates it from quote state', async () => {
    const create = vi.fn(async () => ({ id: '01JIMPORT00000000000000001', version: 4 }));
    const applyMapping = vi.fn(async () => ({
      id: '01JIMPORT00000000000000001',
      version: 5,
      status: 'MAPPING',
      auditId: 'REQ-AI-MAP-001',
    }));
    render(
      <OpsOrdersWorkspace
        initialPage="quotes"
        showScenarioControls
        ports={{ imports: { ...memoryImportPort, create, applyMapping } as never }}
      />
    );
    fireEvent.change(screen.getByRole('combobox', { name: '报价状态' }), {
      target: { value: 'expired' },
    });

    fireEvent.click(screen.getByRole('button', { name: '导入运单' }));
    expect(screen.getByRole('combobox', { name: 'AI 导入状态' })).toHaveValue('normal');
    fireEvent.change(screen.getByRole('combobox', { name: 'AI 导入状态' }), {
      target: { value: 'failed-model' },
    });
    expect(screen.getByLabelText('导入 CSV')).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: 'AI 导入状态' }), {
      target: { value: 'low-confidence' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('4 个字段置信度不足');
    expect(screen.getByText(/Zhili-Map 2\.1/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '进入人工映射' }));
    expect(await screen.findByRole('region', { name: 'AI 人工字段映射' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: '收件州候选字段' })).toBeVisible();
    expect(screen.getByLabelText('导入 CSV')).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox', { name: '收件州候选字段' }), {
      target: { value: '01JMAP0000000000000000002' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认人工映射' }));
    await waitFor(() => expect(applyMapping).toHaveBeenCalledTimes(1));
    expect(applyMapping).toHaveBeenCalledWith('01JIMPORT00000000000000001', 4, [
      '01JMAP0000000000000000002',
    ]);
    expect(screen.getByText(/人工映射已应用.*审计 REQ-AI-MAP-001/)).toBeVisible();
    expect(screen.getByLabelText('导入 CSV')).toBeEnabled();

    fireEvent.change(screen.getByRole('combobox', { name: 'AI 导入状态' }), {
      target: { value: 'forbidden' },
    });
    expect(screen.getByLabelText('导入 CSV')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '报价管理' }));
    expect(screen.getByRole('combobox', { name: '报价状态' })).toHaveValue('normal');
    expect(screen.queryByRole('region', { name: 'AI 人工字段映射' })).not.toBeInTheDocument();
  });

  it('preserves the import batch, version and manual choice when mapping is rejected', async () => {
    const create = vi.fn(async () => ({ id: '01JIMPORT00000000000000009', version: 7 }));
    const applyMapping = vi.fn(async () => {
      throw new Error('409 映射版本冲突');
    });
    render(
      <OpsOrdersWorkspace
        initialPage="imports"
        showScenarioControls
        ports={{ imports: { ...memoryImportPort, create, applyMapping } }}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'AI 导入状态' }), {
      target: { value: 'low-confidence' },
    });
    fireEvent.click(screen.getByRole('button', { name: '进入人工映射' }));
    fireEvent.change(screen.getByRole('combobox', { name: '收件州候选字段' }), {
      target: { value: '01JMAP0000000000000000002' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认人工映射' }));

    expect(await screen.findByText(/409 映射版本冲突/)).toBeVisible();
    expect(screen.getByLabelText('导入 CSV')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '收件州候选字段' })).toHaveValue(
      '01JMAP0000000000000000002'
    );
    fireEvent.click(screen.getByRole('button', { name: '确认人工映射' }));
    await waitFor(() => expect(applyMapping).toHaveBeenCalledTimes(2));
    expect(create).toHaveBeenCalledTimes(1);
    expect(applyMapping).toHaveBeenLastCalledWith('01JIMPORT00000000000000009', 7, [
      '01JMAP0000000000000000002',
    ]);
  });
});
