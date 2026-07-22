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
    fireEvent.click(screen.getByRole('button', { name: '校验数据' }));
    expect(await screen.findByText('有效 1 行，错误 1 行')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '提交有效行' }));
    expect(await screen.findByText(/已创建 1 票，1 行未提交/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回滚本批次' })).toBeInTheDocument();
  });

  it('awaits create, validate, commit and rollback import operations', async () => {
    const port = {
      create: vi.fn(async () => ({ id: 'import-1', version: 1 })),
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
      create: vi.fn(async () => ({ id: 'import-1', version: 1 })),
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
        create: vi.fn().mockResolvedValue({ id: 'import-1', version: 1 }),
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
      create: vi.fn(async () => ({ id: 'import-1', version: 1 })),
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

  it('uses generated import create, validate, commit and rollback paths', async () => {
    const POST = vi.fn(async (path: string) => {
      if (path === '/imports') return { data: { data: { id: 'import-1', version: 1 } } };
      if (path === '/ai/imports/{importId}/mapping-proposals:apply')
        return {
          data: {
            data: { id: 'import-1', version: 2, status: 'MAPPING' },
            meta: { requestId: 'REQ-MAPPING-1' },
          },
        };
      if (path === '/imports/{importId}:commit')
        return {
          data: {
            data: {
              id: 'job-1',
              type: 'IMPORT_COMMIT',
              status: 'QUEUED',
              progress: 0,
              createdAt: '2026-07-22T08:00:00+08:00',
            },
          },
        };
      return { data: { data: { resourceId: 'import-1', status: 'ROLLED_BACK', version: 4 } } };
    });
    const api = createImportApi({ POST } as never, () => 'idem-import');
    await api.create('file-ref');
    await expect(api.applyMapping('import-1', 1, ['01JMAP0000000000000000002'])).resolves.toEqual({
      id: 'import-1',
      version: 2,
      status: 'MAPPING',
      auditId: 'REQ-MAPPING-1',
    });
    await api.validate('import-1', 1);
    await api.commit('import-1', 2, true);
    await api.rollback('import-1', 3, '客户确认本批次全部作废');
    expect(POST).toHaveBeenCalledWith(
      '/imports/{importId}:rollback',
      expect.objectContaining({
        params: expect.objectContaining({
          header: { 'Idempotency-Key': 'idem-import', 'If-Match': '"3"' },
        }),
        body: expect.objectContaining({ reason: '客户确认本批次全部作废' }),
      })
    );
    expect(POST).toHaveBeenCalledWith(
      '/ai/imports/{importId}/mapping-proposals:apply',
      expect.objectContaining({
        params: expect.objectContaining({
          header: { 'Idempotency-Key': 'idem-import', 'If-Match': '"1"' },
        }),
        body: {
          proposalVersion: 1,
          acceptedMappingIds: ['01JMAP0000000000000000002'],
        },
      })
    );
  });
});
