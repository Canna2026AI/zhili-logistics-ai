// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FulfillmentFinanceWorkbench,
  type FulfillmentFinanceCommand,
  type FulfillmentFinanceCommandPort,
  type FulfillmentFinanceCommandResult,
} from './fulfillment-finance-workbench';

afterEach(cleanup);

describe('fulfillment and finance workbench', () => {
  const audit = (auditId: string): FulfillmentFinanceCommandResult => ({
    evidence: { kind: 'audit', auditId },
  });
  const auditFor = (
    command: FulfillmentFinanceCommand,
    auditId = `AUD-${command.operationId}`
  ): FulfillmentFinanceCommandResult => ({
    evidence: { kind: 'audit', auditId },
    ...(command.expectedVersion === undefined
      ? {}
      : {
          resource: {
            id: command.entityRef,
            version: command.expectedVersion + 1,
          },
        }),
  });
  const successfulPort = (): FulfillmentFinanceCommandPort => ({
    execute: vi.fn(async (command: FulfillmentFinanceCommand) => auditFor(command)),
  });

  it('awaits the typed warehouse command before reporting success and auditing', async () => {
    let resolveCommand: ((value: FulfillmentFinanceCommandResult) => void) | undefined;
    const execute = vi.fn((command: FulfillmentFinanceCommand) => {
      void command;
      return new Promise<FulfillmentFinanceCommandResult>((resolve) => {
        resolveCommand = resolve;
      });
    });
    render(<FulfillmentFinanceWorkbench showScenarioControls commandPort={{ execute }} />);

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
        idempotencyKey: expect.stringMatching(/^confirmReceipt:RCV-S2505120004:v7:p[0-9a-f]{16}$/),
        expectedVersion: 7,
      })
    );

    resolveCommand?.(auditFor(execute.mock.calls[0]![0], 'AUD-WH-0001'));
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
        new Promise<FulfillmentFinanceCommandResult>((_resolve, reject) => {
          rejectCommand = reject;
        })
    );
    render(
      <FulfillmentFinanceWorkbench
        showScenarioControls
        commandPort={{ execute }}
        initialSection="tracking"
      />
    );

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
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) => auditFor(command));
    render(<FulfillmentFinanceWorkbench showScenarioControls commandPort={{ execute }} />);

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
    render(<FulfillmentFinanceWorkbench showScenarioControls commandPort={successfulPort()} />);
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
    render(<FulfillmentFinanceWorkbench showScenarioControls commandPort={port} />);

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
    render(
      <FulfillmentFinanceWorkbench
        showScenarioControls
        commandPort={successfulPort()}
        initialViewState={state}
      />
    );
    expect(screen.getByText((content) => content.includes(evidence))).toBeVisible();
  });

  it('dispatches dangerous unreview with reason, If-Match version and stable idempotency', async () => {
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) =>
      auditFor(command, 'AUD-FIN-0098')
    );
    render(
      <FulfillmentFinanceWorkbench
        showScenarioControls
        commandPort={{ execute }}
        initialSection="finance"
      />
    );

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
      idempotencyKey: expect.stringMatching(/^unreviewCharge:CHG-S2505120004:v11:p[0-9a-f]{16}$/),
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
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) => auditFor(command));
    render(<FulfillmentFinanceWorkbench showScenarioControls commandPort={{ execute }} />);

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

  it('requires a second confirmation before F04 dispatch and audits the exact command', async () => {
    let resolveCommand: ((value: FulfillmentFinanceCommandResult) => void) | undefined;
    const execute = vi.fn((command: FulfillmentFinanceCommand) => {
      void command;
      return new Promise<FulfillmentFinanceCommandResult>((resolve) => {
        resolveCommand = resolve;
      });
    });
    render(
      <FulfillmentFinanceWorkbench
        showScenarioControls
        commandPort={{ execute }}
        initialSection="linehaul"
      />
    );

    expect(screen.getByRole('combobox', { name: '业务流程' })).toHaveValue('F04');
    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'danger-dispatch' },
    });
    expect(screen.getByRole('button', { name: '确认出库' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '进入二次确认' }));
    const dialog = await screen.findByRole('dialog', { name: '出仓危险确认' });
    expect(dialog).toHaveTextContent('42 票 / 5,187.20 kg');
    expect(screen.getByRole('button', { name: '确认出库并记录审计' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: '已核对未关闭问题与打印清单' }));
    fireEvent.click(screen.getByRole('button', { name: '确认出库并记录审计' }));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      domain: 'linehaul',
      operationId: 'dispatchLoadUnit',
      entityRef: 'CNT-SZX-260722-01',
      idempotencyKey: expect.stringMatching(
        /^dispatchLoadUnit:CNT-SZX-260722-01:v4:p[0-9a-f]{16}$/
      ),
      expectedVersion: 4,
      payload: { confirmedIssues: 2, printedDocuments: 40 },
    });
    resolveCommand?.(auditFor(execute.mock.calls[0]![0], 'AUD-F04-DISPATCH'));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('审计 AUD-F04-DISPATCH')
    );
    expect(screen.getByText('审计事件').parentElement).toHaveTextContent('1');
  });

  it('gates F04 release and produces a real downloadable failure report', async () => {
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) =>
      auditFor(command, 'AUD-F04-APPROVAL')
    );
    render(
      <FulfillmentFinanceWorkbench
        showScenarioControls
        commandPort={{ execute }}
        initialSection="linehaul"
      />
    );
    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'failed-incompatible' },
    });
    fireEvent.click(screen.getByRole('button', { name: '下载失败报告' }));
    const report = await screen.findByRole('link', { name: '下载 load-compatibility-errors.csv' });
    expect(report).toHaveAttribute('download', 'load-compatibility-errors.csv');
    expect(screen.getByRole('status')).toHaveTextContent(/clientAction.*CLIENT-F04-REPORT/);

    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'forbidden-release' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('缺少放货权限');
    expect(screen.getByRole('button', { name: '确认出库' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '发起放货审批' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'tracking',
        operationId: 'requestShipmentHoldReleaseApproval',
        entityRef: '01JY8Z8F6ME4F0Y9QH2X6D4R7K',
        idempotencyKey: expect.stringMatching(
          /^requestShipmentHoldReleaseApproval:01JY8Z8F6ME4F0Y9QH2X6D4R7K:v2:p[0-9a-f]{16}$/
        ),
      })
    );
    expect(screen.getByRole('status')).toHaveTextContent('AUD-F04-APPROVAL');
  });

  it('executes F03 and F05 recovery through typed commands and preserves rejected state', async () => {
    const execute = vi.fn(
      async (command: FulfillmentFinanceCommand): Promise<FulfillmentFinanceCommandResult> => {
        if (command.operationId === 'attachReceiptMedia') {
          return auditFor(command, 'AUD-F03-MEDIA');
        }
        throw new Error('409 承运商版本冲突');
      }
    );
    render(<FulfillmentFinanceWorkbench showScenarioControls commandPort={{ execute }} />);

    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'failed-missing-evidence' },
    });
    fireEvent.click(screen.getByRole('button', { name: '补拍并重试' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenLastCalledWith({
      domain: 'warehouse',
      operationId: 'attachReceiptMedia',
      entityRef: 'RCV-S2505120004',
      idempotencyKey: expect.stringMatching(
        /^attachReceiptMedia:RCV-S2505120004:v7:p[0-9a-f]{16}$/
      ),
      expectedVersion: 7,
      payload: { evidenceTypes: ['CARTON_FRONT', 'WEIGHT_READING'], retry: true },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('AUD-F03-MEDIA');

    fireEvent.click(screen.getByRole('button', { name: /轨迹客服/ }));
    expect(screen.getByRole('combobox', { name: '业务流程' })).toHaveValue('F05');
    expect(screen.getByRole('combobox', { name: '流程状态' })).toHaveValue('normal');
    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'failed-carrier' },
    });
    fireEvent.click(screen.getByRole('button', { name: '立即重试' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('409 承运商版本冲突');
    expect(screen.getByRole('combobox', { name: '流程状态' })).toHaveValue('failed-carrier');
    expect(screen.getByText('审计事件').parentElement).toHaveTextContent('1');
  });

  it('routes partial notification retries for F03 and F05 through the audited notification command', async () => {
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) =>
      auditFor(command, `AUD-${command.entityRef}`)
    );
    render(<FulfillmentFinanceWorkbench showScenarioControls commandPort={{ execute }} />);
    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'partial-notify' },
    });
    fireEvent.click(screen.getByRole('button', { name: '重试通知' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operationId: 'retryNotificationDelivery',
        entityRef: 'NTF-260723-92',
        idempotencyKey: expect.stringMatching(
          /^retryNotificationDelivery:NTF-260723-92:v1:p[0-9a-f]{16}$/
        ),
      })
    );

    fireEvent.click(screen.getByRole('button', { name: /轨迹客服/ }));
    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'partial-notify' },
    });
    fireEvent.click(screen.getByRole('button', { name: '重试通知' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operationId: 'retryNotificationDelivery',
        entityRef: 'NTF-260723-91',
        idempotencyKey: expect.stringMatching(
          /^retryNotificationDelivery:NTF-260723-91:v1:p[0-9a-f]{16}$/
        ),
      })
    );
  });

  it('gates F06/F07 finance commands and resets state when switching flows', async () => {
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) => auditFor(command));
    render(
      <FulfillmentFinanceWorkbench
        showScenarioControls
        commandPort={{ execute }}
        initialSection="finance"
      />
    );

    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'stale-allocate' },
    });
    expect(screen.getByRole('button', { name: '核销' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '撤销核销' })).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox', { name: '业务流程' }), {
      target: { value: 'F07' },
    });
    expect(screen.getByRole('combobox', { name: '流程状态' })).toHaveValue('normal');
    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'forbidden-pay' },
    });
    expect(screen.getByRole('button', { name: '创建供应商付款' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '分配付款' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '校验应付导入' })).toBeEnabled();

    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'partial' },
    });
    fireEvent.click(screen.getByRole('button', { name: '只重试失败项' }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId: 'validatePayableImport',
          idempotencyKey: expect.stringMatching(
            /^validatePayableImport:PIMP-20260722-08:v1:p[0-9a-f]{16}$/
          ),
          payload: { failedOnly: true, rowIds: [99, 100] },
        })
      )
    );
    expect(screen.getByRole('status')).toHaveTextContent('AUD-validatePayableImport');

    fireEvent.change(screen.getByRole('combobox', { name: '业务流程' }), {
      target: { value: 'F06' },
    });
    expect(screen.getByRole('combobox', { name: '流程状态' })).toHaveValue('normal');
  });

  it('routes F06 danger unreview through an impact dialog and exact audited command', async () => {
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) =>
      auditFor(command, 'AUD-F06-UNREVIEW')
    );
    render(
      <FulfillmentFinanceWorkbench
        showScenarioControls
        commandPort={{ execute }}
        initialSection="finance"
      />
    );
    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'danger-unreview' },
    });
    expect(screen.getByRole('button', { name: '反审核' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '查看影响范围' }));
    const dialog = await screen.findByRole('dialog', { name: '反审核影响范围' });
    expect(dialog).toHaveTextContent('期间 2026-07 需要重算');
    fireEvent.change(screen.getByRole('textbox', { name: '场景反审核原因' }), {
      target: { value: '承运商补传费用后重算' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认反审核并记录审计' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'unreviewCharge',
        idempotencyKey: expect.stringMatching(/^unreviewCharge:CHG-S2505120004:v11:p[0-9a-f]{16}$/),
        payload: expect.objectContaining({ reason: '承运商补传费用后重算' }),
      })
    );
    expect(await screen.findByRole('status')).toHaveTextContent('AUD-F06-UNREVIEW');
  });

  it('prevents repeated danger submissions while pending and counts one server audit', async () => {
    let resolveCommand: ((value: FulfillmentFinanceCommandResult) => void) | undefined;
    const execute = vi.fn((command: FulfillmentFinanceCommand) => {
      void command;
      return new Promise<FulfillmentFinanceCommandResult>((resolve) => {
        resolveCommand = resolve;
      });
    });
    render(
      <FulfillmentFinanceWorkbench
        showScenarioControls
        commandPort={{ execute }}
        initialSection="linehaul"
      />
    );
    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'danger-dispatch' },
    });
    fireEvent.click(screen.getByRole('button', { name: '进入二次确认' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '已核对未关闭问题与打印清单' }));
    const confirm = screen.getByRole('button', { name: '确认出库并记录审计' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    resolveCommand?.(auditFor(execute.mock.calls[0]![0], 'AUD-ONE'));
    await waitFor(() => expect(screen.getByText('审计事件').parentElement).toHaveTextContent('1'));
  });

  it('does not count an idempotent server replay as a second audit event', async () => {
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) =>
      auditFor(command, 'AUD-createPrintJob-REPLAY')
    );
    render(<FulfillmentFinanceWorkbench showScenarioControls commandPort={{ execute }} />);
    const createPrintJob = screen.getByRole('button', { name: '打印交接单' });

    fireEvent.click(createPrintJob);
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    fireEvent.click(createPrintJob);
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));

    expect(screen.getByText('审计事件').parentElement).toHaveTextContent('1');
  });

  it('labels request evidence as tracking without incrementing the audit counter', async () => {
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) => ({
      evidence: { kind: 'trace' as const, requestId: 'REQ-WH-TRACE-1' },
      resource: {
        id: command.entityRef,
        version: (command.expectedVersion ?? 0) + 1,
      },
    }));
    render(<FulfillmentFinanceWorkbench showScenarioControls commandPort={{ execute }} />);

    fireEvent.click(screen.getByRole('button', { name: '确认收货' }));
    expect(await screen.findByRole('status')).toHaveTextContent('请求追踪 REQ-WH-TRACE-1');
    expect(screen.getByText('审计事件').parentElement).toHaveTextContent('0');
  });

  it('keeps a dangerous confirmation unresolved when a versioned receipt has no resource', async () => {
    const execute = vi.fn(async () => audit('AUD-MISSING-RESOURCE'));
    render(
      <FulfillmentFinanceWorkbench
        showScenarioControls
        commandPort={{ execute }}
        initialSection="linehaul"
      />
    );
    fireEvent.change(screen.getByRole('combobox', { name: '流程状态' }), {
      target: { value: 'danger-dispatch' },
    });
    fireEvent.click(screen.getByRole('button', { name: '进入二次确认' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '已核对未关闭问题与打印清单' }));

    fireEvent.click(screen.getByRole('button', { name: '确认出库并记录审计' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('资源回执');
    expect(screen.getByRole('dialog', { name: '出仓危险确认' })).toBeVisible();
    expect(screen.getByText('审计事件').parentElement).toHaveTextContent('0');
  });

  it('rejects a non-integer resource version before success and audit', async () => {
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) => ({
      evidence: { kind: 'audit' as const, auditId: 'AUD-FRACTIONAL-VERSION' },
      resource: { id: command.entityRef, version: 7.5 },
    }));
    render(<FulfillmentFinanceWorkbench showScenarioControls commandPort={{ execute }} />);

    fireEvent.click(screen.getByRole('button', { name: '确认收货' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('资源回执');
    expect(screen.getByText('审计事件').parentElement).toHaveTextContent('0');
  });

  it('uses an authoritative advanced receipt version for the next sequential command', async () => {
    const execute = vi.fn(async (next: FulfillmentFinanceCommand) => {
      if (next.operationId === 'recordMeasurement') {
        return {
          evidence: { kind: 'audit' as const, auditId: 'AUD-RCV-V8' },
          resource: { id: next.entityRef, version: 8 },
        } as unknown as FulfillmentFinanceCommandResult;
      }
      return auditFor(next);
    });
    render(<FulfillmentFinanceWorkbench showScenarioControls commandPort={{ execute }} />);

    fireEvent.click(screen.getByRole('button', { name: '记录测量' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '确认收货' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));

    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      entityRef: 'RCV-S2505120004',
      expectedVersion: 7,
    });
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      entityRef: 'RCV-S2505120004',
      expectedVersion: 8,
    });
  });

  it('refreshes a real linehaul 412 and retries dispatch with the authoritative version', async () => {
    const execute = vi.fn(async (command: FulfillmentFinanceCommand) => {
      if (execute.mock.calls.length === 1) {
        throw Object.assign(new Error('装载单已推进到版本 8'), {
          name: 'DomainApiError',
          status: 412,
          code: 'PRECONDITION_FAILED',
          requestId: 'REQ-LOAD-412',
        });
      }
      return auditFor(command, 'AUD-LOAD-RETRY-9');
    });
    const reloadResource = vi.fn(async () => ({
      evidence: { kind: 'trace' as const, requestId: 'REQ-LOAD-REFRESH-8' },
      resource: { id: 'CNT-SZX-260722-01', version: 8 },
    }));
    render(
      <FulfillmentFinanceWorkbench
        showScenarioControls
        commandPort={{ execute, reloadResource }}
        initialSection="linehaul"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '确认出库' }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '流程状态' })).toHaveValue('stale-load')
    );
    expect(screen.getByText('装载任务已被他人更新')).toBeVisible();
    expect(screen.getByRole('button', { name: '确认出库' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '刷新装载单版本' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: '流程状态' })).toHaveValue('normal')
    );
    expect(reloadResource).toHaveBeenCalledWith('CNT-SZX-260722-01');
    expect(screen.getByRole('button', { name: '确认出库' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '确认出库' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      operationId: 'dispatchLoadUnit',
      entityRef: 'CNT-SZX-260722-01',
      expectedVersion: 8,
      idempotencyKey: expect.stringMatching(
        /^dispatchLoadUnit:CNT-SZX-260722-01:v8:p[0-9a-f]{16}$/
      ),
    });
    expect(await screen.findByRole('status')).toHaveTextContent('AUD-LOAD-RETRY-9');
  });

  it('keeps F04 stale when the authoritative refresh fails', async () => {
    const execute = vi.fn(async () => {
      throw Object.assign(new Error('装载单版本冲突'), {
        name: 'DomainApiError',
        status: 412,
        code: 'PRECONDITION_FAILED',
      });
    });
    const reloadResource = vi.fn(async () => {
      throw new Error('刷新装载单失败');
    });
    render(
      <FulfillmentFinanceWorkbench
        showScenarioControls
        commandPort={{ execute, reloadResource }}
        initialSection="linehaul"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '确认出库' }));
    await screen.findByText('装载任务已被他人更新');
    fireEvent.click(screen.getByRole('button', { name: '刷新装载单版本' }));

    expect(await screen.findByText(/刷新装载单失败/)).toBeVisible();
    expect(screen.getByRole('combobox', { name: '流程状态' })).toHaveValue('stale-load');
    expect(screen.getByRole('button', { name: '确认出库' })).toBeDisabled();
  });

  it('binds idempotency keys to canonical payload intent', async () => {
    const module = await import('./fulfillment-command');
    const createFulfillmentCommand = (
      module as unknown as {
        createFulfillmentCommand?: (
          domain: 'warehouse',
          operationId: 'routeWaybill',
          entityRef: string,
          expectedVersion: number,
          payload: Record<string, unknown>
        ) => FulfillmentFinanceCommand;
      }
    ).createFulfillmentCommand;
    expect(createFulfillmentCommand).toBeTypeOf('function');
    if (!createFulfillmentCommand) return;

    const first = createFulfillmentCommand('warehouse', 'routeWaybill', 'S2505120004', 7, {
      route: 'COSCO AQUARIUS 085W',
      context: { lane: 'US-LAX', priority: 1 },
    });
    const sameIntent = createFulfillmentCommand('warehouse', 'routeWaybill', 'S2505120004', 7, {
      context: { priority: 1, lane: 'US-LAX' },
      route: 'COSCO AQUARIUS 085W',
    });
    const differentRoute = createFulfillmentCommand('warehouse', 'routeWaybill', 'S2505120004', 7, {
      route: 'EMC OAKLAND 082W',
      context: { lane: 'US-LAX', priority: 1 },
    });

    expect(first.idempotencyKey).toBe(sameIntent.idempotencyKey);
    expect(first.idempotencyKey).not.toBe(differentRoute.idempotencyKey);
  });
});
