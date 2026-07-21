import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderDraftPanel } from '../ui/order-draft-panel';
import { buildOrderRequest } from '../model/order';
import { parseImportRows } from '../../import/model/import';
import { ImportWorkbench } from '../../import/ui/import-workbench';

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
});

describe('waybill import', () => {
  it('parses valid and invalid rows before commit', () => {
    const result = parseImportRows('客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX\n,abc,');
    expect(result).toMatchObject({ valid: 1, invalid: 1 });
    expect(result.errors[0]).toMatch(/第 3 行/);
  });

  it('moves through upload, mapping, validation, preview and partial commit', () => {
    render(<ImportWorkbench />);
    fireEvent.change(screen.getByLabelText('导入 CSV'), {
      target: { value: '客户,重量,目的地\n深圳鑫源贸易有限公司,122,US-LAX\n,abc,' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析并映射' }));
    expect(screen.getByText('字段映射')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '校验数据' }));
    expect(screen.getByText('有效 1 行，错误 1 行')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '提交有效行' }));
    expect(screen.getByText(/已创建 1 票，1 行未提交/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回滚本批次' })).toBeInTheDocument();
  });
});
