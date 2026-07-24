// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FulfillmentFinanceWorkbench,
  type FulfillmentFinanceCommand,
  type FulfillmentFinanceCommandPort,
} from './fulfillment-finance-workbench';

afterEach(cleanup);

describe('fulfillment and finance workbench', () => {
  const successfulPort = (): FulfillmentFinanceCommandPort => ({
    execute: vi.fn(async (command: FulfillmentFinanceCommand) => ({
      auditId: `AUD-${command.operationId}`,
    })),
  });

  it('awaits the typed warehouse command before reporting success and auditing', async () => {
    let resolveCommand: ((value: { auditId: string }) => void) | undefined;
    const execute = vi.fn(
      () =>
        new Promise<{ auditId: string }>((resolve) => {
          resolveCommand = resolve;
        })
    );
    render(<FulfillmentFinanceWorkbench commandPort={{ execute }} />);

    expect(screen.getByRole('heading', { name: '收货扫描' })).toBeVisible();
    expect(screen.getAllByText('123.50 kg', { exact: true })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '确认收货' }));
    expect(screen.queryByText('操作成功')).not.toBeInTheDocument();
    expect(screen.getByText('正在提交 confirmReceipt')).toBeVisible();
    expect(screen.getByText('0')).toBeVisible();
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'warehouse',
        operationId: 'confirmReceipt',
        entityRef: 'RCV-S2505120004',
        idempotencyKey: 'confirmReceipt:RCV-S2505120004:v7',
        expectedVersion: 7,
      })
    );

    resolveCommand?.({ auditId: 'AUD-WH-0001' });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '收货已确认，已进入待分货 · 审计 AUD-WH-0001'
      )
    );
    expect(screen.getByText('审计事件').parentElement).toHaveTextContent('1');
  });

  it('surfaces a rejected command without success, state mutation or audit increment', async () => {
    let rejectCommand: ((reason: Error) => void) | undefined;
    const execute = vi.fn(
      () =>
        new Promise<{ auditId: string }>((_resolve, reject) => {
          rejectCommand = reject;
        })
    );
    render(<FulfillmentFinanceWorkbench commandPort={{ execute }} initialSection="tracking" />);

    fireEvent.click(screen.getByRole('button', { name: '解决问题' }));
    expect(screen.getByText('正在提交 resolveIssue')).toBeVisible();
    expect(screen.queryByText('操作成功')).not.toBeInTheDocument();
    expect(screen.getByText('处理中')).toBeVisible();
    expect(screen.getByText('0')).toBeVisible();

    rejectCommand?.(new Error('409 版本冲突'));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('409 版本冲突'));
    expect(screen.queryByText('操作成功')).not.toBeInTheDocument();
    expect(screen.getByText('处理中')).toBeVisible();
    expect(screen.getByText('0')).toBeVisible();
  });

  it('wires the remaining warehouse, last-mile and tracking P0 operations', async () => {
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) => ({
      auditId: `AUD-${command.operationId}`,
    }));
    render(<FulfillmentFinanceWorkbench commandPort={{ execute }} />);

    for (const [label, operationId] of [
      ['记录测量', 'recordMeasurement'],
      ['撤销收货', 'undoReceipt'],
      ['提交盘点', 'commitStocktake'],
      ['创建装载单', 'createLoadUnit'],
      ['重打交接单', 'reprintDocument'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() =>
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ operationId }))
      );
    }

    fireEvent.click(screen.getByRole('button', { name: /干线尾程/ }));
    for (const [label, operationId] of [
      ['创建尾程接货', 'createLastMileIntake'],
      ['扫描尾程接货', 'scanLastMileIntake'],
      ['创建派送任务', 'createDeliveryTask'],
      ['更新派送状态', 'updateDeliveryTaskStatus'],
      ['修订 POD', 'amendProofOfDelivery'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() =>
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ operationId }))
      );
    }

    fireEvent.click(screen.getByRole('button', { name: /轨迹客服/ }));
    for (const [label, operationId] of [
      ['接收轨迹', 'ingestTrackingEvent'],
      ['检测停滞', 'detectTrackingStall'],
      ['创建问题件', 'createIssue'],
      ['指派问题件', 'assignIssue'],
      ['结算索赔', 'settleClaim'],
      ['授权放货', 'releaseShipmentHold'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() =>
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ operationId }))
      );
    }
  });

  it('keeps warehouse scan evidence and finance table dense enough for desktop operations', () => {
    render(<FulfillmentFinanceWorkbench commandPort={successfulPort()} />);
    expect(
      screen.getByRole('table', { name: '最近扫描记录' }).getElementsByTagName('tr')
    ).toHaveLength(5);
    expect(screen.getAllByRole('button', { name: /年船期/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: /财务结算/ }));
    expect(
      screen.getByRole('table', { name: '应收费用列表' }).getElementsByTagName('tr')
    ).toHaveLength(11);
  });

  it('announces the current domain and updates the selected route only after resolve', async () => {
    const port = successfulPort();
    render(<FulfillmentFinanceWorkbench commandPort={port} />);

    expect(screen.getByRole('button', { name: /仓库作业/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
    const route = screen.getByRole('button', { name: 'EMC OAKLAND 082W 2026年船期' });
    fireEvent.click(route);
    await waitFor(() => expect(route).toHaveAttribute('data-selected', 'true'));
    expect(screen.getByRole('button', { name: 'COSCO AQUARIUS 085W 2026年船期' })).toHaveAttribute(
      'data-selected',
      'false'
    );
  });

  it.each([
    ['loading', '正在加载履约数据'],
    ['empty', '当前筛选没有数据'],
    ['failed', 'REQ-FIN-5001'],
    ['forbidden', '缺少权限 finance.charge.review'],
    ['stale', '本地版本 10 / 服务器版本 11'],
    ['partial', '成功 8 条，失败 2 条'],
  ] as const)('renders the %s state with a recovery explanation', (state, evidence) => {
    render(<FulfillmentFinanceWorkbench commandPort={successfulPort()} initialViewState={state} />);
    expect(screen.getByText((content) => content.includes(evidence))).toBeVisible();
  });

  it('dispatches dangerous unreview with reason, If-Match version and stable idempotency', async () => {
    const execute = vi.fn(async () => ({ auditId: 'AUD-FIN-0098' }));
    render(<FulfillmentFinanceWorkbench commandPort={{ execute }} initialSection="finance" />);

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
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledWith({
      domain: 'finance',
      operationId: 'unreviewCharge',
      entityRef: 'CHG-S2505120004',
      idempotencyKey: 'unreviewCharge:CHG-S2505120004:v11',
      expectedVersion: 11,
      payload: {
        reason: '承运商补传尾程费用',
        impact: '解锁账单 ST202605-0008 费用版本，要求重新检查支付分配与期间',
        auditDestination: 'audit://finance/charges/CHG-S2505120004',
      },
    });
    expect(screen.getByRole('status')).toHaveTextContent('反审核已提交 · 审计 AUD-FIN-0098');
  });

  it('executes WH-08, LM-05/06 and finance P0 workflows with visible resolved states', async () => {
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) => ({
      auditId: `AUD-${command.operationId}`,
    }));
    render(<FulfillmentFinanceWorkbench commandPort={{ execute }} />);

    fireEvent.click(screen.getByRole('button', { name: '打印交接单' }));
    await waitFor(() =>
      expect(screen.getByLabelText('WH-08 打印任务')).toHaveTextContent(
        '打印任务 PRINT-S2505120004 已排队'
      )
    );
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({ operationId: 'createPrintJob' })
    );

    fireEvent.click(screen.getByRole('button', { name: /干线尾程/ }));
    for (const [label, operationId] of [
      ['同步合作方', 'syncLastMilePartner'],
      ['重放事件', 'replayPartnerEvent'],
      ['生成尾程费用', 'generateLastMileCharges'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() =>
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ operationId }))
      );
    }
    expect(screen.getByLabelText('合作方同步状态')).toHaveTextContent('费用已生成');

    fireEvent.click(screen.getByRole('button', { name: /财务结算/ }));
    for (const [label, operationId] of [
      ['校验应付导入', 'validatePayableImport'],
      ['提交部分成功项', 'commitPayableImport'],
      ['执行应付对账', 'reconcilePayables'],
      ['分配付款', 'allocateDisbursement'],
      ['发起账单争议', 'openStatementDispute'],
      ['审批发票', 'reviewInvoiceRequest'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      await waitFor(() =>
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ operationId }))
      );
    }
    expect(screen.getByLabelText('财务流程状态')).toHaveTextContent('发票 INV-202607-018 已审批');
  });

  it('renders flow-specific linehaul branches and recovers without losing the workbench', () => {
    render(
      <FulfillmentFinanceWorkbench commandPort={successfulPort()} initialSection="linehaul" />
    );

    expect(screen.getByRole('combobox', { name: '业务流程' })).toHaveValue('F04');
    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'failed-incompatible' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('装载兼容性失败');
    expect(screen.getByText(/3 票运单不符合/)).toBeVisible();
    expect(screen.getByRole('button', { name: '下载失败报告' })).toBeEnabled();

    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'forbidden-release' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('缺少放货权限');
    expect(screen.getByText(/hold\.release/)).toBeVisible();
    expect(screen.queryByRole('button', { name: '确认放货' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '返回正常流程' }));
    expect(screen.getByRole('heading', { name: '干线与尾程履约' })).toBeVisible();
  });

  it('switches finance flows and preserves partial payable import recovery', () => {
    render(<FulfillmentFinanceWorkbench commandPort={successfulPort()} initialSection="finance" />);

    fireEvent.change(screen.getByRole('combobox', { name: '业务流程' }), {
      target: { value: 'F07' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'partial' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('部分提交');
    expect(screen.getByText(/成功 98 条，失败 2 条/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '只重试失败项' }));
    expect(screen.getByText('失败清单已保留，等待重新校验')).toBeVisible();
  });
});
