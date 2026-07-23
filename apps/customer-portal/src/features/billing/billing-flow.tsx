import { useEffect, useRef, useState } from 'react';
import { Button, StatusTag } from '@zhili/ui';
import {
  createCustomerIdempotencyKey,
  CustomerApiError,
  customerPort,
  type ReceiptAllocationSnapshot,
} from '../../api';
import type { CustomerBillingRecord } from '../../customer-records';
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
  records: CustomerBillingRecord[];
  mockMode?: boolean;
};

type PaymentOrder = {
  id: string;
  paymentOrderNo: string;
  purpose: 'STATEMENT';
  status: string;
  amount: { amount: string; currency: string };
  paidAmount: { amount: string; currency: string };
  refundedAmount: { amount: string; currency: string };
  version: number;
};

type PaymentIntent = {
  idempotencyKey: string;
  customerId: string;
  receiptId: string;
  statementId: string;
  statementVersion: number;
  amount: string;
  currency: string;
};

type BillingSession = {
  schemaVersion: 2;
  generation: number;
  step: PersistedBillingStep;
  intent: PaymentIntent;
  paymentOrder: PaymentOrder | null;
  receiptVersion: number;
  allocation: ReceiptAllocationSnapshot | null;
};

type BillingOperationIntent = {
  schemaVersion: 1;
  kind: 'allocate' | 'refresh' | 'upload';
  idempotencyKey: string;
  resource: string;
};

type PersistedBillingStep = Extract<BillingStep, 'creating' | 'pending' | 'partial' | 'conflict'>;
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

function recordForIntent(records: CustomerBillingRecord[], value: PaymentIntent) {
  return records.find(
    (record) =>
      record.customerId === value.customerId &&
      record.receiptId === value.receiptId &&
      record.statementId === value.statementId &&
      record.statementVersion === value.statementVersion &&
      record.amount === value.amount &&
      record.currency === value.currency
  );
}

function isPaymentIntent(value: unknown, records: CustomerBillingRecord[]): value is PaymentIntent {
  if (!isRecord(value)) return false;
  const valid =
    typeof value.idempotencyKey === 'string' &&
    /^f1c-[A-Za-z0-9-]{8,200}$/.test(value.idempotencyKey) &&
    typeof value.customerId === 'string' &&
    typeof value.receiptId === 'string' &&
    typeof value.statementId === 'string' &&
    Number.isSafeInteger(value.statementVersion) &&
    parseMoneyCents(value.amount) !== null &&
    typeof value.currency === 'string';
  return valid && Boolean(recordForIntent(records, value as PaymentIntent));
}

function isMoney(value: unknown, expectedCurrency?: string): value is PaymentOrder['amount'] {
  if (!isRecord(value) || parseMoneyCents(value.amount) === null) return false;
  return (
    typeof value.currency === 'string' &&
    value.currency.length === 3 &&
    (expectedCurrency === undefined || value.currency === expectedCurrency)
  );
}

function isPaymentOrder(value: unknown, intent?: PaymentIntent): value is PaymentOrder {
  if (!isRecord(value)) return false;
  const valid =
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.paymentOrderNo === 'string' &&
    value.paymentOrderNo.length > 0 &&
    value.purpose === 'STATEMENT' &&
    typeof value.status === 'string' &&
    paymentStatuses.has(value.status) &&
    isMoney(value.amount, intent?.currency) &&
    isMoney(value.paidAmount, intent?.currency) &&
    isMoney(value.refundedAmount, intent?.currency) &&
    Number.isSafeInteger(value.version) &&
    Number(value.version) >= 1;
  if (!valid) return false;
  const amount = parseMoneyCents((value.amount as PaymentOrder['amount']).amount)!;
  const paid = parseMoneyCents((value.paidAmount as PaymentOrder['amount']).amount)!;
  const refunded = parseMoneyCents((value.refundedAmount as PaymentOrder['amount']).amount)!;
  return (
    paid <= amount &&
    refunded <= paid &&
    (intent === undefined || (value.amount as PaymentOrder['amount']).amount === intent.amount)
  );
}

