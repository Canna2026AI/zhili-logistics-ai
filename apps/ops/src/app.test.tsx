// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultOpsOrdersPorts } from './features/orders/ports';
import { createInMemoryFulfillmentFinanceCommandPort } from './features/fulfillment-finance/in-memory-command-port';
import { App } from './app';

afterEach(cleanup);

describe('integrated operations application', () => {
  it('routes from the real orders entry to fulfillment and back', () => {
    window.history.replaceState({}, '', '/operations/orders?mock=1');
    render(
      <App
        ordersPorts={defaultOpsOrdersPorts}
        fulfillmentCommandPort={createInMemoryFulfillmentFinanceCommandPort()}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: '运营工作台' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '履约与财务' }));
    expect(screen.getByRole('heading', { name: '收货扫描' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/operations/fulfillment-finance/warehouse');

    fireEvent.click(screen.getByRole('button', { name: /干线尾程/ }));
    expect(screen.getByRole('heading', { name: '干线与尾程履约' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/operations/fulfillment-finance/linehaul');

    window.history.pushState({}, '', '/operations/fulfillment-finance/warehouse?mock=1');
    fireEvent.popState(window);
    expect(screen.getByRole('heading', { name: '收货扫描' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: '订单与报价' }));
    expect(screen.getByRole('heading', { level: 1, name: '运营工作台' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/operations/orders');
  });

  it('maps orders navigation to the matching fulfillment section', () => {
    window.history.replaceState({}, '', '/operations/orders?mock=1');
    render(
      <App
        ordersPorts={defaultOpsOrdersPorts}
        fulfillmentCommandPort={createInMemoryFulfillmentFinanceCommandPort()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '应收应付' }));
    expect(screen.getByRole('heading', { name: '物流财务结算' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/operations/fulfillment-finance/finance');
  });
});
