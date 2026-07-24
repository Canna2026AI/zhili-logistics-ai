import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderDraftPanel } from '../ui/order-draft-panel';
import { buildOrderRequest } from '../model/order';
import { parseImportRows } from '../../import/model/import';
import { ImportWorkbench } from '../../import/ui/import-workbench';
import { createOrderApi } from '../adapters/api/order-api';
import { createImportApi } from '../../import/adapters/api/import-api';

describe('standard and FBA order', () => {
  it('builds generated contract input for both order types', () => {
    expect(buildOrderRequest('STANDARD').orderType).toBe('STANDARD');
    expect(buildOrderRequest('FBA').orderType).toBe('FBA');
    expect(buildOrderRequest('FBA').packages[0]?.commodityDescription).toContain('Amazon');
  });

  it('switches to FBA linkage and validates shipment identifier', () => {
    render(<OrderDraftPanel />);
    fireEvent.click(screen.getByRole('radio', { name: 'FBA 入仓' }));
    expect(screen.getByLabelText('Amazon Shipment ID')).toBeInTheDocument();
    expect(screen.getByLabelText('FBA 箱数')).toHaveValue(5);
  });

  it('adds package and commodity rows as real editable state', () => {
    render(<OrderDraftPanel />);
    fireEvent.click(screen.getByRole('button', { name: '新增包裹' }));
    expect(screen.getAllByLabelText(/包裹编号/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '新增品名' }));
    expect(screen.getAllByLabelText(/品名描述/)).toHaveLength(2);
  });

  it('awaits save, validation, copy and submit ports', async () => {
    const port = {
      save: vi.fn(async () => ({ id: 'order-1', orderNo: 'ORD-1', status: 'DRAFT', version: 1 })),
      validate: vi.fn(async () => ({ valid: true, items: [] })),
      copy: vi.fn(async () => ({ id: 'order-2', orderNo: 'ORD-2', status: 'DRAFT', version: 1 })),
      submit: vi.fn(async () => ({
        id: 'order-1',
        orderNo: 'ORD-1',
        status: 'SUBMITTED',
        version: 2,
      })),
    };
    render(<OrderDraftPanel port={port as never} />);
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }));
    await waitFor(() => expect(port.save).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '预校验' }));
    expect(await screen.findByRole('status')).toHaveTextContent('校验通过');
    fireEvent.click(screen.getByRole('button', { name: '复制订单' }));
    await waitFor(() => expect(port.copy).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '提交预报' }));
    await waitFor(() => expect(port.submit).toHaveBeenCalledTimes(1));
  });

  it('renders server validation fields and remediation instead of flattening them to a boolean', async () => {
    const port = {
      save: vi.fn(async () => ({ id: 'order-1', orderNo: 'ORD-1', status: 'DRAFT', version: 1 })),
      validate: vi.fn(async () => ({
        valid: false,
        items: [
          {
            severity: 'ERROR',
            code: 'POSTAL_INVALID',
            fieldPath: 'destination.postalCode',
            message: '目的地邮编无效',
            remediation: '填写 5 位美国邮编',
          },
        ],
      })),
      copy: vi.fn(),
      submit: vi.fn(),
    };
    render(<OrderDraftPanel port={port as never} />);
    fireEvent.click(screen.getByRole('button', { name: '预校验' }));
    expect(await screen.findByText('目的地邮编无效')).toBeInTheDocument();
    expect(screen.getByText(/destination\.postalCode/)).toBeInTheDocument();
    expect(screen.getByText('填写 5 位美国邮编')).toBeInTheDocument();
  });

  it.each([
    ['保存草稿', 'save'],
    ['预校验', 'validate'],
    ['复制订单', 'copy'],
    ['提交预报', 'submit'],
  ] as const)(
    'surfaces a rejected %s order command without a success message',
    async (button, method) => {
      const draft = { id: 'order-1', orderNo: 'ORD-1', status: 'DRAFT', version: 1 };
      const port = {
        save: vi.fn().mockResolvedValue(draft),
        validate: vi.fn().mockResolvedValue({ valid: true, items: [] }),
        copy: vi.fn().mockResolvedValue(draft),
        submit: vi.fn().mockResolvedValue(draft),
      };
      port[method].mockRejectedValue(new Error('PERMISSION_DENIED'));
      render(<OrderDraftPanel port={port as never} />);
      fireEvent.click(screen.getByRole('button', { name: button }));
      expect(await screen.findByRole('alert')).toHaveTextContent('订单命令失败');
      expect(screen.queryByText(/草稿 .* 已保存/)).not.toBeInTheDocument();
      expect(port[method]).toHaveBeenCalled();
    }
  );

  it('uses generated order create, validate, copy and submit paths', async () => {
    const POST = vi.fn(async (path: string) => {
      if (path === '/orders')
        return {
          data: { data: { id: 'order-1', orderNo: 'ORD-1', status: 'DRAFT', version: 1 } },
        };
      if (path === '/orders/{orderId}:validate')
        return { data: { data: { valid: true, items: [] } } };
      if (path === '/orders/{orderId}:copy')
        return {
          data: { data: { id: 'order-2', orderNo: 'ORD-2', status: 'DRAFT', version: 1 } },
        };
      return {
        data: { data: { id: 'order-1', orderNo: 'ORD-1', status: 'SUBMITTED', version: 2 } },
      };
    });
    const api = createOrderApi({ POST } as never, () => 'idem-order');
    const saved = await api.save(buildOrderRequest('STANDARD'));
    await api.validate(saved.id, saved.version);
    await expect(api.copy(saved.id, saved.version)).resolves.toEqual({
      id: 'order-2',
      orderNo: 'ORD-2',
      status: 'DRAFT',
      version: 1,
    });
    await api.submit(saved.id, saved.version);
    expect(POST).toHaveBeenCalledWith(
      '/orders/{orderId}:submit',
      expect.objectContaining({
        params: expect.objectContaining({ path: { orderId: 'order-1' } }),
      })
    );
    expect(POST).toHaveBeenCalledWith(
      '/orders/{orderId}:validate',
      expect.objectContaining({
        params: expect.objectContaining({
          header: { 'Idempotency-Key': 'idem-order', 'If-Match': '"1"' },
        }),
      })
    );
  });

  it('fails closed instead of fabricating a copied order from a generic acknowledgement', async () => {
    const api = createOrderApi({
      POST: vi.fn().mockResolvedValue({
        data: { data: { resourceId: 'order-2', status: 'SUCCEEDED', version: 1 } },
      }),
    } as never);
    await expect(api.copy('order-1', 3)).rejects.toThrow('ORDER_COPY_RESPONSE_INCOMPLETE');
    await expect(api.submit('order-1', 3)).rejects.toThrow('ORDER_SUBMIT_RESPONSE_INCOMPLETE');
  });
});