function isAllocationSnapshot(
  value: unknown,
  expectedReceiptId: string
): value is ReceiptAllocationSnapshot {
  if (!isRecord(value)) return false;
  const total = parseMoneyCents(value.total);
  const allocated = parseMoneyCents(value.allocated);
  const unapplied = parseMoneyCents(value.unapplied);
  if (
    value.receiptId !== expectedReceiptId ||
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

function isBillingSession(
  value: unknown,
  records: CustomerBillingRecord[]
): value is BillingSession {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !Number.isSafeInteger(value.generation) ||
    Number(value.generation) < 1 ||
    !isPaymentIntent(value.intent, records)
  )
    return false;
  if (
    !['creating', 'pending', 'partial', 'conflict'].includes(String(value.step)) ||
    !Number.isSafeInteger(value.receiptVersion) ||
    Number(value.receiptVersion) < 1
  )
    return false;
  if (value.step === 'creating')
    return value.paymentOrder === null && value.allocation === null && value.receiptVersion === 1;
  if (!isPaymentOrder(value.paymentOrder, value.intent)) return false;
  if (value.step === 'pending')
    return pendingPaymentStatuses.has(value.paymentOrder.status) && value.allocation === null;
  return (
    value.paymentOrder.status === 'SUCCEEDED' &&
    isAllocationSnapshot(value.allocation, value.intent.receiptId) &&
    value.receiptVersion === value.allocation.version
  );
}

function migrateLegacyBillingSession(
  value: unknown,
  records: CustomerBillingRecord[]
): BillingSession | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.intent)) return null;
  const legacyIntent = value.intent;
  if (
    typeof legacyIntent.idempotencyKey !== 'string' ||
    !/^f1c-[A-Za-z0-9-]{8,200}$/.test(legacyIntent.idempotencyKey) ||
    typeof legacyIntent.statementId !== 'string' ||
    !Number.isSafeInteger(legacyIntent.statementVersion) ||
    parseMoneyCents(legacyIntent.amount) === null
  )
    return null;

  const matchingRecords = records.filter(
    (record) =>
      record.statementId === legacyIntent.statementId &&
      record.statementVersion === legacyIntent.statementVersion &&
      record.amount === legacyIntent.amount &&
      (legacyIntent.customerId === undefined || legacyIntent.customerId === record.customerId) &&
      (legacyIntent.receiptId === undefined || legacyIntent.receiptId === record.receiptId) &&
      (legacyIntent.currency === undefined || legacyIntent.currency === record.currency)
  );
  if (matchingRecords.length !== 1) return null;
  const record = matchingRecords[0]!;
  const migrated: BillingSession = {
    schemaVersion: 2,
    generation:
      Number.isSafeInteger(value.generation) && Number(value.generation) >= 1
        ? Number(value.generation)
        : 1,
    step: value.step as PersistedBillingStep,
    intent: {
      idempotencyKey: legacyIntent.idempotencyKey,
      customerId: record.customerId,
      receiptId: record.receiptId,
      statementId: record.statementId,
      statementVersion: record.statementVersion,
      amount: record.amount,
      currency: record.currency,
    },
    paymentOrder: value.paymentOrder as PaymentOrder | null,
    receiptVersion: value.receiptVersion as number,
    allocation: value.allocation as ReceiptAllocationSnapshot | null,
  };
  return isBillingSession(migrated, records) ? migrated : null;
}

function readBillingSession(key: string, records: CustomerBillingRecord[]): BillingSession | null {
  const stored = localStorage.getItem(key);
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (isBillingSession(parsed, records)) return parsed;
    const migrated = migrateLegacyBillingSession(parsed, records);
    if (migrated) {
      localStorage.setItem(key, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // Invalid or truncated state must never be presented as authoritative.
  }
  localStorage.removeItem(key);
  return null;
}

const billingStepRank: Record<PersistedBillingStep, number> = {
  creating: 0,
  pending: 1,
  partial: 2,
  conflict: 2,
};

function persistBillingSession(
  key: string,
  session: BillingSession,
  records: CustomerBillingRecord[]
): boolean {
  const current = readBillingSession(key, records);
  if (
    current &&
    (current.intent.idempotencyKey !== session.intent.idempotencyKey ||
      current.generation > session.generation ||
      (current.generation === session.generation &&
        billingStepRank[current.step] > billingStepRank[session.step]))
  )
    return false;
  localStorage.setItem(key, JSON.stringify(session));
  return true;
}

function readOperationIntent(key: string, kind: BillingOperationIntent['kind'], resource: string) {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      isRecord(value) &&
      value.schemaVersion === 1 &&
      value.kind === kind &&
      value.resource === resource &&
      typeof value.idempotencyKey === 'string' &&
      /^f1c-[A-Za-z0-9-]{8,200}$/.test(value.idempotencyKey)
    )
      return value as BillingOperationIntent;
  } catch {
    // Invalid operation state is removed below.
  }
  localStorage.removeItem(key);
  return null;
}

