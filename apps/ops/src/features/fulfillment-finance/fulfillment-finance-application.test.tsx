// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FulfillmentFinanceApplication } from './fulfillment-finance-application';
import { createInMemoryFulfillmentFinanceCommandPort } from './in-memory-command-port';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('fulfillment finance application assembly', () => {
  it('renders the final application assembly and executes through its command provider', async () => {
    render(
      <FulfillmentFinanceApplication commandPort={createInMemoryFulfillmentFinanceCommandPort()} />
    );

    fireEvent.click(screen.getByRole('button', { name: '确认收货' }));
    expect(await screen.findByText(/AUD-confirmReceipt-1/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /财务结算/ }));
    expect(screen.getByRole('heading', { name: '物流财务结算' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '校验应付导入' }));
    expect(await screen.findByLabelText('财务流程状态')).toHaveTextContent('98 成功 / 2 失败');
  });

  it('uses the production API port by default and emits a WH-08 request', async () => {
    const requests: Request[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      requests.push(new Request(input));
      return Response.json({
        data: { resourceId: 'PRINT-S2505120004', status: 'QUEUED', version: 1 },
        meta: { requestId: 'REQ-PRINT-APP-1', timestamp: '2026-07-22T08:00:00Z' },
      });
    });

    render(<FulfillmentFinanceApplication />);
    fireEvent.click(screen.getByRole('button', { name: '打印交接单' }));

    expect(await screen.findByText(/REQ-PRINT-APP-1/)).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain('/api/v1/documents/print-jobs');
  });
});
