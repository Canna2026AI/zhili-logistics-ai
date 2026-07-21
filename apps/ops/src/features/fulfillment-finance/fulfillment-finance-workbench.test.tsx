// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FulfillmentFinanceWorkbench } from './fulfillment-finance-workbench';

afterEach(cleanup);

describe('fulfillment and finance workbench', () => {
  it('supports warehouse confirmation and preserves canonical physical data', () => {
    render(<FulfillmentFinanceWorkbench />);

    expect(screen.getByRole('heading', { name: '收货扫描' })).toBeVisible();
    expect(screen.getAllByText('123.50 kg', { exact: true })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '确认收货' }));
    expect(screen.getByRole('status')).toHaveTextContent('收货已确认，已进入待分货');
  });

  it('keeps warehouse scan evidence and finance table dense enough for desktop operations', () => {
    render(<FulfillmentFinanceWorkbench />);
    expect(
      screen.getByRole('table', { name: '最近扫描记录' }).getElementsByTagName('tr')
    ).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: /年船期/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: /财务结算/ }));
    expect(
      screen.getByRole('table', { name: '应收费用列表' }).getElementsByTagName('tr')
    ).toHaveLength(11);
  });

  it.each([
    ['loading', '正在加载履约数据'],
    ['empty', '当前筛选没有数据'],
    ['failed', 'REQ-FIN-5001'],
    ['forbidden', '缺少权限 finance.charge.review'],
    ['stale', '本地版本 10 / 服务器版本 11'],
    ['partial', '成功 8 条，失败 2 条'],
  ] as const)('renders the %s state with a recovery explanation', (state, evidence) => {
    render(<FulfillmentFinanceWorkbench initialViewState={state} />);
    expect(screen.getByText((content) => content.includes(evidence))).toBeVisible();
  });

  it('gates unreview behind impact, reason, version and audit evidence', () => {
    render(<FulfillmentFinanceWorkbench initialSection="finance" />);

    fireEvent.click(screen.getByRole('button', { name: '反审核' }));
    const dialog = screen.getByRole('dialog', { name: '反审核费用' });
    expect(dialog).toHaveTextContent('影响');
    expect(dialog).toHaveTextContent('预期版本 11');
    expect(dialog).toHaveTextContent('audit://finance/charges/CHG-S2505120004');
    expect(screen.getByRole('button', { name: '确认反审核' })).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: '操作原因' }), {
      target: { value: '承运商补传尾程费用' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认反审核' }));
    expect(screen.getByRole('status')).toHaveTextContent('反审核已提交，审计事件已记录');
  });
});
