import { useEffect, useState } from 'react';
import { Button, StatusTag } from '@zhili/ui';
import { CustomerApiError, customerPort, type ReceiptAllocationSnapshot } from '../../api';
import { SummaryItem, SummaryList, WorkflowShell, type WorkflowTone } from '../workflow-shell';

type BillingStep =
  'list' | 'detail' | 'pay' | 'pending' | 'partial' | 'conflict' | 'success' | 'failed';

type BillingFlowProps = {
  notify: (message: string) => void;
  receiptKey: string;
  mockMode?: boolean;
};

type PaymentOrder = {
  id: string;
  paymentOrderNo: string;
  status: string;
  version: number;
};

type BillingSession = {
  step: RecoverableBillingStep;
  paymentOrder: PaymentOrder;
  receiptVersion: number;
  allocation: ReceiptAllocationSnapshot | null;
};

type RecoverableBillingStep = Extract<BillingStep, 'pending' | 'partial' | 'conflict'>;
const recoverableSteps = new Set<RecoverableBillingStep>(['pending', 'partial', 'conflict']);
const isRecoverableStep = (step: BillingStep): step is RecoverableBillingStep =>
  recoverableSteps.has(step as RecoverableBillingStep);
const receiptId = '01JRECEIPT0000000000000001';

function readBillingSession(key: string): BillingSession | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(key) ?? 'null'
    ) as Partial<BillingSession> | null;
    if (
      !parsed ||
      !parsed.paymentOrder?.id ||
      !parsed.paymentOrder.paymentOrderNo ||
      !isRecoverableStep(parsed.step as BillingStep) ||
      !Number.isSafeInteger(parsed.receiptVersion) ||
      Number(parsed.receiptVersion) < 1
    )
      return null;
    return parsed as BillingSession;
  } catch {
    return null;
  }
}

