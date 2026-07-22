import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MasterDataPanel } from '../ui/master-data-panel';
import { filterMasterData, masterDataFixtures } from '../model/master-data';
import { createMasterDataApi } from '../adapters/api/master-data-api';

describe('master data', () => {
  it('filters customers, contacts, organizations, warehouses and partners without losing category', () => {
    expect(filterMasterData(masterDataFixtures, '深圳')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: '客户' }),
        expect.objectContaining({ category: '仓库' }),
      ])
    );
  });

  it('does not disguise forbidden data as an empty list', () => {
    render(<MasterDataPanel state="forbidden" />);
    expect(screen.getByText(/缺少 master-data\.read/)).toBeInTheDocument();
    expect(screen.queryByText('暂无主数据')).not.toBeInTheDocument();
  });

  it('adds a scoped customer and preserves the selected category', async () => {
    const onCreate = vi.fn();
    render(<MasterDataPanel state="normal" onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: '新增客户' }));
    fireEvent.change(screen.getByLabelText('客户名称'), {
      target: { value: '上海星河跨境有限公司' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存客户' }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: '上海星河跨境有限公司' })
      )
    );
  });

  it('awaits the injected customer port and appends the returned record', async () => {
    const createCustomer = vi.fn(async () => ({
      id: 'customer-new',
      category: '客户' as const,
      code: 'CUST00999',
      name: '异步保存客户',
      scope: '深圳分公司',
      status: '启用' as const,
      version: 1,
    }));
    render(<MasterDataPanel port={{ createCustomer } as never} />);
    fireEvent.click(screen.getByRole('button', { name: '新增客户' }));
    fireEvent.change(screen.getByLabelText('客户名称'), { target: { value: '异步保存客户' } });
    fireEvent.click(screen.getByRole('button', { name: '保存客户' }));
    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled();
    await waitFor(() => expect(createCustomer).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('CUST00999')).toBeInTheDocument();
  });

  it('keeps readable scoped data while disabling writes and masking phone fields', () => {
    render(<MasterDataPanel readOnly dataScope="深圳分公司" maskPhone />);
    expect(screen.getByText('CUST00256')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增客户' })).toBeDisabled();
    fireEvent.click(screen.getByRole('tab', { name: '联系人' }));
    expect(screen.getByText(/139 \*\*\*\* 8800/)).toBeInTheDocument();
    expect(screen.queryByText(/139 2654 8800/)).not.toBeInTheDocument();
  });

  it('surfaces a rejected save without closing the form', async () => {
    const createCustomer = vi.fn(async () => {
      throw new Error('CUSTOMER_CONFLICT');
    });
    render(<MasterDataPanel port={{ createCustomer } as never} />);
    fireEvent.click(screen.getByRole('button', { name: '新增客户' }));
    fireEvent.change(screen.getByLabelText('客户名称'), { target: { value: '冲突客户' } });
    fireEvent.click(screen.getByRole('button', { name: '保存客户' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('客户保存失败');
    expect(screen.getByRole('dialog', { name: '新增客户' })).toBeInTheDocument();
  });

  it('uses generated customer and versioned master-data paths', async () => {
    const POST = vi.fn(async (path: string) =>
      path === '/customers'
        ? {
            data: {
              data: {
                id: 'customer-1',
                name: '契约客户',
                customerCode: 'CUST00001',
                status: 'ACTIVE',
                version: 1,
              },
            },
          }
        : { data: { data: { resourceId: 'resource-1', version: 2 } } }
    );
    const PUT = vi.fn().mockResolvedValue({ data: { data: { resourceId: 'credit-1' } } });
    const api = createMasterDataApi({ POST, PUT } as never, () => 'idem-master');
    await api.createCustomer({
      name: '契约客户',
      scope: '深圳分公司',
      creditLimit: '100000.00',
      paymentTerms: '月结 30 天',
    });
    await api.upsertOrganization({ id: 'org-1' }, 3);
    await api.updateCredit('customer-1', { id: 'credit-1' }, 2);
    expect(POST).toHaveBeenCalledWith(
      '/master-data/organization-nodes:upsert',
      expect.objectContaining({
        params: { header: { 'Idempotency-Key': 'idem-master', 'If-Match': '"3"' } },
      })
    );
    expect(PUT).toHaveBeenCalledWith(
      '/customers/{customerId}/credit-policy',
      expect.objectContaining({
        params: expect.objectContaining({ path: { customerId: 'customer-1' } }),
      })
    );
  });
});
