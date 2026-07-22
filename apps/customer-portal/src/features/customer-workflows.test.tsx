// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app';
import * as customerApi from '../api';

const billingWorkflowKey =
  'zhili.customer.tenant-xinyuan.customer-xinyuan.receipt:billing-workflow';

const paymentOrder = {
  id: '01JPAYMENT0000000000000001',
  paymentOrderNo: 'PAY-20260512-01',
  purpose: 'STATEMENT' as const,
  status: 'PENDING' as const,
  amount: { amount: '68420.00', currency: 'CNY' as const },
  paidAmount: { amount: '0.00', currency: 'CNY' as const },
  refundedAmount: { amount: '0.00', currency: 'CNY' as const },
  version: 1,
};

const allocationSnapshot: customerApi.ReceiptAllocationSnapshot = {
  receiptId: '01JRECEIPT0000000000000001',
  version: 1,
  total: '68420.00',
  allocated: '67820.00',
  unapplied: '600.00',
  matchedCount: 116,
  updatedAt: '2026-07-23T14:51:02.000Z',
  updatedBy: '支付对账服务',
  pendingItems: [
    { reference: 'SHP-20260708-141', reason: '缺少回单', amount: '320.00' },
    { reference: 'SHP-20260709-208', reason: '费用争议', amount: '280.00' },
  ],
};

const persistedPartialSession = () => ({
  schemaVersion: 1,
  step: 'partial',
  intent: {
    idempotencyKey: 'f1c-restored-intent',
    statementId: '01JSTATEMENT00000000000001',
    statementVersion: 1,
    amount: '68420.00',
  },
  paymentOrder: { ...paymentOrder, status: 'SUCCEEDED', version: 2 },
  receiptVersion: 1,
  allocation: structuredClone(allocationSnapshot),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function openPaymentConfirmation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '账单与付款' }));
  await user.click(screen.getByRole('button', { name: '查看账单 INV-202607-018' }));
  await user.click(screen.getByRole('button', { name: '立即支付' }));
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState({}, '', '/?mock=1');
  cleanup();
});

