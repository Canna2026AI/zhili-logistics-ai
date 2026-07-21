// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FulfillmentFinanceApplication } from './fulfillment-finance-application';

afterEach(cleanup);

describe('fulfillment finance application assembly', () => {
  it('renders the final application assembly and executes through its command provider', async () => {
    render(<FulfillmentFinanceApplication />);

    fireEvent.click(screen.getByRole('button', { name: '确认收货' }));
    expect(await screen.findByText(/AUD-confirmReceipt-1/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /财务结算/ }));
    expect(screen.getByRole('heading', { name: '物流财务结算' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '校验应付导入' }));
    expect(await screen.findByLabelText('财务流程状态')).toHaveTextContent('98 成功 / 2 失败');
  });
});
