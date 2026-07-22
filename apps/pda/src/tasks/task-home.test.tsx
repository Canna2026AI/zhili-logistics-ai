// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceTask } from '../domain/types';
import { TaskHome } from './task-home';

describe('TaskHome', () => {
  afterEach(cleanup);

  it('renders the F09 today-task summary and starts the highest-priority task', async () => {
    const selected: DeviceTask = {
      id: '01JPDATASK0000000000000001',
      type: 'RECEIVE',
      reference: 'S2505120004',
      status: 'READY',
      priority: 'URGENT',
      version: 7,
    };
    const onScan = vi.fn();
    render(<TaskHome tasks={[selected]} onScan={onScan} />);

    expect(screen.getByRole('heading', { name: '今日任务' })).toBeVisible();
    expect(screen.getByText(/待收货 1/)).toBeVisible();
    expect(screen.getByText('优先任务 · 扫码收货')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '开始任务' }));

    expect(onScan).toHaveBeenCalledWith(selected);
  });

  it('passes the complete selected DeviceTask snapshot to the scanner', async () => {
    const selected: DeviceTask = {
      id: '01JPDATASK0000000000000002',
      type: 'LAST_MILE_DELIVERY',
      reference: 'LM-SECOND',
      status: 'LOADED',
      priority: 'HIGH',
      version: 9,
    };
    const onScan = vi.fn();
    render(<TaskHome tasks={[selected]} onScan={onScan} />);

    await userEvent.click(screen.getByRole('button', { name: /LM-SECOND/ }));

    expect(onScan).toHaveBeenCalledWith(selected);
  });

  it('renders the live network and queue state instead of a fixed demo status', () => {
    render(
      <TaskHome
        tasks={[]}
        onScan={vi.fn()}
        online={false}
        pendingCount={17}
      />
    );

    expect(screen.getByText('离线 · 上次同步 09:40 · 队列 17/200')).toBeVisible();
  });
});