function ensureOperationIntent(
  key: string,
  kind: BillingOperationIntent['kind'],
  resource: string
) {
  const restored = readOperationIntent(key, kind, resource);
  if (restored) return restored;
  const created: BillingOperationIntent = {
    schemaVersion: 1,
    kind,
    resource,
    idempotencyKey: createCustomerIdempotencyKey(),
  };
  localStorage.setItem(key, JSON.stringify(created));
  return created;
}

function operationIntentMatches(key: string, expected: BillingOperationIntent) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return (
      isRecord(value) &&
      value.schemaVersion === expected.schemaVersion &&
      value.kind === expected.kind &&
      value.resource === expected.resource &&
      value.idempotencyKey === expected.idempotencyKey
    );
  } catch {
    return false;
  }
}

function clearOperationIntent(key: string, expected: BillingOperationIntent) {
  if (!operationIntentMatches(key, expected)) return false;
  localStorage.removeItem(key);
  return true;
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

export function BillingFlow({ notify, receiptKey, records, mockMode = false }: BillingFlowProps) {
  const workflowKey = `${receiptKey}:billing-workflow`;
  const [restored] = useState(() => readBillingSession(workflowKey, records));
  const [selected, setSelected] = useState<CustomerBillingRecord>(() =>
    restored ? (recordForIntent(records, restored.intent) ?? records[0]!) : records[0]!
  );
  const receiptId = selected.receiptId;
  const statementId = selected.statementId;
  const statementVersion = selected.statementVersion;
  const statementAmount = selected.amount;
  const paymentRequest = {
    customerId: selected.customerId,
    statementId,
    statementVersion,
    amount: statementAmount,
    currency: selected.currency,
  } as const;
  const [step, setStep] = useState<BillingStep>(() => {
    if (!restored) return 'list';
    return 'recovering';
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
  const allocateOperationKey = `${workflowKey}:allocate`;
  const refreshOperationKey = `${workflowKey}:refresh`;
  const uploadOperationKey = `${workflowKey}:upload`;
  const current =
    step === 'detail'
      ? { ...meta.detail, title: selected.invoiceNo, description: `账期 ${selected.period}。` }
      : meta[step];

  const applySession = (session: BillingSession) => {
    if (!persistBillingSession(workflowKey, session, records)) return false;
    intentRef.current = session.intent;
    recoverySessionRef.current = session;
    if (mountedRef.current) {
      setIntent(session.intent);
      setPaymentOrder(session.paymentOrder);
      setReceiptVersion(session.receiptVersion);
      setAllocation(session.allocation);
      setStep(session.step);
    }
    return true;
  };

  const clearSession = (expected?: BillingSession) => {
    const currentSession = readBillingSession(workflowKey, records);
    if (
      expected &&
      currentSession &&
      (currentSession.intent.idempotencyKey !== expected.intent.idempotencyKey ||
        (currentSession.generation ?? 1) > (expected.generation ?? 1))
    )
      return false;
    localStorage.removeItem(workflowKey);
    intentRef.current = null;
    recoverySessionRef.current = null;
    if (mountedRef.current) {
      setIntent(null);
      setPaymentOrder(null);
      setReceiptVersion(1);
      setAllocation(null);
    }
    return true;
  };

  const executePaymentIntent = async (paymentIntent: PaymentIntent, recovering: boolean) => {
    if (pendingRef.current.has('create-payment')) return;
    pendingRef.current.add('create-payment');
    const creatingSession: BillingSession = {
      schemaVersion: 2,
      generation:
        recoverySessionRef.current?.intent.idempotencyKey === paymentIntent.idempotencyKey
          ? (recoverySessionRef.current.generation ?? 1) + 1
          : 1,
      step: 'creating',
      intent: paymentIntent,
      paymentOrder: null,
      receiptVersion: 1,
      allocation: null,
    };
    if (!persistBillingSession(workflowKey, creatingSession, records)) {
      pendingRef.current.delete('create-payment');
      return;
    }
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
      if (!isPaymentOrder(created, paymentIntent) || !pendingPaymentStatuses.has(created.status))
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
        clearSession(creatingSession);
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
    if (pendingRef.current.has('recover-snapshot')) return;
    pendingRef.current.add('recover-snapshot');
    if (mountedRef.current) {
      setStep('recovering');
      setBusy(true);
      setAllocation(null);
    }
    try {
      const authoritativeOrder = await customerPort.getPaymentOrder(session.paymentOrder!.id);
      if (
        !isPaymentOrder(authoritativeOrder, session.intent) ||
        authoritativeOrder.id !== session.paymentOrder!.id ||
        authoritativeOrder.paymentOrderNo !== session.paymentOrder!.paymentOrderNo ||
        authoritativeOrder.version < session.paymentOrder!.version
      )
        throw new Error('服务端支付订单校验失败，已拒绝展示缓存。');
      const generation = (session.generation ?? 1) + 1;
      if (pendingPaymentStatuses.has(authoritativeOrder.status)) {
        if (session.step !== 'pending')
          throw new Error('服务端支付状态与缓存核销步骤冲突，已拒绝展示缓存。');
        applySession({
          ...session,
          generation,
          step: 'pending',
          paymentOrder: authoritativeOrder,
          receiptVersion: 1,
          allocation: null,
        });
        if (mountedRef.current) notify('已用服务端权威支付订单恢复等待状态。');
      } else if (authoritativeOrder.status === 'SUCCEEDED') {
        const snapshot = await customerPort.getReceiptAllocation(receiptId);
        if (!isAllocationSnapshot(snapshot, receiptId))
          throw new Error('服务端核销快照校验失败，已拒绝展示缓存。');
        applySession({
          ...session,
          generation,
          step: 'partial',
          paymentOrder: authoritativeOrder,
          receiptVersion: snapshot.version,
          allocation: snapshot,
        });
        if (mountedRef.current) notify('已用服务端权威支付订单与核销快照恢复状态。');
      } else {
        clearSession(session);
        if (mountedRef.current) {
          setStep('failed');
          notify(`支付订单状态：${authoritativeOrder.status}。`);
        }
      }
    } catch (error) {
      if (error instanceof Error && /structure|invalid|校验/.test(error.message)) {
        clearSession(session);
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
    if (restored)
      queueMicrotask(() => {
        if (mountedRef.current) void recoverStoredSession(restored);
      });
    return () => {
      mountedRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- recover exactly the validated mount snapshot once

  const pay = async () => {
    const paymentIntent =
      intentRef.current ??
      ({
        ...paymentRequest,
        receiptId,
        idempotencyKey: createCustomerIdempotencyKey(),
      } satisfies PaymentIntent);
    await executePaymentIntent(paymentIntent, false);
  };

  const refreshPayment = async () => {
    const paymentIntent = intentRef.current;
    if (!paymentOrder || !paymentIntent || pendingRef.current.has('query-payment')) return;
    const sourceSession = recoverySessionRef.current;
    pendingRef.current.add('query-payment');
    setBusy(true);
    try {
      const current = await customerPort.getPaymentOrder(paymentOrder.id);
      if (
        !isPaymentOrder(current, paymentIntent) ||
        current.id !== paymentOrder.id ||
        current.paymentOrderNo !== paymentOrder.paymentOrderNo ||
        current.version < paymentOrder.version
      )
        throw new Error('支付状态回执结构无效。');
      if (current.status === 'SUCCEEDED') {
        const snapshot = await customerPort.getReceiptAllocation(receiptId);
        if (!isAllocationSnapshot(snapshot, receiptId)) throw new Error('服务端核销快照校验失败。');
        applySession({
          schemaVersion: 2,
          generation: (recoverySessionRef.current?.generation ?? 1) + 1,
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
        if (!sourceSession || clearSession(sourceSession)) {
          setStep('failed');
          notify(`支付订单状态：${current.status}。`);
        }
      } else {
        applySession({
          schemaVersion: 2,
          generation: (recoverySessionRef.current?.generation ?? 1) + 1,
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
    const sourceSession = recoverySessionRef.current;
    const resource = `${receiptId}:${receiptVersion}:${statementId}:${allocation.unapplied}`;
    const operation = ensureOperationIntent(allocateOperationKey, 'allocate', resource);
    setBusy(true);
    try {
      await customerPort.allocateReceipt(
        receiptId,
        receiptVersion,
        statementId,
        allocation.unapplied,
        operation.idempotencyKey
      );
      if (!clearOperationIntent(allocateOperationKey, operation)) return;
      if (!sourceSession || clearSession(sourceSession)) {
        setStep('success');
        notify('剩余金额已按服务端权威回执完成核销。');
      }
    } catch (error) {
      if (!operationIntentMatches(allocateOperationKey, operation)) return;
      const message = error instanceof Error ? error.message : '核销失败。';
      notify(message);
      if (error instanceof CustomerApiError && error.status >= 400 && error.status < 500)
        clearOperationIntent(allocateOperationKey, operation);
      if (
        (error instanceof CustomerApiError && [409, 412].includes(error.status)) ||
        /409|412|冲突|版本|STALE/i.test(message)
      ) {
        const conflictSession: BillingSession = {
          schemaVersion: 2,
          generation: (recoverySessionRef.current?.generation ?? 1) + 1,
          step: 'conflict',
          intent: paymentIntent,
          paymentOrder,
          receiptVersion,
          allocation,
        };
        applySession(conflictSession);
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
    const resource = `${receiptId}:${receiptVersion}`;
    const operation = ensureOperationIntent(refreshOperationKey, 'refresh', resource);
    setBusy(true);
    try {
      const refreshed = await customerPort.refreshReceiptAllocation(
        receiptId,
        receiptVersion,
        operation.idempotencyKey
      );
      if (!isAllocationSnapshot(refreshed, receiptId)) throw new Error('服务端核销快照校验失败。');
      if (!clearOperationIntent(refreshOperationKey, operation)) return;
      applySession({
        schemaVersion: 2,
        generation: (recoverySessionRef.current?.generation ?? 1) + 1,
        step: 'partial',
        intent: paymentIntent,
        paymentOrder,
        receiptVersion: refreshed.version,
        allocation: refreshed,
      });
      notify(`已刷新服务端核销版本 v${refreshed.version}，可安全重试。`);
    } catch (error) {
      if (!operationIntentMatches(refreshOperationKey, operation)) return;
      if (error instanceof CustomerApiError && error.status >= 400 && error.status < 500)
        clearOperationIntent(refreshOperationKey, operation);
      notify(error instanceof Error ? error.message : '刷新核销版本失败。');
    } finally {
      pendingRef.current.delete('refresh-allocation');
      setBusy(false);
    }
  };

  const simulateConflict = () => {
    if (!intent || !paymentOrder || !allocation) return;
    const session: BillingSession = {
      schemaVersion: 2,
      generation: (recoverySessionRef.current?.generation ?? 1) + 1,
      step: 'conflict',
      intent,
      paymentOrder,
      receiptVersion,
      allocation,
    };
    applySession(session);
  };

  const uploadReceipt = async () => {
    if (!receipt || pendingRef.current.has('upload-receipt')) return;
    pendingRef.current.add('upload-receipt');
    const resource = `${statementId}:${receipt.name}:${receipt.size}:${receipt.type}:${receipt.lastModified}`;
    const operation = ensureOperationIntent(uploadOperationKey, 'upload', resource);
    setReceiptBusy(true);
    try {
      await customerPort.uploadReceipt(receipt, selected.statementNo, operation.idempotencyKey);
      if (!clearOperationIntent(uploadOperationKey, operation)) return;
      localStorage.setItem(receiptKey, receipt.name);
      setReceiptName(receipt.name);
      setReceipt(null);
      notify(`付款凭证已关联至 ${selected.statementNo}。`);
    } catch (error) {
      if (!operationIntentMatches(uploadOperationKey, operation)) return;
      if (error instanceof CustomerApiError && error.status >= 400 && error.status < 500)
        clearOperationIntent(uploadOperationKey, operation);
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
              <SummaryItem label="账单金额" value={money(statementAmount)} />
              <SummaryItem
                label="已分配"
                value={
                  step === 'success'
                    ? money(statementAmount)
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
                      : money(statementAmount)
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
              <span>待支付账单 {records.length} 张</span>
              <small>当前客户数据边界</small>
            </div>
            <div>
              <span>
                待支付总额 {selected.currency}{' '}
                {records
                  .reduce((total, record) => total + Number(record.amount), 0)
                  .toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </span>
              <small>按可操作账单实时汇总</small>
            </div>
            <div>
              <span>当前账单 {selected.invoiceNo}</span>
              <small>{selected.statementNo}</small>
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
                  if (selected) {
                    const resource = `${statementId}:${selected.name}:${selected.size}:${selected.type}:${selected.lastModified}`;
                    ensureOperationIntent(uploadOperationKey, 'upload', resource);
                  }
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
                {records.map((record) => (
                  <tr key={record.statementId}>
                    <td>{record.invoiceNo}</td>
                    <td>{money(record.amount)}</td>
                    <td>
                      <StatusTag tone="warning">待支付</StatusTag>
                    </td>
                    <td>
                      <button
                        aria-label={`查看账单 ${record.invoiceNo}`}
                        onClick={() => {
                          setSelected(record);
                          setStep('detail');
                        }}
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
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
                    <td>{selected.invoiceNo}</td>
                    <td>
                      {selected.currency}{' '}
                      {Number(selected.amount).toLocaleString('zh-CN', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
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
