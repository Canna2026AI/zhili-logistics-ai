import { useEffect, useRef, useState } from 'react';
import { Button, StatusTag } from '@zhili/ui';
import {
  createCustomerIdempotencyKey,
  CustomerApiError,
  customerPort,
  type ReceiptAllocationSnapshot,
} from '../../api';
import { SummaryItem, SummaryList, WorkflowShell, type WorkflowTone } from '../workflow-shell';

type BillingStep =
  | 'list'
  | 'detail'
  | 'pay'
  | 'creating'
  | 'recovering'
  | 'pending'
  | 'partial'
  | 'conflict'
  | 'success'
  | 'failed';

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

type PaymentIntent = {
  idempotencyKey: string;
  statementId: string;
  statementVersion: number;
  amount: string;
};

type BillingSession = {
  schemaVersion: 1;
  step: PersistedBillingStep;
  intent: PaymentIntent;
  paymentOrder: PaymentOrder | null;
  receiptVersion: number;
  allocation: ReceiptAllocationSnapshot | null;
};

type PersistedBillingStep = Extract<BillingStep, 'creating' | 'pending' | 'partial' | 'conflict'>;
const receiptId = '01JRECEIPT0000000000000001';
const statementId = '01JSTATEMENT00000000000001';
const statementVersion = 1;
const statementAmount = '68420.00';
const paymentRequest = { statementId, statementVersion, amount: statementAmount } as const;
const paymentStatuses = new Set([
  'CREATED',
  'PENDING',
  'SUCCEEDED',
  'CLOSED',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);
const pendingPaymentStatuses = new Set(['CREATED', 'PENDING']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseMoneyCents(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)\.[0-9]{2}$/.test(value)) return null;
  const [whole, decimal] = value.split('.');
  return BigInt(whole ?? '0') * 100n + BigInt(decimal ?? '0');
}

function isPaymentIntent(value: unknown): value is PaymentIntent {
  if (!isRecord(value)) return false;
  return (
    typeof value.idempotencyKey === 'string' &&
    /^f1c-[A-Za-z0-9-]{8,200}$/.test(value.idempotencyKey) &&
    value.statementId === statementId &&
    value.statementVersion === statementVersion &&
    value.amount === statementAmount
  );
}

function isPaymentOrder(value: unknown): value is PaymentOrder {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.paymentOrderNo === 'string' &&
    value.paymentOrderNo.length > 0 &&
    typeof value.status === 'string' &&
    paymentStatuses.has(value.status) &&
    Number.isSafeInteger(value.version) &&
    Number(value.version) >= 1
  );
}

function isAllocationSnapshot(value: unknown): value is ReceiptAllocationSnapshot {
  if (!isRecord(value)) return false;
  const total = parseMoneyCents(value.total);
  const allocated = parseMoneyCents(value.allocated);
  const unapplied = parseMoneyCents(value.unapplied);
  if (
    value.receiptId !== receiptId ||
    !Number.isSafeInteger(value.version) ||
    Number(value.version) < 1 ||
    total === null ||
    allocated === null ||
    unapplied === null ||
    total !== allocated + unapplied ||
    !Number.isSafeInteger(value.matchedCount) ||
    Number(value.matchedCount) < 0 ||
    typeof value.updatedAt !== 'string' ||
    Number.isNaN(Date.parse(value.updatedAt)) ||
    typeof value.updatedBy !== 'string' ||
    value.updatedBy.trim().length === 0 ||
    !Array.isArray(value.pendingItems)
  )
    return false;
  let pendingTotal = 0n;
  const references = new Set<string>();
  for (const item of value.pendingItems) {
    if (!isRecord(item)) return false;
    const amount = parseMoneyCents(item.amount);
    if (
      typeof item.reference !== 'string' ||
      item.reference.trim().length === 0 ||
      references.has(item.reference) ||
      typeof item.reason !== 'string' ||
      item.reason.trim().length === 0 ||
      amount === null
    )
      return false;
    references.add(item.reference);
    pendingTotal += amount;
  }
  return pendingTotal === unapplied;
}

function isBillingSession(value: unknown): value is BillingSession {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isPaymentIntent(value.intent)) return false;
  if (
    !['creating', 'pending', 'partial', 'conflict'].includes(String(value.step)) ||
    !Number.isSafeInteger(value.receiptVersion) ||
    Number(value.receiptVersion) < 1
  )
    return false;
  if (value.step === 'creating')
    return value.paymentOrder === null && value.allocation === null && value.receiptVersion === 1;
  if (!isPaymentOrder(value.paymentOrder)) return false;
  if (value.step === 'pending')
    return pendingPaymentStatuses.has(value.paymentOrder.status) && value.allocation === null;
  return (
    value.paymentOrder.status === 'SUCCEEDED' &&
    isAllocationSnapshot(value.allocation) &&
    value.receiptVersion === value.allocation.version
  );
}