describe('Figma Customer 关键工作流', () => {
  it('F01 从新建运单连续完成地址、询价、报价和提交', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '快速新建运单' }));
    expect(screen.getByRole('heading', { name: '创建物流运单' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '选择地址' }));
    expect(screen.getByRole('heading', { name: '选择寄收件地址' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '查询报价' }));
    expect(await screen.findByRole('heading', { name: '选择承运商方案' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '提交运单' }));
    expect(await screen.findByRole('heading', { name: '运单创建成功' })).toBeVisible();
    expect(screen.getByText('S2505120006')).toBeVisible();
  });

  it('F03 补充异常资料后保留通知部分失败并可单独重试', async () => {
    const submitIssueEvidence = vi.spyOn(customerApi.customerPort, 'submitIssueEvidence');
    const evidence = new File(['real-gate-bytes'], 'gate-east.jpg', { type: 'image/jpeg' });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '问题件 17 较昨日 +3' }));
    expect(screen.getByRole('heading', { name: '待处理物流异常' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /EXC-24118/ }));
    await user.click(screen.getByRole('button', { name: '补充资料' }));
    await user.upload(screen.getByLabelText('入口照片'), evidence);
    await user.click(screen.getByRole('button', { name: '提交资料' }));

    expect(await screen.findByRole('heading', { name: '资料已提交，通知部分失败' })).toBeVisible();
    expect(submitIssueEvidence).toHaveBeenCalledWith(
      '01JISSUE00000000000000001',
      expect.objectContaining({
        file: evidence,
        contact: '李楠 139****8712',
        note: '东门货运通道 B3',
      })
    );
    expect(screen.getByText('PARTIAL · 1 个通知渠道待重试')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '仅重试失败通知' }));
    expect(await screen.findByText('所有通知渠道已送达')).toBeVisible();
  });

  it('F03 仅展示并重试服务端返回的非短信失败项', async () => {
    vi.spyOn(customerApi.customerPort, 'submitIssueEvidence').mockResolvedValueOnce({
      issueId: '01JISSUE00000000000000001',
      status: 'PARTIAL',
      version: 2,
      failedNotificationIds: ['notification-email'],
    });
    const retry = vi
      .spyOn(customerApi.customerPort, 'retryFailedNotifications')
      .mockResolvedValueOnce({ items: [{ id: 'notification-email', status: 'SUCCEEDED' }] });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '问题件 17 较昨日 +3' }));
    await user.click(screen.getByRole('button', { name: /EXC-24118/ }));
    await user.click(screen.getByRole('button', { name: '补充资料' }));
    await user.upload(
      screen.getByLabelText('入口照片'),
      new File(['email-proof'], 'email.jpg', { type: 'image/jpeg' })
    );
    await user.click(screen.getByRole('button', { name: '提交资料' }));

    expect((await screen.findAllByText(/notification-email/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/客户短信 · 失败/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '仅重试失败通知' }));
    expect(retry).toHaveBeenCalledWith(['notification-email']);
  });

  it('F03 对 PARTIAL 空失败项 fail closed', async () => {
    vi.spyOn(customerApi.customerPort, 'submitIssueEvidence').mockResolvedValueOnce({
      issueId: '01JISSUE00000000000000001',
      status: 'PARTIAL',
      version: 2,
      failedNotificationIds: [],
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '问题件 17 较昨日 +3' }));
    await user.click(screen.getByRole('button', { name: /EXC-24118/ }));
    await user.click(screen.getByRole('button', { name: '补充资料' }));
    await user.upload(
      screen.getByLabelText('入口照片'),
      new File(['invalid'], 'invalid.jpg', { type: 'image/jpeg' })
    );
    await user.click(screen.getByRole('button', { name: '提交资料' }));

    expect(await screen.findByRole('heading', { name: '资料暂未提交' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '仅重试失败通知' })).not.toBeInTheDocument();
  });

  it('F03 重试回执与失败项不一致时 fail closed', async () => {
    vi.spyOn(customerApi.customerPort, 'submitIssueEvidence').mockResolvedValueOnce({
      issueId: '01JISSUE00000000000000001',
      status: 'PARTIAL',
      version: 2,
      failedNotificationIds: ['notification-email'],
    });
    vi.spyOn(customerApi.customerPort, 'retryFailedNotifications').mockResolvedValueOnce({
      items: [{ id: 'notification-sms', status: 'SUCCEEDED' }],
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '问题件 17 较昨日 +3' }));
    await user.click(screen.getByRole('button', { name: /EXC-24118/ }));
    await user.click(screen.getByRole('button', { name: '补充资料' }));
    await user.upload(
      screen.getByLabelText('入口照片'),
      new File(['retry'], 'retry.jpg', { type: 'image/jpeg' })
    );
    await user.click(screen.getByRole('button', { name: '提交资料' }));
    await user.click(await screen.findByRole('button', { name: '仅重试失败通知' }));

    expect(screen.queryByText('所有通知渠道已送达')).not.toBeInTheDocument();
    expect(screen.getAllByText(/notification-email/).length).toBeGreaterThan(0);
  });

  it('F05 从轨迹停滞创建工单并完成关闭', async () => {
    const createTicket = vi.spyOn(customerApi.customerPort, 'createTicket');
    const resolveIssue = vi.spyOn(customerApi.customerPort, 'resolveIssue');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '轨迹查询' }));
    expect(screen.getByRole('heading', { name: '轨迹长时间未更新' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '创建工单' }));
    await user.clear(screen.getByLabelText('问题描述'));
    await user.type(screen.getByLabelText('问题描述'), '客户填写：请核实下一程装车和预计到达时间');
    await user.click(screen.getByRole('button', { name: '提交工单' }));
    expect(await screen.findByText('TKT-20260723-086')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '准备关闭' }));
    await user.click(screen.getByRole('button', { name: '确认关闭' }));
    expect(screen.getByRole('heading', { name: '轨迹问题已解决' })).toBeVisible();
    expect(createTicket).toHaveBeenCalledWith('客户填写：请核实下一程装车和预计到达时间');
    expect(resolveIssue).toHaveBeenCalledWith('01JISSUE00000000000000001', 1, '客户确认轨迹已恢复');
  });

  it('F06 支付后先部分核销，再处理并发刷新并完成全额核销', async () => {
    const createPayment = vi.spyOn(customerApi.customerPort, 'createPayment');
    const getPaymentOrder = vi.spyOn(customerApi.customerPort, 'getPaymentOrder');
    const getReceiptAllocation = vi.spyOn(customerApi.customerPort, 'getReceiptAllocation');
    const allocateReceipt = vi.spyOn(customerApi.customerPort, 'allocateReceipt');
    const refreshReceiptAllocation = vi.spyOn(customerApi.customerPort, 'refreshReceiptAllocation');
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '账单与付款' }));
    await user.click(screen.getByRole('button', { name: '查看账单 INV-202607-018' }));
    await user.click(screen.getByRole('button', { name: '立即支付' }));
    await user.click(screen.getByRole('button', { name: '确认付款' }));
    expect(await screen.findByRole('heading', { name: '支付订单已创建' })).toBeVisible();
    expect(screen.getAllByText('PENDING · 等待微信支付结果')).not.toHaveLength(0);
    expect(createPayment).toHaveBeenCalledWith(
      {
        statementId: '01JSTATEMENT00000000000001',
        statementVersion: 1,
        amount: '68420.00',
      },
      expect.stringMatching(/^f1c-/)
    );
    await user.click(screen.getByRole('button', { name: '查询支付结果' }));
    expect(await screen.findByText('PARTIAL · 已核销 ¥67,820.00，待分配 ¥600.00')).toBeVisible();
    expect(getPaymentOrder).toHaveBeenCalledWith('01JPAYMENT0000000000000001');
    expect(getReceiptAllocation).toHaveBeenCalledWith('01JRECEIPT0000000000000001');
    expect(screen.getByText(/SHP-20260708-141/)).toBeVisible();
    expect(screen.getByText('分配金额').closest('li')).toHaveAttribute('aria-current', 'step');

    await user.click(screen.getByRole('button', { name: '模拟并发更新' }));
    expect(screen.getByRole('heading', { name: '账单已被其他操作员更新' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '刷新数据' }));
    expect(refreshReceiptAllocation).toHaveBeenCalledWith(
      '01JRECEIPT0000000000000001',
      1,
      expect.stringMatching(/^f1c-/)
    );
    await user.click(screen.getByRole('button', { name: '分配剩余金额' }));
    expect(screen.getByRole('heading', { name: '账单已完成全额核销' })).toBeVisible();
    expect(allocateReceipt).toHaveBeenCalledWith(
      '01JRECEIPT0000000000000001',
      2,
      '01JSTATEMENT00000000000001',
      '600.00',
      expect.stringMatching(/^f1c-/)
    );
  });

  it('F06 识别真实状态码冲突并在页面切换后恢复 PENDING 支付', async () => {
    const allocateReceipt = vi
      .spyOn(customerApi.customerPort, 'allocateReceipt')
      .mockRejectedValueOnce(
        new customerApi.CustomerApiError(409, 'STALE_VERSION', '请求未完成，请刷新后重试')
      );
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '账单与付款' }));
    await user.click(screen.getByRole('button', { name: '查看账单 INV-202607-018' }));
    await user.click(screen.getByRole('button', { name: '立即支付' }));
    await user.click(screen.getByRole('button', { name: '确认付款' }));
    expect(await screen.findByRole('heading', { name: '支付订单已创建' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '工作台' }));
    await user.click(screen.getByRole('button', { name: '账单与付款' }));
    expect(screen.getByRole('heading', { name: '支付订单已创建' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '查询支付结果' }));
    await user.click(await screen.findByRole('button', { name: '分配剩余金额' }));

    expect(allocateReceipt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: '账单已被其他操作员更新' })).toBeVisible();
    expect(screen.getByRole('button', { name: '刷新数据' })).toBeEnabled();
  });

  it('F06 在请求前持久化 intent，同 tick 双击只创建一次且卸载后仍保存 PENDING', async () => {
    const pendingCreate = deferred<typeof paymentOrder>();
    const createPayment = vi
      .spyOn(customerApi.customerPort, 'createPayment')
      .mockReturnValueOnce(pendingCreate.promise);
    const user = userEvent.setup();
    render(<App />);
    await openPaymentConfirmation(user);

    const confirm = screen.getByRole('button', { name: '确认付款' });
    act(() => {
      confirm.click();
      confirm.click();
    });

    expect(createPayment).toHaveBeenCalledTimes(1);
    const [, intentKey] = createPayment.mock.calls[0] ?? [];
    expect(intentKey).toMatch(/^f1c-/);
    expect(JSON.parse(localStorage.getItem(billingWorkflowKey) ?? 'null')).toMatchObject({
      step: 'creating',
      intent: { idempotencyKey: intentKey },
      paymentOrder: null,
    });

    await user.click(screen.getByRole('button', { name: '工作台' }));
    await act(async () => pendingCreate.resolve(paymentOrder));
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(billingWorkflowKey) ?? 'null')).toMatchObject({
        step: 'pending',
        intent: { idempotencyKey: intentKey },
        paymentOrder: { id: paymentOrder.id, status: 'PENDING' },
      })
    );

    await user.click(screen.getByRole('button', { name: '账单与付款' }));
    expect(screen.getByRole('heading', { name: '支付订单已创建' })).toBeVisible();
  });

  it('F06 丢失创单回执后用同一 Idempotency-Key 恢复支付意图', async () => {
    const createPayment = vi
      .spyOn(customerApi.customerPort, 'createPayment')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(paymentOrder);
    const user = userEvent.setup();
    render(<App />);
    await openPaymentConfirmation(user);
    await user.click(screen.getByRole('button', { name: '确认付款' }));

    expect(await screen.findByRole('heading', { name: '支付结果待恢复' })).toBeVisible();
    const firstKey = createPayment.mock.calls[0]?.[1];
    await user.click(screen.getByRole('button', { name: '工作台' }));
    await user.click(screen.getByRole('button', { name: '账单与付款' }));

    expect(await screen.findByRole('heading', { name: '支付订单已创建' })).toBeVisible();
    expect(createPayment).toHaveBeenCalledTimes(2);
    expect(createPayment.mock.calls[1]?.[1]).toBe(firstKey);
  });

  it('F06 端口明确拒绝创单时清理 intent 并进入失败态', async () => {
    vi.spyOn(customerApi.customerPort, 'createPayment').mockRejectedValueOnce(
      new customerApi.CustomerApiError(422, 'PAYMENT_REJECTED', '付款意图被风控拒绝')
    );
    const user = userEvent.setup();
    render(<App />);
    await openPaymentConfirmation(user);
    await user.click(screen.getByRole('button', { name: '确认付款' }));

    expect(await screen.findByRole('heading', { name: '付款未完成' })).toBeVisible();
    expect(localStorage.getItem(billingWorkflowKey)).toBeNull();
    expect(screen.getByRole('button', { name: '重新支付' })).toBeEnabled();
  });

  it('F06 接受 OpenAPI 合法 CREATED 创单回执并进入等待态', async () => {
    vi.spyOn(customerApi.customerPort, 'createPayment').mockResolvedValueOnce({
      ...paymentOrder,
      status: 'CREATED',
    });
    const user = userEvent.setup();
    render(<App />);
    await openPaymentConfirmation(user);
    await user.click(screen.getByRole('button', { name: '确认付款' }));

    expect(await screen.findByRole('heading', { name: '支付订单已创建' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem(billingWorkflowKey) ?? 'null')).toMatchObject({
      step: 'pending',
      paymentOrder: { status: 'CREATED' },
    });
  });

  it('F06 拒绝 OpenAPI 不存在的 PROCESSING 缓存状态', async () => {
    localStorage.setItem(
      billingWorkflowKey,
      JSON.stringify({
        schemaVersion: 1,
        step: 'pending',
        intent: persistedPartialSession().intent,
        paymentOrder: { ...paymentOrder, status: 'PROCESSING' },
        receiptVersion: 1,
        allocation: null,
      })
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '账单与付款' }));

    expect(screen.getByRole('heading', { name: '待支付与待核销账单' })).toBeVisible();
    expect(localStorage.getItem(billingWorkflowKey)).toBeNull();
  });

  it('F06 查询、核销和刷新都拦截同 tick 重复操作', async () => {
    const paymentResult =
      deferred<Awaited<ReturnType<typeof customerApi.customerPort.getPaymentOrder>>>();
    const allocationResult =
      deferred<Awaited<ReturnType<typeof customerApi.customerPort.allocateReceipt>>>();
    const refreshResult = deferred<customerApi.ReceiptAllocationSnapshot>();
    vi.spyOn(customerApi.customerPort, 'getReceiptAllocation').mockResolvedValue(
      allocationSnapshot
    );
    const query = vi
      .spyOn(customerApi.customerPort, 'getPaymentOrder')
      .mockReturnValueOnce(paymentResult.promise);
    const allocate = vi
      .spyOn(customerApi.customerPort, 'allocateReceipt')
      .mockReturnValueOnce(allocationResult.promise);
    const refresh = vi
      .spyOn(customerApi.customerPort, 'refreshReceiptAllocation')
      .mockReturnValueOnce(refreshResult.promise);
    const user = userEvent.setup();
    render(<App />);
    await openPaymentConfirmation(user);
    await user.click(screen.getByRole('button', { name: '确认付款' }));

    const queryButton = await screen.findByRole('button', { name: '查询支付结果' });
    act(() => {
      queryButton.click();
      queryButton.click();
    });
    expect(query).toHaveBeenCalledTimes(1);
    await act(async () =>
      paymentResult.resolve({ ...paymentOrder, status: 'SUCCEEDED', version: 2 })
    );
    const allocateButton = await screen.findByRole('button', { name: '分配剩余金额' });
    act(() => {
      allocateButton.click();
      allocateButton.click();
    });
    expect(allocate).toHaveBeenCalledTimes(1);
    const allocateKey = allocate.mock.calls[0]?.[4];
    expect(allocateKey).toMatch(/^f1c-/);
    await act(async () =>
      allocationResult.reject(
        new customerApi.CustomerApiError(409, 'STALE_VERSION', '服务端版本已更新')
      )
    );

    const refreshButton = await screen.findByRole('button', { name: '刷新数据' });
    act(() => {
      refreshButton.click();
      refreshButton.click();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0]?.[2]).toMatch(/^f1c-/);
    await act(async () => refreshResult.resolve({ ...allocationSnapshot, version: 2 }));
  });

  it('F06 核销网络重试复用同一 Idempotency-Key', async () => {
    vi.spyOn(customerApi.customerPort, 'getReceiptAllocation').mockResolvedValue(
      allocationSnapshot
    );
    const allocate = vi
      .spyOn(customerApi.customerPort, 'allocateReceipt')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        id: '01JRECEIPT0000000000000001',
        total: { amount: '68420.00', currency: 'CNY' },
        allocated: { amount: '68420.00', currency: 'CNY' },
        unapplied: { amount: '0.00', currency: 'CNY' },
        refunded: { amount: '0.00', currency: 'CNY' },
        version: 2,
      });
    const user = userEvent.setup();
    render(<App />);
    await openPaymentConfirmation(user);
    await user.click(screen.getByRole('button', { name: '确认付款' }));
    await user.click(await screen.findByRole('button', { name: '查询支付结果' }));

    await user.click(await screen.findByRole('button', { name: '分配剩余金额' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '分配剩余金额' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '分配剩余金额' }));

    expect(allocate).toHaveBeenCalledTimes(2);
    expect(allocate.mock.calls[1]?.[4]).toBe(allocate.mock.calls[0]?.[4]);
  });

  it('F06 快照刷新网络重试复用同一 Idempotency-Key', async () => {
    vi.spyOn(customerApi.customerPort, 'getReceiptAllocation').mockResolvedValue(
      allocationSnapshot
    );
    const refresh = vi
      .spyOn(customerApi.customerPort, 'refreshReceiptAllocation')
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ...allocationSnapshot, version: 2 });
    const user = userEvent.setup();
    render(<App />);
    await openPaymentConfirmation(user);
    await user.click(screen.getByRole('button', { name: '确认付款' }));
    await user.click(await screen.findByRole('button', { name: '查询支付结果' }));
    await user.click(await screen.findByRole('button', { name: '模拟并发更新' }));

    await user.click(screen.getByRole('button', { name: '刷新数据' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新数据' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: '刷新数据' }));

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh.mock.calls[1]?.[2]).toBe(refresh.mock.calls[0]?.[2]);
  });

  it('F06 付款凭证同 tick 只上传一次，网络重试复用原 key', async () => {
    const firstUpload = deferred<void>();
    const upload = vi
      .spyOn(customerApi.customerPort, 'uploadReceipt')
      .mockReturnValueOnce(firstUpload.promise)
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '账单与付款' }));
    const file = new File(['receipt-real-bytes'], 'receipt.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('付款凭证'), file);

    const uploadButton = screen.getByRole('button', { name: '上传并关联凭证' });
    act(() => {
      uploadButton.click();
      uploadButton.click();
    });
    expect(upload).toHaveBeenCalledTimes(1);
    const uploadKey = upload.mock.calls[0]?.[1];
    expect(uploadKey).toMatch(/^f1c-/);
    await act(async () => firstUpload.reject(new TypeError('Failed to fetch')));
    await user.click(await screen.findByRole('button', { name: '上传并关联凭证' }));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1]?.[1]).toBe(uploadKey);
  });

  it('F06 坏 localStorage 会被删除且不能显示为权威快照', async () => {
    localStorage.setItem(
      billingWorkflowKey,
      JSON.stringify({
        step: 'partial',
        paymentOrder: {
          id: 'tampered',
          paymentOrderNo: 'PAY-TAMPERED',
          status: 'SUCCEEDED',
          version: 'bad',
        },
        receiptVersion: 99,
        allocation: null,
      })
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '账单与付款' }));

    expect(screen.getByRole('heading', { name: '待支付与待核销账单' })).toBeVisible();
    expect(screen.queryByText('以服务端权威核销快照为准')).not.toBeInTheDocument();
    expect(localStorage.getItem(billingWorkflowKey)).toBeNull();
  });

  it.each([
    {
      label: '支付状态与步骤不一致',
      mutate: (session: ReturnType<typeof persistedPartialSession>) => {
        session.paymentOrder.status = 'PENDING';
      },
    },
    {
      label: '支付版本非法',
      mutate: (session: ReturnType<typeof persistedPartialSession>) => {
        session.paymentOrder.version = 0;
      },
    },
    {
      label: '幂等键非法',
      mutate: (session: ReturnType<typeof persistedPartialSession>) => {
        session.intent.idempotencyKey = 'tampered';
      },
    },
    {
      label: '核销单不匹配',
      mutate: (session: ReturnType<typeof persistedPartialSession>) => {
        session.allocation.receiptId = 'wrong-receipt';
      },
    },
    {
      label: '快照版本不一致',
      mutate: (session: ReturnType<typeof persistedPartialSession>) => {
        session.receiptVersion = 2;
      },
    },
    {
      label: '资金不守恒',
      mutate: (session: ReturnType<typeof persistedPartialSession>) => {
        session.allocation.total = '68421.00';
      },
    },
    {
      label: '待分配明细不守恒',
      mutate: (session: ReturnType<typeof persistedPartialSession>) => {
        session.allocation.pendingItems[0]!.amount = '319.00';
      },
    },
  ])('F06 拒绝 $label 的本地会话', async ({ mutate }) => {
    const session = persistedPartialSession();
    mutate(session);
    localStorage.setItem(billingWorkflowKey, JSON.stringify(session));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '账单与付款' }));

    expect(screen.getByRole('heading', { name: '待支付与待核销账单' })).toBeVisible();
    expect(localStorage.getItem(billingWorkflowKey)).toBeNull();
  });

  it('F06 恢复 partial/conflict 时先校验服务端快照，不直接展示缓存', async () => {
    const snapshotRequest = deferred<customerApi.ReceiptAllocationSnapshot>();
    vi.spyOn(customerApi.customerPort, 'getReceiptAllocation').mockReturnValueOnce(
      snapshotRequest.promise
    );
    localStorage.setItem(billingWorkflowKey, JSON.stringify(persistedPartialSession()));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '账单与付款' }));

    expect(screen.getByRole('heading', { name: '正在恢复账单状态' })).toBeVisible();
    expect(screen.queryByText(/SHP-20260708-141/)).not.toBeInTheDocument();
    await act(async () => snapshotRequest.resolve({ ...allocationSnapshot, version: 2 }));
    expect(await screen.findByText(/SHP-20260708-141/)).toBeVisible();
    expect(JSON.parse(localStorage.getItem(billingWorkflowKey) ?? 'null')).toMatchObject({
      step: 'partial',
      receiptVersion: 2,
      allocation: { version: 2 },
    });
  });

  it('ACCOUNT 在地址簿、API 权限和安全设置之间形成真实入口', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '地址簿' }));
    expect(screen.getByRole('heading', { name: '企业常用地址' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '进入 API 接入' }));
    expect(screen.getByRole('heading', { name: '申请物流 API 权限' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '提交申请' }));
    expect(screen.getByRole('heading', { name: '无法提交生产环境申请' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '进入安全设置' }));
    const security = screen.getByRole('region', { name: '企业账户安全' });
    expect(within(security).getByText('企业安全评分 92 / 100')).toBeVisible();
  });

  it('只有 mock=1 使用浏览器内 mock，普通地址继续走真实 API transport', () => {
    const resolver = (
      customerApi as unknown as {
        resolveCustomerTransport?: (search: string, mode?: string) => typeof fetch | undefined;
      }
    ).resolveCustomerTransport;

    expect(resolver).toBeTypeOf('function');
    expect(resolver?.('?mock=1', 'production')).toBe(customerApi.customerMockFetch);
    expect(resolver?.('', 'production')).toBeUndefined();
  });

  it('生产界面不暴露演示状态或模拟失败按钮', async () => {
    const user = userEvent.setup();
    render(<App mockMode={false} />);

    expect(screen.queryByLabelText('演示状态')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '快速新建运单' }));
    expect(screen.queryByRole('button', { name: '模拟无权限' })).not.toBeInTheDocument();
  });
});
