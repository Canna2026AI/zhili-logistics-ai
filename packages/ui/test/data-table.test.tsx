import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, type DataTableColumn } from '../src/components/data-table';

type Row = { id: string; waybill: string; weight: number };

const columns: DataTableColumn<Row>[] = [
  { key: 'waybill', header: '运单号', render: (row) => row.waybill },
  {
    key: 'weight',
    header: '计费重',
    align: 'right',
    render: (row) => `${row.weight.toFixed(2)} kg`,
  },
];

describe('DataTable', () => {
  it('renders a dense table and reports explicit page selection', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTable
        ariaLabel="运单列表"
        columns={columns}
        rows={[{ id: '1', waybill: 'S2505120004', weight: 123.5 }]}
        rowKey={(row) => row.id}
        selectedKeys={[]}
        onSelectionChange={onSelectionChange}
      />
    );
    const table = screen.getByRole('table', { name: '运单列表' });
    expect(within(table).getByText('123.50 kg')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '选择本页全部 1 条' }));
    expect(onSelectionChange).toHaveBeenCalledWith(['1']);
  });

  it('keeps selections from other pages and exposes partial page selection', async () => {
    const onSelectionChange = vi.fn();
    const user = userEvent.setup();
    const rows: Row[] = [
      { id: '1', waybill: 'S2505120004', weight: 123.5 },
      { id: '2', waybill: 'S2505120005', weight: 86.2 },
    ];
    const { rerender } = render(
      <DataTable
        ariaLabel="运单列表"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        selectedKeys={['other-page', '1']}
        onSelectionChange={onSelectionChange}
      />
    );
    const selectPage = screen.getByRole('checkbox', { name: '选择本页全部 2 条' });
    expect(selectPage).toBePartiallyChecked();
    await user.click(selectPage);
    expect(onSelectionChange).toHaveBeenLastCalledWith(['other-page', '1', '2']);

    rerender(
      <DataTable
        ariaLabel="运单列表"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        selectedKeys={['other-page', '1', '2']}
        onSelectionChange={onSelectionChange}
      />
    );
    await user.click(screen.getByRole('checkbox', { name: '选择本页全部 2 条' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(['other-page']);
  });
});