describe('waybill import', () => {
  const importId = '01JY8Z8F6ME4F0Y9QH2X6D4R7E';
  const proposalId = '01JY8Z8F6ME4F0Y9QH2X6D4R7F';
  const candidateId = '01JY8Z8F6ME4F0Y9QH2X6D4R7G';
  const jobId = '01JY8Z8F6ME4F0Y9QH2X6D4R7H';

  it('parses valid and invalid rows before commit', () => {
    const result = parseImportRows('客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX\n,abc,');
    expect(result).toMatchObject({ valid: 1, invalid: 1 });
    expect(result.errors[0]).toMatch(/第 3 行/);
  });

  it('parses BOM, quoted commas and rejects non-positive weights', () => {
    const result = parseImportRows(
      '\uFEFF客户,重量,目的地\n"深圳鑫源,贸易有限公司",122,US-LAX\n无效客户,-2,DE-FRA\n空重量,0,GB-LHR'
    );
    expect(result).toMatchObject({ valid: 1, invalid: 2 });
    expect(result.rows[0]?.customer).toBe('深圳鑫源,贸易有限公司');
  });

  it('moves through upload, mapping, validation, preview and partial commit', async () => {
    render(<ImportWorkbench />);
    fireEvent.change(screen.getByLabelText('导入 CSV'), {
      target: { value: '客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX\n,abc,' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));
    expect(await screen.findByText('字段映射')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '应用字段映射' }));
    await screen.findByRole('button', { name: '校验数据' });
    fireEvent.click(screen.getByRole('button', { name: '校验数据' }));
    expect(await screen.findByText('有效 1 行，错误 1 行')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '提交有效行' }));
    expect(await screen.findByText(/已创建 1 票，1 行未提交/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回滚本批次' })).toBeInTheDocument();
  });

  it('awaits create, validate, commit and rollback import operations', async () => {
    const port = {
      create: vi.fn(async () => ({
        id: 'import-1',
        version: 1,
        mappingStatus: 'NOT_REQUIRED',
      })),
      validate: vi.fn(async () => ({ id: 'import-1', version: 2 })),
      commit: vi.fn(async () => ({ id: 'import-1', version: 3, created: 1, failed: 1 })),
      rollback: vi.fn(async () => ({ id: 'import-1', version: 4, status: 'ROLLED_BACK' })),
    };
    render(<ImportWorkbench port={port as never} />);
    fireEvent.change(screen.getByLabelText('导入 CSV'), {
      target: { value: '客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX\n,abc,' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));
    await waitFor(() => expect(port.create).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '校验数据' }));
    await waitFor(() => expect(port.validate).toHaveBeenCalledWith('import-1', 1));
    fireEvent.click(screen.getByRole('button', { name: '提交有效行' }));
    await waitFor(() => expect(port.commit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '回滚本批次' }));
    expect(screen.getByRole('dialog', { name: '确认回滚导入批次' })).toBeInTheDocument();
    expect(screen.getByText(/批次 import-1 · 当前版本 v3/)).toBeInTheDocument();
    expect(screen.getByText(/审计：import\.batch\.rolled-back/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认回滚' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('回滚原因'), {
      target: { value: '客户确认本批次数据全部作废' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认回滚' }));
    await waitFor(() =>
      expect(port.rollback).toHaveBeenCalledWith('import-1', 3, '客户确认本批次数据全部作废')
    );
  });

  it('renders the committed result returned by the port rather than the local CSV estimate', async () => {
    const port = {
      create: vi.fn(async () => ({
        id: 'import-1',
        version: 1,
        mappingStatus: 'NOT_REQUIRED',
      })),
      validate: vi.fn(async () => ({ id: 'import-1', version: 2 })),
      commit: vi.fn(async () => ({ id: 'import-1', version: 3, created: 7, failed: 2 })),
      rollback: vi.fn(),
    };
    render(<ImportWorkbench port={port as never} />);
    fireEvent.change(screen.getByLabelText('导入 CSV'), {
      target: { value: '客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX\n,abc,' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));
    await screen.findByText('字段映射');
    fireEvent.click(screen.getByRole('button', { name: '校验数据' }));
    await screen.findByText('有效 1 行，错误 1 行');
    fireEvent.click(screen.getByRole('button', { name: '提交有效行' }));
    expect(await screen.findByText(/已创建 7 票，2 行未提交/)).toBeInTheDocument();
  });

  it.each(['create', 'validate', 'commit'] as const)(
    'surfaces a rejected import %s command and keeps the current step retryable',
    async (method) => {
      const port = {
        create: vi.fn().mockResolvedValue({
          id: 'import-1',
          version: 1,
          mappingStatus: 'NOT_REQUIRED',
        }),
        validate: vi.fn().mockResolvedValue({ id: 'import-1', version: 2 }),
        commit: vi.fn().mockResolvedValue({ id: 'import-1', version: 3, created: 1, failed: 0 }),
        rollback: vi.fn(),
      };
      port[method].mockRejectedValue(new Error('COMMAND_REJECTED'));
      render(<ImportWorkbench port={port as never} />);
      fireEvent.change(screen.getByLabelText('导入 CSV'), {
        target: { value: '客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX' },
      });
      fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));
      if (method === 'create') {
        expect(await screen.findByRole('alert')).toHaveTextContent('导入命令失败');
        expect(screen.getByRole('button', { name: '解析并映射' })).toBeEnabled();
        return;
      }
      await screen.findByText('字段映射');
      fireEvent.click(screen.getByRole('button', { name: '校验数据' }));
      if (method === 'validate') {
        expect(await screen.findByRole('alert')).toHaveTextContent('导入命令失败');
        expect(screen.getByRole('button', { name: '校验数据' })).toBeEnabled();
        return;
      }
      await screen.findByText('有效 1 行，错误 0 行');
      fireEvent.click(screen.getByRole('button', { name: '提交有效行' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('导入命令失败');
      expect(screen.getByRole('button', { name: '提交有效行' })).toBeEnabled();
    }
  );

  it('keeps rollback confirmation open when the rollback port rejects', async () => {
    const port = {
      create: vi.fn(async () => ({
        id: 'import-1',
        version: 1,
        mappingStatus: 'NOT_REQUIRED',
      })),
      validate: vi.fn(async () => ({ id: 'import-1', version: 2 })),
      commit: vi.fn(async () => ({ id: 'import-1', version: 3, created: 1, failed: 0 })),
      rollback: vi.fn().mockRejectedValue(new Error('STALE_VERSION')),
    };
    render(<ImportWorkbench port={port as never} />);
    fireEvent.change(screen.getByLabelText('导入 CSV'), {
      target: { value: '客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));
    await screen.findByText('字段映射');
    fireEvent.click(screen.getByRole('button', { name: '校验数据' }));
    await screen.findByText('有效 1 行，错误 0 行');
    fireEvent.click(screen.getByRole('button', { name: '提交有效行' }));
    await screen.findByText(/已创建 1 票/);
    fireEvent.click(screen.getByRole('button', { name: '回滚本批次' }));
    fireEvent.change(screen.getByLabelText('回滚原因'), {
      target: { value: '版本冲突后保留批次等待复核' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认回滚' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('导入命令失败');
    expect(screen.getByRole('dialog', { name: '确认回滚导入批次' })).toBeInTheDocument();
  });

  it('reuses the same idempotency key after a lost create response', async () => {
    const POST = vi
      .fn()
      .mockRejectedValueOnce(new Error('connection lost after commit'))
      .mockResolvedValueOnce({
        data: {
          data: {
            id: importId,
            status: 'UPLOADED',
            totalRows: 2,
            validRows: 0,
            invalidRows: 0,
            version: 4,
          },
          meta: {},
        },
      });
    let keyCounter = 0;
    const api = createImportApi({ POST } as never, () => `intent-${++keyCounter}`);

    await expect(api.create('file-ref:orders.csv')).rejects.toThrow('connection lost');
    await expect(api.create('file-ref:orders.csv')).resolves.toMatchObject({
      id: importId,
      version: 4,
    });

    expect(POST.mock.calls[0]?.[1]).toMatchObject({
      params: { header: { 'Idempotency-Key': 'import-intent-1' } },
    });
    expect(POST.mock.calls[1]?.[1]).toMatchObject({
      params: { header: { 'Idempotency-Key': 'import-intent-1' } },
    });
  });

  it('fetches the proposal and carries it in a typed low-confidence error', async () => {
    const proposal = {
      id: proposalId,
      importId,
      model: 'Zhili-Map 2.1',
      promptVersion: '2026.07',
      status: 'READY',
      candidates: [
        {
          id: candidateId,
          sourceColumn: 'province',
          targetField: 'receiverState',
          confidence: 0.32,
          evidence: ['样本值 CA / NY'],
          risk: 'MEDIUM',
          autoApplicable: false,
        },
      ],
      version: 3,
    };
    const POST = vi.fn().mockResolvedValue({
      data: {
        data: {
          id: jobId,
          type: 'AI_MAPPING_PROPOSAL',
          status: 'SUCCEEDED',
          progress: 1,
          resultRef: proposalId,
          createdAt: '2026-07-23T08:00:00+08:00',
        },
        meta: {},
      },
    });
    const GET = vi.fn().mockResolvedValue({ data: { data: proposal, meta: {} } });
    const api = createImportApi({ POST, GET } as never, () => 'proposal-intent');

    await expect(api.proposeMapping(importId, 4)).rejects.toMatchObject({
      name: 'DomainApiError',
      status: 422,
      code: 'AI_LOW_CONFIDENCE',
      context: { proposal },
    });
    expect(GET).toHaveBeenCalledWith('/ai/imports/{importId}/mapping-proposals/{proposalId}', {
      params: { path: { importId, proposalId } },
    });
  });

  it('uses the authoritative ETag version and validates apply identities', async () => {
    const POST = vi.fn(async (path: string) => {
      if (path === '/imports/{importId}:validate') {
        return {
          data: {
            data: {
              id: jobId,
              type: 'IMPORT_VALIDATE',
              status: 'QUEUED',
              progress: 0,
              createdAt: '2026-07-23T08:00:00+08:00',
            },
            meta: {},
          },
          response: new Response(null, { headers: { ETag: '"8"' } }),
        };
      }
      return {
        data: {
          data: {
            id: importId,
            status: 'MAPPING',
            totalRows: 2,
            validRows: 0,
            invalidRows: 0,
            version: 5,
          },
          meta: { requestId: 'REQ-MAPPING-1' },
        },
      };
    });
    const api = createImportApi({ POST } as never, () => 'authority-intent');

    await expect(api.validate(importId, 4)).resolves.toMatchObject({
      id: importId,
      version: 8,
      jobId,
    });
    await expect(
      api.applyMapping(importId, 4, proposalId, 3, [candidateId])
    ).resolves.toMatchObject({
      id: importId,
      version: 5,
      evidence: { kind: 'trace', requestId: 'REQ-MAPPING-1' },
    });
  });

  it('keeps one controlled batch through low-confidence recovery and validation', async () => {
    const proposal = {
      id: proposalId,
      importId,
      model: 'Zhili-Map 2.1',
      promptVersion: '2026.07',
      status: 'READY' as const,
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
      version: 3,
    };
    const created = { id: importId, version: 4, status: 'UPLOADED' };
    const lowConfidence = Object.assign(new Error('AI 置信度不足'), {
      name: 'DomainApiError',
      status: 422,
      code: 'AI_LOW_CONFIDENCE',
      context: { proposal },
    });
    const port = {
      create: vi.fn(async () => created),
      proposeMapping: vi.fn(async () => {
        throw lowConfidence;
      }),
      applyMapping: vi.fn(),
      validate: vi.fn(async () => ({ id: importId, version: 6, status: 'VALIDATING' })),
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    const onJobChange = vi.fn();
    const onProposalChange = vi.fn();
    const onError = vi.fn();
    const view = render(
      <ImportWorkbench
        port={port}
        job={null}
        proposal={null}
        onJobChange={onJobChange}
        onProposalChange={onProposalChange}
        onError={onError}
      />
    );
    fireEvent.change(screen.getByLabelText('导入 CSV'), {
      target: { value: '客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));

    await waitFor(() => expect(onJobChange).toHaveBeenCalledWith(created));
    expect(onProposalChange).toHaveBeenCalledWith(proposal);
    expect(onError).toHaveBeenCalledWith(lowConfidence, 'propose');

    const mapped = { id: importId, version: 5, status: 'MAPPING' };
    view.rerender(
      <ImportWorkbench
        port={port}
        job={mapped}
        proposal={proposal}
        mappingApplied
        onJobChange={onJobChange}
        onProposalChange={onProposalChange}
        onError={onError}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '校验数据' }));
    await waitFor(() => expect(port.validate).toHaveBeenCalledWith(importId, 5));
  });

  it('fails closed when mapping proposal retrieval fails', async () => {
    const validate = vi.fn();
    const port = {
      create: vi.fn(async () => ({ id: importId, version: 4, status: 'UPLOADED' })),
      proposeMapping: vi.fn(async () => {
        throw Object.assign(new Error('proposal upstream unavailable'), {
          status: 500,
          code: 'AI_PROPOSAL_UNAVAILABLE',
        });
      }),
      applyMapping: vi.fn(),
      validate,
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    render(<ImportWorkbench port={port} />);
    fireEvent.change(screen.getByLabelText('导入 CSV'), {
      target: { value: '客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX' },
    });

    fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));

    await screen.findByRole('alert');
    expect(screen.queryByRole('button', { name: '校验数据' })).not.toBeInTheDocument();
    expect(validate).not.toHaveBeenCalled();
  });

  it('allows validation only when the authoritative import says mapping is not required', async () => {
    const validate = vi.fn(async () => ({ id: importId, version: 5, status: 'VALIDATING' }));
    const proposeMapping = vi.fn();
    const port = {
      create: vi.fn(async () => ({
        id: importId,
        version: 4,
        status: 'UPLOADED',
        mappingStatus: 'NOT_REQUIRED' as const,
      })),
      proposeMapping,
      applyMapping: vi.fn(),
      validate,
      commit: vi.fn(),
      rollback: vi.fn(),
    };
    render(<ImportWorkbench port={port} />);
    fireEvent.change(screen.getByLabelText('导入 CSV'), {
      target: { value: '客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX' },
    });

    fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));

    const validateButton = await screen.findByRole('button', { name: '校验数据' });
    expect(proposeMapping).not.toHaveBeenCalled();
    fireEvent.click(validateButton);
    await waitFor(() => expect(validate).toHaveBeenCalledWith(importId, 4));
  });

  it('uses generated import create, validate, commit and rollback paths', async () => {
    const POST = vi.fn(async (path: string) => {
      if (path === '/imports')
        return {
          data: {
            data: {
              id: importId,
              status: 'UPLOADED',
              totalRows: 2,
              validRows: 0,
              invalidRows: 0,
              version: 1,
            },
            meta: {},
          },
        };
      if (path === '/ai/imports/{importId}/mapping-proposals:apply')
        return {
          data: {
            data: {
              id: importId,
              version: 2,
              status: 'MAPPING',
              totalRows: 2,
              validRows: 0,
              invalidRows: 0,
            },
            meta: { requestId: 'REQ-MAPPING-1' },
          },
        };
      if (path === '/imports/{importId}:validate' || path === '/imports/{importId}:commit')
        return {
          data: {
            data: {
              id: jobId,
              type: 'IMPORT_COMMIT',
              status: 'QUEUED',
              progress: 0,
              createdAt: '2026-07-22T08:00:00+08:00',
            },
            meta: {},
          },
          response: new Response(null, {
            headers: { ETag: path.endsWith(':validate') ? '"3"' : '"4"' },
          }),
        };
      return {
        data: { data: { resourceId: importId, status: 'ROLLED_BACK', version: 5 }, meta: {} },
      };
    });
    const api = createImportApi({ POST } as never, () => 'idem-import');
    await api.create('file-ref');
    await expect(api.applyMapping(importId, 1, proposalId, 1, [candidateId])).resolves.toEqual({
      id: importId,
      version: 2,
      status: 'MAPPING',
      evidence: { kind: 'trace', requestId: 'REQ-MAPPING-1' },
    });
    await api.validate(importId, 2);
    await api.commit(importId, 3, true);
    await api.rollback(importId, 4, '客户确认本批次全部作废');
    expect(POST).toHaveBeenCalledWith(
      '/imports/{importId}:rollback',
      expect.objectContaining({
        params: expect.objectContaining({
          header: { 'Idempotency-Key': 'import-idem-import', 'If-Match': '"4"' },
        }),
        body: expect.objectContaining({ reason: '客户确认本批次全部作废' }),
      })
    );
    expect(POST).toHaveBeenCalledWith(
      '/ai/imports/{importId}/mapping-proposals:apply',
      expect.objectContaining({
        params: expect.objectContaining({
          header: { 'Idempotency-Key': 'import-idem-import', 'If-Match': '"1"' },
        }),
        body: {
          proposalId,
          proposalVersion: 1,
          acceptedMappingIds: [candidateId],
        },
      })
    );
  });
});
