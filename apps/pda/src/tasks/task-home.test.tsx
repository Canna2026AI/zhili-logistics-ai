// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceTask } from '../domain/types';
import { TaskHome } from './task-home';

describe('TaskHome', () => {
  afterEach(cleanup);

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
});
