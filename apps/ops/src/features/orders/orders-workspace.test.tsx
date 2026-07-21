// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
});