function readBillingSession(key: string): BillingSession | null {
  const stored = localStorage.getItem(key);
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (isBillingSession(parsed)) return parsed;
  } catch {
    // Invalid or truncated state must never be presented as authoritative.
  }
  localStorage.removeItem(key);
  return null;
}

const persistBillingSession = (key: string, session: BillingSession) =>
  localStorage.setItem(key, JSON.stringify(session));

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
  creating: {
    title: '支付结果待恢复',
    description: '支付意图已安全保存，可使用同一幂等键恢复服务端结果。',
    active: 1,
    tone: 'warning',
    status: 'CREATING · 未确认服务端回执，不会创建新意图',
  },
  recovering: {
    title: '正在恢复账单状态',
    description: '正在用已保存的支付意图或服务端快照校验最新状态。',
    active: 1,
    tone: 'info',
    status: 'RECOVERING · 恢复完成前禁止资金操作',
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
    status: 'PARTIAL · 以服务端核销快照为准',
  },
  conflict: {
    title: '账单已被其他操作员更新',
    description: '服务端版本发生变化，请刷新权威核销快照后继续。',
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
  const [step, setStep] = useState<BillingStep>(() => {
    if (!restored) return 'list';
    return restored.step === 'pending' ? 'pending' : 'recovering';
  });
  const [busy, setBusy] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptName, setReceiptName] = useState(() => localStorage.getItem(receiptKey) ?? '');
  const [intent, setIntent] = useState<PaymentIntent | null>(restored?.intent ?? null);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(
    restored?.paymentOrder ?? null
  );
  const [receiptVersion, setReceiptVersion] = useState(restored?.receiptVersion ?? 1);
  const [allocation, setAllocation] = useState<ReceiptAllocationSnapshot | null>(null);
  const mountedRef = useRef(true);
  const pendingRef = useRef(new Set<string>());
  const intentRef = useRef<PaymentIntent | null>(restored?.intent ?? null);
  const recoverySessionRef = useRef<BillingSession | null>(restored);
  const allocateKeyRef = useRef<string | null>(null);
  const refreshKeyRef = useRef<string | null>(null);
  const uploadKeyRef = useRef<string | null>(null);
  const current = meta[step];

  const applySession = (session: BillingSession) => {
    persistBillingSession(workflowKey, session);
    intentRef.current = session.intent;
    recoverySessionRef.current = session;
    if (mountedRef.current) {
      setIntent(session.intent);
      setPaymentOrder(session.paymentOrder);
      setReceiptVersion(session.receiptVersion);
      setAllocation(session.allocation);
      setStep(session.step);
    }
  };

  const clearSession = () => {
    localStorage.removeItem(workflowKey);
    intentRef.current = null;
    recoverySessionRef.current = null;
    if (mountedRef.current) {
      setIntent(null);
      setPaymentOrder(null);
      setReceiptVersion(1);
      setAllocation(null);
    }
  };

  const executePaymentIntent = async (paymentIntent: PaymentIntent, recovering: boolean) => {
    if (pendingRef.current.has('create-payment')) return;
    pendingRef.current.add('create-payment');
    const creatingSession: BillingSession = {
      schemaVersion: 1,
      step: 'creating',
      intent: paymentIntent,
      paymentOrder: null,
      receiptVersion: 1,
      allocation: null,
    };
    persistBillingSession(workflowKey, creatingSession);
    intentRef.current = paymentIntent;
    recoverySessionRef.current = creatingSession;
    if (mountedRef.current) {
      setIntent(paymentIntent);
      setPaymentOrder(null);
      setAllocation(null);
      setReceiptVersion(1);
      setStep(recovering ? 'recovering' : 'creating');
      setBusy(true);
    }
    try {
      const created = await customerPort.createPayment(
        paymentRequest,
        paymentIntent.idempotencyKey
      );
      if (!isPaymentOrder(created) || !pendingPaymentStatuses.has(created.status))
        throw new Error('支付创建回执结构无效，已保留支付意图。');
      const pendingSession: BillingSession = {
        ...creatingSession,
        step: 'pending',
        paymentOrder: created,
      };
      applySession(pendingSession);
      if (mountedRef.current)
        notify(`支付订单已创建：${created.paymentOrderNo}，等待微信支付结果。`);
    } catch (error) {
      const definitelyRejected =
        error instanceof CustomerApiError && error.status >= 400 && error.status < 500;
      if (definitelyRejected) {
        clearSession();
        if (mountedRef.current) setStep('failed');
      } else if (mountedRef.current) {
        setStep('creating');
      }
      if (mountedRef.current)
        notify(
          definitelyRejected
            ? error.message
            : '未收到支付创建回执；支付意图已保存，恢复时将复用同一幂等键。'
        );
    } finally {
      pendingRef.current.delete('create-payment');
      if (mountedRef.current) setBusy(false);
    }
  };

  const recoverStoredSession = async (session: BillingSession) => {
    if (session.step === 'creating') {
      await executePaymentIntent(session.intent, true);
      return;
    }
    if (session.step === 'pending') {
      applySession(session);
      return;
    }
    if (pendingRef.current.has('recover-snapshot')) return;
    pendingRef.current.add('recover-snapshot');
    if (mountedRef.current) {
      setStep('recovering');
      setBusy(true);
      setAllocation(null);
    }
    try {
      const snapshot = await customerPort.getReceiptAllocation(receiptId);
      if (!isAllocationSnapshot(snapshot))
        throw new Error('服务端核销快照校验失败，已拒绝展示缓存。');
      applySession({
        ...session,
        step: 'partial',
        receiptVersion: snapshot.version,
        allocation: snapshot,
      });
      if (mountedRef.current) notify('已用服务端权威快照恢复核销状态。');
    } catch (error) {
      if (error instanceof Error && /structure|invalid|校验/.test(error.message)) {
        clearSession();
        if (mountedRef.current) setStep('list');
      } else if (mountedRef.current) {
        setStep('recovering');
        notify(error instanceof Error ? error.message : '账单状态恢复失败。');
      }
    } finally {
      pendingRef.current.delete('recover-snapshot');
      if (mountedRef.current) setBusy(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    if (restored && restored.step !== 'pending') void recoverStoredSession(restored);
    return () => {
      mountedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- recover exactly the validated mount snapshot once

  const pay = async () => {
    const paymentIntent =
      intentRef.current ??
      ({
        ...paymentRequest,
        idempotencyKey: createCustomerIdempotencyKey(),
      } satisfies PaymentIntent);
    await executePaymentIntent(paymentIntent, false);
  };

  const refreshPayment = async () => {
    const paymentIntent = intentRef.current;
    if (!paymentOrder || !paymentIntent || pendingRef.current.has('query-payment')) return;
    pendingRef.current.add('query-payment');
    setBusy(true);
    try {
      const current = await customerPort.getPaymentOrder(paymentOrder.id);
      if (!isPaymentOrder(current)) throw new Error('支付状态回执结构无效。');
      if (current.status === 'SUCCEEDED') {
        const snapshot = await customerPort.getReceiptAllocation(receiptId);
        if (!isAllocationSnapshot(snapshot)) throw new Error('服务端核销快照校验失败。');
        applySession({
          schemaVersion: 1,
          step: 'partial',
          intent: paymentIntent,
          paymentOrder: current,
          receiptVersion: snapshot.version,
          allocation: snapshot,
        });
        notify(`支付已由服务端确认：已自动核销 ${snapshot.matchedCount} 个运单。`);
      } else if (
        current.status === 'FAILED' ||
        current.status === 'CLOSED' ||
        current.status === 'PARTIALLY_REFUNDED' ||
        current.status === 'REFUNDED'
      ) {
        clearSession();
        setStep('failed');
        notify(`支付订单状态：${current.status}。`);
      } else {
        applySession({
          schemaVersion: 1,
          step: 'pending',
          intent: paymentIntent,
          paymentOrder: current,
          receiptVersion: 1,
          allocation: null,
        });
        notify(`支付仍在处理中：${current.status}。`);
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : '支付状态查询失败。');
    } finally {
      pendingRef.current.delete('query-payment');
      setBusy(false);
    }
  };

  const allocateRemaining = async () => {
    const paymentIntent = intentRef.current;
    if (
      !paymentIntent ||
      !paymentOrder ||
      !allocation ||
      pendingRef.current.has('allocate-receipt')
    )
      return;
    pendingRef.current.add('allocate-receipt');
    allocateKeyRef.current ??= createCustomerIdempotencyKey();
    setBusy(true);
    try {
      await customerPort.allocateReceipt(
        receiptId,
        receiptVersion,
        statementId,
        allocation.unapplied,
        allocateKeyRef.current
      );
      allocateKeyRef.current = null;
      clearSession();
      setStep('success');
      notify('剩余金额已按服务端权威回执完成核销。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '核销失败。';
      notify(message);
      if (
        (error instanceof CustomerApiError && [409, 412].includes(error.status)) ||
        /409|412|冲突|版本|STALE/i.test(message)
      ) {
        allocateKeyRef.current = null;
        const conflictSession: BillingSession = {
          schemaVersion: 1,
          step: 'conflict',
          intent: paymentIntent,
          paymentOrder,
          receiptVersion,
          allocation,
        };
        persistBillingSession(workflowKey, conflictSession);
        recoverySessionRef.current = conflictSession;
        setStep('conflict');
      }
    } finally {
      pendingRef.current.delete('allocate-receipt');
      setBusy(false);
    }
  };

  const refreshAllocation = async () => {
    const paymentIntent = intentRef.current;
    if (!paymentIntent || !paymentOrder || pendingRef.current.has('refresh-allocation')) return;
    pendingRef.current.add('refresh-allocation');
    refreshKeyRef.current ??= createCustomerIdempotencyKey();
    setBusy(true);
    try {
      const refreshed = await customerPort.refreshReceiptAllocation(
        receiptId,
        receiptVersion,
        refreshKeyRef.current
      );
      if (!isAllocationSnapshot(refreshed)) throw new Error('服务端核销快照校验失败。');
      refreshKeyRef.current = null;
      applySession({
        schemaVersion: 1,
        step: 'partial',
        intent: paymentIntent,
        paymentOrder,
        receiptVersion: refreshed.version,
        allocation: refreshed,
      });
      notify(`已刷新服务端核销版本 v${refreshed.version}，可安全重试。`);
    } catch (error) {
      notify(error instanceof Error ? error.message : '刷新核销版本失败。');
    } finally {
      pendingRef.current.delete('refresh-allocation');
      setBusy(false);
    }
  };

  const simulateConflict = () => {
    if (!intent || !paymentOrder || !allocation) return;
    const session: BillingSession = {
      schemaVersion: 1,
      step: 'conflict',
      intent,
      paymentOrder,
      receiptVersion,
      allocation,
    };
    persistBillingSession(workflowKey, session);
    recoverySessionRef.current = session;
    setStep('conflict');
  };

  const uploadReceipt = async () => {
    if (!receipt || pendingRef.current.has('upload-receipt')) return;
    pendingRef.current.add('upload-receipt');
    uploadKeyRef.current ??= createCustomerIdempotencyKey();
    setReceiptBusy(true);
    try {
      await customerPort.uploadReceipt(receipt, uploadKeyRef.current);
      localStorage.setItem(receiptKey, receipt.name);
      setReceiptName(receipt.name);
      setReceipt(null);
      uploadKeyRef.current = null;
      notify('付款凭证已关联至 ST202605-0008。');
    } catch (error) {
      notify(error instanceof Error ? error.message : '付款凭证上传失败。');
    } finally {
      pendingRef.current.delete('upload-receipt');
      setReceiptBusy(false);
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
          {step === 'creating' ? (
            <Button
              disabled={busy || !intent}
              onClick={() => intent && void executePaymentIntent(intent, true)}
            >
              {busy ? '恢复中…' : '恢复支付意图'}
            </Button>
          ) : null}
          {step === 'recovering' ? (
            <Button
              disabled={busy}
              onClick={() =>
                recoverySessionRef.current && void recoverStoredSession(recoverySessionRef.current)
              }
            >
              {busy ? '恢复中…' : '重试恢复'}
            </Button>
          ) : null}
          {step === 'pending' ? (
            <Button disabled={busy} onClick={() => void refreshPayment()}>
              {busy ? '查询中…' : '查询支付结果'}
            </Button>
          ) : null}
          {step === 'partial' ? (
            <>
              {mockMode ? (
                <Button variant="secondary" onClick={simulateConflict}>
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
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setReceipt(selected);
                  uploadKeyRef.current = selected ? createCustomerIdempotencyKey() : null;
                }}
              />
            </label>
            <Button disabled={!receipt || receiptBusy} onClick={() => void uploadReceipt()}>
              {receiptBusy ? '上传中…' : '上传并关联凭证'}
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
