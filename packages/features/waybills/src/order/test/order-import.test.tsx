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
          data: { data: { resourceId: 'order-2', version: 1, domain: { orderNo: 'ORD-2' } } },
        };
      return { data: { data: { waybillNo: 'S2505120099', version: 2 } } };
    });
    const api = createOrderApi({ POST } as never, () => 'idem-order');
    const saved = await api.save(buildOrderRequest('STANDARD'));
    await api.validate(saved.id, saved.version);
    await api.copy(saved.id, saved.version);
    await api.submit(saved.id, saved.version);
    expect(POST).toHaveBeenCalledWith(
      '/orders/{orderId}:validate',
      expect.objectContaining({
        params: expect.objectContaining({
          header: { 'Idempotency-Key': 'idem-order', 'If-Match': '"1"' },
        }),
      })
    );
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
    await waitFor(() => expect(port.rollback).toHaveBeenCalledTimes(1));
  });

  it('uses generated import create, validate, commit and rollback paths', async () => {
    const POST = vi.fn(async (path: string) =>
      path === '/imports'
        ? { data: { data: { id: 'import-1', version: 1 } } }
        : { data: { data: { resourceId: 'import-1', version: 2 } } }
    );
    const api = createImportApi({ POST } as never, () => 'idem-import');
    await api.create('file-ref');
    await api.validate('import-1', 1);
    await api.commit('import-1', 2, true);
    await api.rollback('import-1', 3);
    expect(POST).toHaveBeenCalledWith(
      '/imports/{importId}:rollback',
      expect.objectContaining({
        params: expect.objectContaining({
          header: { 'Idempotency-Key': 'idem-import', 'If-Match': '"3"' },
        }),
      })
    );
  });
});