const money = (value: string) =>
  `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const meta: Record<
  BillingStep,
  { title: string; description: string; active: number; tone: WorkflowTone; status: string }
> = {
  list: {
    title: '待支付与待核销账单',
    description: '统一管理月结账单、付款和运单核销。',
    active: 0,
    tone: 'primary',
    status: '正常 · 本月 2 张账单待处理',
  },
  detail: {
    title: 'INV-202607-018',
    description: '账期 2026-07-01 至 2026-07-15。',
    active: 0,
    tone: 'info',
    status: '正常 · 已完成账单对账',
  },
  pay: {
    title: '确认企业付款',
    description: '付款成功后可按运单明细分配核销。',
    active: 1,
    tone: 'info',
    status: '正常 · 支付风控校验通过',
  },
  pending: {
    title: '支付订单已创建',
    description: '微信支付结果以服务端权威状态为准，当前尚未入账。',
    active: 1,
    tone: 'info',
    status: 'PENDING · 等待微信支付结果',
  },
  partial: {
    title: '付款成功，部分金额待分配',
    description: '支付已确认，正在显示服务端权威核销快照。',
    active: 2,
    tone: 'warning',
    status: 'PARTIAL · 已核销 99.12%',
  },
  conflict: {
    title: '账单已被其他操作员更新',
    description: '陈思刚刚完成一笔核销，请刷新数据后继续。',
    active: 2,
    tone: 'warning',
    status: 'CONFLICT · 乐观锁已阻止重复核销',
  },
  success: {
    title: '账单已完成全额核销',
    description: '118 个运单与付款金额全部匹配。',
    active: 3,
    tone: 'success',
    status: '成功 · 账单余额为 ¥0.00',
  },
  failed: {
    title: '付款未完成',
    description: '银行风控拒绝本次大额支付。',
    active: 1,
    tone: 'danger',
    status: '失败 · 不会产生重复扣款',
  },
};

export function BillingFlow({ notify, receiptKey, mockMode = false }: BillingFlowProps) {
  const workflowKey = `${receiptKey}:billing-workflow`;
  const [restored] = useState(() => readBillingSession(workflowKey));
  const [step, setStep] = useState<BillingStep>(restored?.step ?? 'list');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptName, setReceiptName] = useState(() => localStorage.getItem(receiptKey) ?? '');
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(
    restored?.paymentOrder ?? null
  );
  const [receiptVersion, setReceiptVersion] = useState(restored?.receiptVersion ?? 1);
  const [allocation, setAllocation] = useState<ReceiptAllocationSnapshot | null>(
    restored?.allocation ?? null
  );
  const current = meta[step];

  useEffect(() => {
    if (paymentOrder && isRecoverableStep(step)) {
      localStorage.setItem(
        workflowKey,
        JSON.stringify({ step, paymentOrder, receiptVersion, allocation } satisfies BillingSession)
      );
    } else if (step === 'list' || step === 'success' || step === 'failed') {
      localStorage.removeItem(workflowKey);
    }
  }, [allocation, paymentOrder, receiptVersion, step, workflowKey]);

  const pay = async () => {
    setBusy(true);
    try {
      const created = await customerPort.createPayment({
        statementId: '01JSTATEMENT00000000000001',
        statementVersion: 1,
        amount: '68420.00',
      });
      setPaymentOrder(created);
      setStep('pending');
      notify(`支付订单已创建：${created.paymentOrderNo}，等待微信支付结果。`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '付款失败。');
      setStep('failed');
    } finally {
      setBusy(false);
    }
  };
  const refreshPayment = async () => {
    if (!paymentOrder) return;
    setBusy(true);
    try {
      const current = await customerPort.getPaymentOrder(paymentOrder.id);
      setPaymentOrder(current);
      if (current.status === 'SUCCEEDED') {
        const snapshot = await customerPort.getReceiptAllocation(receiptId);
        setAllocation(snapshot);
        setReceiptVersion(snapshot.version);
        setStep('partial');
        notify(`支付已由服务端确认：已自动核销 ${snapshot.matchedCount} 个运单。`);
      } else if (current.status === 'FAILED' || current.status === 'CLOSED') {
        setStep('failed');
        notify(`支付订单状态：${current.status}。`);
      } else {
        notify(`支付仍在处理中：${current.status}。`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '支付状态查询失败。');
    } finally {
      setBusy(false);
    }
  };
  const allocateRemaining = async () => {
    setBusy(true);
    try {
      await customerPort.allocateReceipt(
        receiptId,
        receiptVersion,
        '01JSTATEMENT00000000000001',
        '600.00'
      );
      setStep('success');
      notify('剩余金额已按服务端权威回执完成核销。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '核销失败。';
      notify(message);
      if (
        (error instanceof CustomerApiError && [409, 412].includes(error.status)) ||
        /409|412|冲突|版本|STALE/i.test(message)
      )
        setStep('conflict');
    } finally {
      setBusy(false);
    }
  };
  const refreshAllocation = async () => {
    setBusy(true);
    try {
      const refreshed = await customerPort.refreshReceiptAllocation(receiptId, receiptVersion);
      setReceiptVersion(refreshed.version);
      setAllocation(refreshed);
      setStep('partial');
      notify(`已刷新服务端核销版本 v${refreshed.version}，可安全重试。`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '刷新核销版本失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkflowShell
      code="F06 · 账单支付"
      title={current.title}
      description={
        step === 'partial' && allocation
          ? `${allocation.matchedCount} 个运单已自动匹配，${allocation.pendingItems.length} 个运单需人工确认。`
          : current.description
      }
      steps={['选择账单', '发起支付', '分配金额', '核销完成']}
      activeStep={current.active}
      panelTitle={
        step === 'list'
          ? '账单列表'
          : step === 'partial'
            ? '核销差异'
            : step === 'conflict'
              ? '版本差异'
              : '账单信息'
      }
      status={
        step === 'partial' && allocation
          ? `PARTIAL · 已核销 ${money(allocation.allocated)}，待分配 ${money(allocation.unapplied)}`
          : current.status
      }
      tone={current.tone}
      summaryTitle={step === 'conflict' ? '安全保护' : '资金状态'}
      summary={
        <SummaryList>
          {step === 'conflict' ? (
            <>
              <SummaryItem label="重复扣款" value="未发生" />
              <SummaryItem label="本地编辑" value="已保留" />
              <SummaryItem label="建议操作" value="刷新并重算" />
            </>
          ) : (
            <>
              <SummaryItem label="账单金额" value="¥68,420.00" />
              <SummaryItem
                label="已分配"
                value={
                  step === 'success'
                    ? '¥68,420.00'
                    : step === 'partial' && allocation
                      ? money(allocation.allocated)
                      : '¥0.00'
                }
              />
              <SummaryItem
                label="待分配"
                value={
                  step === 'success'
                    ? '¥0.00'
                    : step === 'partial' && allocation
                      ? money(allocation.unapplied)
                      : '¥68,420.00'
                }
              />
            </>
          )}
        </SummaryList>
      }
      actions={
        <>
          {step === 'list' ? <Button onClick={() => setStep('detail')}>打开账单详情</Button> : null}
          {step === 'detail' ? <Button onClick={() => setStep('pay')}>立即支付</Button> : null}
          {step === 'pay' ? (
            <>
              {mockMode ? (
                <Button variant="secondary" onClick={() => setStep('failed')}>
                  模拟支付失败
                </Button>
              ) : null}
              <Button disabled={busy} onClick={() => void pay()}>
                {busy ? '付款中…' : '确认付款'}
              </Button>
            </>
          ) : null}
          {step === 'pending' ? (
            <Button disabled={busy} onClick={() => void refreshPayment()}>
              {busy ? '查询中…' : '查询支付结果'}
            </Button>
          ) : null}
          {step === 'partial' ? (
            <>
              {mockMode ? (
                <Button variant="secondary" onClick={() => setStep('conflict')}>
                  模拟并发更新
                </Button>
              ) : null}
              <Button disabled={busy} onClick={() => void allocateRemaining()}>
                {busy ? '核销中…' : '分配剩余金额'}
              </Button>
            </>
          ) : null}
          {step === 'conflict' ? (
            <Button disabled={busy} onClick={() => void refreshAllocation()}>
              {busy ? '刷新中…' : '刷新数据'}
            </Button>
          ) : null}
          {step === 'failed' ? <Button onClick={() => setStep('pay')}>重新支付</Button> : null}
          {step === 'success' ? <Button onClick={() => setStep('list')}>查看账单</Button> : null}
        </>
      }
    >
      {step === 'list' ? (
        <div className="customer-billing-overview">
          <section className="portal-balance">
            <div>
              <span>预存款 CNY 128,560.00</span>
              <small>可用余额</small>
            </div>
            <div>
              <span>未分配收款 CNY 1,200.00</span>
              <small>待确认归属</small>
            </div>
            <div>
              <span>本期待付款 CNY 2,320.00</span>
              <small>ST202605-0008</small>
            </div>
          </section>
          <section className="customer-workflow__receipt">
            <label>
              付款凭证
              <input
                type="file"
                aria-label="付款凭证"
                accept="image/*,.pdf"
                onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
              />
            </label>
            <Button
              disabled={!receipt}
              onClick={() =>
                receipt &&
                void customerPort
                  .uploadReceipt(receipt.name)
                  .then(() => {
                    localStorage.setItem(receiptKey, receipt.name);
                    setReceiptName(receipt.name);
                    notify('付款凭证已关联至 ST202605-0008。');
                  })
                  .catch((error: Error) => notify(error.message))
              }
            >
              上传并关联凭证
            </Button>
            {receiptName ? <p>已关联凭证：{receiptName}</p> : null}
          </section>
          <div className="portal-table-wrap">
            <table aria-label="最近账单" className="portal-table">
              <thead>
                <tr>
                  <th>账单号</th>
                  <th>金额</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>INV-202607-018</td>
                  <td>¥68,420.00</td>
                  <td>
                    <StatusTag tone="warning">待支付</StatusTag>
                  </td>
                  <td>
                    <button aria-label="查看账单 INV-202607-018" onClick={() => setStep('detail')}>
                      查看
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="portal-table-wrap">
            <table aria-label="付款记录" className="portal-table">
              <thead>
                <tr>
                  <th>支付单号</th>
                  <th>账单号</th>
                  <th>金额</th>
                  <th>渠道</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {paymentOrder ? (
                  <tr>
                    <td>{paymentOrder.paymentOrderNo}</td>
                    <td>INV-202607-018</td>
                    <td>CNY 68,420.00</td>
                    <td>微信支付</td>
                    <td>
                      <StatusTag tone={paymentOrder.status === 'SUCCEEDED' ? 'success' : 'info'}>
                        {paymentOrder.status}
                      </StatusTag>
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={5}>确认付款后将在这里生成支付记录</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : step === 'detail' ? (
        <div className="customer-workflow__choice-list">
          <div>
            <strong>运费 · 118 单</strong>
            <span>¥62,180.00</span>
          </div>
          <div>
            <strong>附加服务 · 23 单</strong>
            <span>¥3,420.00</span>
          </div>
          <div>
            <strong>燃油附加</strong>
            <span>¥1,860.00</span>
          </div>
          <div>
            <strong>税费调整</strong>
            <span>¥960.00</span>
          </div>
        </div>
      ) : step === 'pay' ? (
        <div className="customer-workflow__choice-list">
          <div>
            <strong>付款账户 · 招商银行 尾号 8821</strong>
            <span>可用余额 ¥128,560.00</span>
          </div>
          <div>
            <strong>收款主体 · 智立科技物流有限公司</strong>
            <span>手续费 ¥0.00</span>
          </div>
        </div>
      ) : step === 'pending' ? (
        <div className="customer-workflow__result">
          <strong>{paymentOrder?.paymentOrderNo ?? '支付订单'}</strong>
          <p>{current.status}</p>
          <p>创建支付订单不会改变账单或余额，只有 SUCCEEDED 回执才会入账。</p>
        </div>
      ) : step === 'conflict' ? (
        <div className="customer-workflow__choice-list">
          <div>
            <strong>本地版本 · v{receiptVersion}</strong>
            <span>待分配 {allocation ? money(allocation.unapplied) : '等待刷新'}</span>
          </div>
          <div>
            <strong>服务端检测到更新</strong>
            <span>刷新后获取最新版本、操作人和核销明细</span>
          </div>
          <div>
            <strong>本地输入已保留</strong>
            <span>不会自动重试或重复扣款</span>
          </div>
        </div>
      ) : step === 'partial' ? (
        <div className="customer-workflow__choice-list">
          <div>
            <strong>自动匹配 · {allocation?.matchedCount ?? 0} 单</strong>
            <span>{allocation ? money(allocation.allocated) : '等待服务端核销快照'}</span>
          </div>
          {allocation?.pendingItems.map((item) => (
            <div key={item.reference}>
              <strong>
                {item.reference} · {item.reason}
              </strong>
              <span>{money(item.amount)}</span>
            </div>
          ))}
          {allocation ? (
            <p>
              权威版本 v{allocation.version} · {allocation.updatedBy} · {allocation.updatedAt}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="customer-workflow__result">
          <strong>{current.status}</strong>
          <p>{current.description}</p>
        </div>
      )}
    </WorkflowShell>
  );
}
