// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { calculateQuote, memoryQuotePort, quoteInputFixture } from '@zhili/feature-rates-routing';
import { memoryImportPort } from '@zhili/feature-waybills';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpsOrdersWorkspace } from './index';

afterEach(cleanup);

describe('ops orders workspace', () => {
  const customerId = '01JY8Z8F6ME4F0Y9QH2X6D4R7A';
  const quoteId = '01JY8Z8F6ME4F0Y9QH2X6D4R7B';
  const optionId = '01JY8Z8F6ME4F0Y9QH2X6D4R7C';

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

  it('starts production quote creation without an acceptable local fixture snapshot', () => {
    render(<OpsOrdersWorkspace initialPage="quotes" ports={{ quotes: memoryQuotePort }} />);

    expect(screen.getByText('尚未获取服务端报价')).toBeVisible();
    expect(screen.queryByRole('button', { name: '接受报价' })).not.toBeInTheDocument();
  });

  it('drives a real 410 accept error into the non-resettable expired flow', async () => {
    const authoritative = calculateQuote({
      ...quoteInputFixture,
      request: { ...quoteInputFixture.request, customerId },
    });
    authoritative.id = quoteId;
    authoritative.version = 6;
    authoritative.options[0] = { ...authoritative.options[0]!, id: optionId };
    const accept = vi.fn(async () => {
      throw Object.assign(new Error('报价快照已过期'), {
        name: 'DomainApiError',
        status: 410,
        code: 'QUOTE_EXPIRED',
        remediation: '请重新计算',
      });
    });
    render(
      <OpsOrdersWorkspace
        initialPage="quotes"
        ports={{ quotes: { ...memoryQuotePort, create: vi.fn(async () => authoritative), accept } }}
      />
    );

    fireEvent.change(screen.getByLabelText('实重 (kg)'), { target: { value: '177.50' } });
    fireEvent.click(screen.getByRole('button', { name: '刷新报价' }));
    await screen.findByText(authoritative.quoteNo);
    fireEvent.click(screen.getByRole('button', { name: '接受报价' }));

    expect(await screen.findByText('报价已过有效期')).toBeVisible();
    expect(screen.queryByRole('button', { name: '返回正常流程' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('实重 (kg)')).toHaveValue('177.50');
    expect(screen.queryByRole('button', { name: '接受报价' })).not.toBeInTheDocument();
  });

  it('drives a real 409 quote refresh into stale-rate while preserving input', async () => {
    const create = vi.fn(async () => {
      throw Object.assign(new Error('价卡已发布新版本'), {
        name: 'DomainApiError',
        status: 409,
        code: 'STALE_VERSION',
      });
    });
    render(
      <OpsOrdersWorkspace initialPage="quotes" ports={{ quotes: { ...memoryQuotePort, create } }} />
    );
    fireEvent.change(screen.getByLabelText('实重 (kg)'), { target: { value: '188.25' } });
    fireEvent.click(screen.getByRole('button', { name: '刷新报价' }));

    expect(await screen.findByText('报价规则已发布新版本')).toBeVisible();
    expect(screen.getByLabelText('实重 (kg)')).toHaveValue('188.25');
    expect(screen.queryByRole('button', { name: '返回正常流程' })).not.toBeInTheDocument();
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
    const acceptedSource: { current?: ReturnType<typeof calculateQuote> } = {};
    const accept = vi.fn(async (_quoteId: string, optionId: string, version: number) => ({
      ...acceptedSource.current!,
      status: 'ACCEPTED' as const,
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
    authoritative.id = quoteId;
    authoritative.quoteNo = 'Q-SERVER-20260723';
    authoritative.version = 9;
    authoritative.options[0] = { ...authoritative.options[0]!, id: optionId };
    acceptedSource.current = authoritative;
    resolveQuote?.(authoritative);
    await waitFor(() => expect(screen.getByRole('button', { name: '接受报价' })).toBeEnabled());
    expect(screen.getByText('Q-SERVER-20260723')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '接受报价' }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith(quoteId, optionId, 9));
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
    const applyMapping = vi.fn(async () => ({
      id: '01JY8Z8F6ME4F0Y9QH2X6D4R7E',
      version: 5,
      status: 'MAPPING',
      evidence: { kind: 'audit' as const, auditId: 'AUD-AI-MAP-001' },
    }));
    render(
      <OpsOrdersWorkspace
        initialPage="quotes"
        showScenarioControls
        ports={{ imports: { ...memoryImportPort, applyMapping } as never }}
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
      target: { value: '01JY8Z8F6ME4F0Y9QH2X6D4R7J' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认人工映射' }));
    await waitFor(() => expect(applyMapping).toHaveBeenCalledTimes(1));
    expect(applyMapping).toHaveBeenCalledWith(
      '01JY8Z8F6ME4F0Y9QH2X6D4R7E',
      4,
      '01JY8Z8F6ME4F0Y9QH2X6D4R7F',
      3,
      ['01JY8Z8F6ME4F0Y9QH2X6D4R7J']
    );
    expect(screen.getByText(/人工映射已应用.*审计 AUD-AI-MAP-001/)).toBeVisible();
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
    const applyMapping = vi.fn(async () => {
      throw new Error('409 映射版本冲突');
    });
    render(
      <OpsOrdersWorkspace
        initialPage="imports"
        showScenarioControls
        ports={{ imports: { ...memoryImportPort, applyMapping } }}
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'AI 导入状态' }), {
      target: { value: 'low-confidence' },
    });
    fireEvent.click(screen.getByRole('button', { name: '进入人工映射' }));
    fireEvent.change(screen.getByRole('combobox', { name: '收件州候选字段' }), {
      target: { value: '01JY8Z8F6ME4F0Y9QH2X6D4R7J' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认人工映射' }));

    expect(await screen.findByText(/409 映射版本冲突/)).toBeVisible();
    expect(screen.getByLabelText('导入 CSV')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '收件州候选字段' })).toHaveValue(
      '01JY8Z8F6ME4F0Y9QH2X6D4R7J'
    );
    fireEvent.click(screen.getByRole('button', { name: '确认人工映射' }));
    await waitFor(() => expect(applyMapping).toHaveBeenCalledTimes(2));
    expect(applyMapping).toHaveBeenLastCalledWith(
      '01JY8Z8F6ME4F0Y9QH2X6D4R7E',
      4,
      '01JY8Z8F6ME4F0Y9QH2X6D4R7F',
      3,
      ['01JY8Z8F6ME4F0Y9QH2X6D4R7J']
    );
  });

  it('drives a real 422 proposal into manual mapping and resumes the same batch', async () => {
    const importId = '01JY8Z8F6ME4F0Y9QH2X6D4R7E';
    const proposalId = '01JY8Z8F6ME4F0Y9QH2X6D4R7F';
    const candidateId = '01JY8Z8F6ME4F0Y9QH2X6D4R7G';
    const proposal = {
      id: proposalId,
      importId,
      model: 'Zhili-Map 2.1',
      promptVersion: '2026.07',
      status: 'READY' as const,
      version: 3,
      candidates: [
        {
          id: candidateId,
          sourceColumn: 'province',
          targetField: 'receiverState',
          confidence: 0.32,
          evidence: ['列名相似'],
          risk: 'MEDIUM' as const,
        },
      ],
    };
    const create = vi.fn(async () => ({ id: importId, version: 4, status: 'UPLOADED' }));
    const proposeMapping = vi.fn(async () => {
      throw Object.assign(new Error('AI 置信度不足'), {
        name: 'DomainApiError',
        status: 422,
        code: 'AI_LOW_CONFIDENCE',
        context: { proposal },
      });
    });
    const applyMapping = vi.fn(async () => ({
      id: importId,
      version: 5,
      status: 'MAPPING',
      evidence: { kind: 'trace' as const, requestId: 'REQ-AI-MAP-001' },
    }));
    const validate = vi.fn(async () => ({ id: importId, version: 6, status: 'VALIDATING' }));
    render(
      <OpsOrdersWorkspace
        initialPage="imports"
        ports={{
          imports: {
            ...memoryImportPort,
            create,
            proposeMapping,
            applyMapping,
            validate,
          },
        }}
      />
    );

    fireEvent.change(screen.getByLabelText('导入 CSV'), {
      target: { value: '客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));
    expect(await screen.findByText('4 个字段置信度不足')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '进入人工映射' }));
    expect(await screen.findByRole('region', { name: 'AI 人工字段映射' })).toBeVisible();
    expect(screen.getByRole('option', { name: /province.*32%/ })).toHaveValue(candidateId);
    fireEvent.click(screen.getByRole('button', { name: '确认人工映射' }));

    await waitFor(() =>
      expect(applyMapping).toHaveBeenCalledWith(importId, 4, proposalId, 3, [candidateId])
    );
    expect(screen.getByText(/REQ-AI-MAP-001/)).toHaveTextContent('请求追踪');
    fireEvent.click(screen.getByRole('button', { name: '校验数据' }));
    await waitFor(() => expect(validate).toHaveBeenCalledWith(importId, 5));
  });

  it('atomically clears mapping state when a second import batch is created', async () => {
    const batchA = '01JY8Z8F6ME4F0Y9QH2X6D4R7E';
    const batchB = '01JY8Z8F6ME4F0Y9QH2X6D4R7M';
    const proposalA = {
      id: '01JY8Z8F6ME4F0Y9QH2X6D4R7F',
      importId: batchA,
      model: 'Zhili-Map 2.1',
      promptVersion: '2026.07',
      status: 'READY' as const,
      version: 3,
      candidates: [
        {
          id: '01JY8Z8F6ME4F0Y9QH2X6D4R7G',
          sourceColumn: 'province',
          targetField: 'receiverState',
          confidence: 0.32,
          evidence: ['列名相似'],
          risk: 'MEDIUM' as const,
        },
      ],
    };
    const proposalB = {
      ...proposalA,
      id: '01JY8Z8F6ME4F0Y9QH2X6D4R7N',
      importId: batchB,
      version: 1,
      candidates: [
        {
          ...proposalA.candidates[0]!,
          id: '01JY8Z8F6ME4F0Y9QH2X6D4R7P',
          sourceColumn: 'state_code',
          confidence: 0.96,
          autoApplicable: true,
        },
      ],
    };
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: batchA, version: 4, status: 'UPLOADED' })
      .mockResolvedValueOnce({ id: batchB, version: 1, status: 'UPLOADED' });
    const proposeMapping = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('AI 置信度不足'), {
          name: 'DomainApiError',
          status: 422,
          code: 'AI_LOW_CONFIDENCE',
          context: { proposal: proposalA },
        })
      )
      .mockResolvedValueOnce(proposalB);
    const applyMapping = vi.fn(async () => ({
      id: batchA,
      version: 5,
      status: 'MAPPING',
      evidence: { kind: 'audit' as const, auditId: 'AUD-BATCH-A-MAPPING' },
    }));
    render(
      <OpsOrdersWorkspace
        initialPage="imports"
        ports={{ imports: { ...memoryImportPort, create, proposeMapping, applyMapping } }}
      />
    );

    fireEvent.change(screen.getByLabelText('导入 CSV'), {
      target: { value: '客户,重量,目的地\n批次A,122,US-LAX' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));
    await screen.findByText('4 个字段置信度不足');
    fireEvent.click(screen.getByRole('button', { name: '进入人工映射' }));
    fireEvent.click(screen.getByRole('button', { name: '确认人工映射' }));
    await screen.findByText(/AUD-BATCH-A-MAPPING/);

    fireEvent.change(screen.getByLabelText('导入 CSV'), {
      target: { value: '客户,重量,目的地\n批次B,88,US-ONT' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));

    expect(await screen.findByText(/state_code.*receiverState/)).toBeVisible();
    expect(screen.getByRole('button', { name: '应用字段映射' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '校验数据' })).not.toBeInTheDocument();
    expect(screen.queryByText(/AUD-BATCH-A-MAPPING/)).not.toBeInTheDocument();
  });
});
