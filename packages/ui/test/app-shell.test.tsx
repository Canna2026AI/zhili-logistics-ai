import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/components/app-shell';

describe('AppShell', () => {
  it('keeps tenant, search, tabs and grouped navigation in fixed slots', async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    render(
      <AppShell
        brand="智立科技物流AI系统"
        tenant="智立科技（深圳）有限公司"
        navigation={[{ label: '订单运单', items: [{ id: 'waybills', label: '运单管理' }] }]}
        activeNavigationId="waybills"
        tabs={[
          { id: 'home', label: '运营工作台' },
          { id: 'waybills', label: '运单' },
        ]}
        activeTabId="waybills"
        onSearch={onSearch}
      >
        <h1>运单管理</h1>
      </AppShell>
    );
    expect(screen.getByText('智立科技（深圳）有限公司')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '业务导航' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '运单管理' })).toHaveAttribute(
      'aria-label',
      '运单管理'
    );
    await user.type(screen.getByRole('searchbox', { name: '全局搜索' }), 'S2505120004{enter}');
    expect(onSearch).toHaveBeenCalledWith('S2505120004');
  });
});
