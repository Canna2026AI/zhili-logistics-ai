import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MasterDataPanel } from '../ui/master-data-panel';
import { filterMasterData, masterDataFixtures } from '../model/master-data';

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

  it('adds a scoped customer and preserves the selected category', () => {
    const onCreate = vi.fn();
    render(<MasterDataPanel state="normal" onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: '新增客户' }));
    fireEvent.change(screen.getByLabelText('客户名称'), {
      target: { value: '上海星河跨境有限公司' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存客户' }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: '上海星河跨境有限公司' })
    );
  });
});
