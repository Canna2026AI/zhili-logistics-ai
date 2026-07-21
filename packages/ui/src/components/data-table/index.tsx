import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  render: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  ariaLabel: string;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  emptyState?: ReactNode;
}

export function DataTable<Row>({
  ariaLabel,
  columns,
  emptyState = '暂无数据',
  onSelectionChange,
  rowKey,
  rows,
  selectedKeys = [],
}: DataTableProps<Row>) {
  const selectable = Boolean(onSelectionChange);
  const pageKeys = useMemo(() => rows.map(rowKey), [rowKey, rows]);
  const selectedPageKeys = pageKeys.filter((key) => selectedKeys.includes(key));
  const allSelected = pageKeys.length > 0 && selectedPageKeys.length === pageKeys.length;
  const partiallySelected = selectedPageKeys.length > 0 && !allSelected;
  const selectPageRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectPageRef.current) selectPageRef.current.indeterminate = partiallySelected;
  }, [partiallySelected]);

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      const pageKeySet = new Set(pageKeys);
      onSelectionChange(selectedKeys.filter((key) => !pageKeySet.has(key)));
      return;
    }
    onSelectionChange([...new Set([...selectedKeys, ...pageKeys])]);
  };

  const toggleRow = (key: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(
      selectedKeys.includes(key)
        ? selectedKeys.filter((selected) => selected !== key)
        : [...selectedKeys, key]
    );
  };

  return (
    <div className="zl-table-frame">
      <table className="zl-table" aria-label={ariaLabel}>
        <thead>
          <tr>
            {selectable ? (
              <th className="zl-table__selection">
                <input
                  ref={selectPageRef}
                  type="checkbox"
                  aria-label={`选择本页全部 ${rows.length} 条`}
                  aria-checked={partiallySelected ? 'mixed' : allSelected}
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.key}
                style={{ width: column.width, textAlign: column.align ?? 'left' }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="zl-table__empty" colSpan={columns.length + (selectable ? 1 : 0)}>
                {emptyState}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const key = rowKey(row);
              return (
                <tr key={key} data-selected={selectedKeys.includes(key) || undefined}>
                  {selectable ? (
                    <td className="zl-table__selection">
                      <input
                        type="checkbox"
                        aria-label={`选择第 ${rows.indexOf(row) + 1} 条`}
                        checked={selectedKeys.includes(key)}
                        onChange={() => toggleRow(key)}
                      />
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td key={column.key} style={{ textAlign: column.align ?? 'left' }}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
