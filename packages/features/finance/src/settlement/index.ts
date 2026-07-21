import type { ZhiliApiClient } from '@zhili/api-client';
import type { paths } from '@zhili/contracts';

export interface ChargeSummary {
  salesCents: number;
  costCents: number;
  profitCents: number;
  marginPercent: number;
}

export function summarizeCharge(lineItemCents: number[], costCents: number): ChargeSummary {
  const salesCents = lineItemCents.reduce((total, amount) => total + amount, 0);
  const profitCents = salesCents - costCents;
  return {
    salesCents,
    costCents,
    profitCents,
    marginPercent: Math.round((profitCents / salesCents) * 10_000) / 100,
  };
}

export interface ReceiptBalance {
  receiptCents: number;
  alreadyAllocatedCents: number;
}

const formatCents = (cents: number) => (cents / 100).toFixed(2);

export function allocateReceipt(balance: ReceiptBalance, requestedCents: number) {
  const availableCents = balance.receiptCents - balance.alreadyAllocatedCents;
  if (requestedCents <= 0) throw new Error('核销金额必须大于 0');
  if (requestedCents > availableCents) {
    throw new Error(
      `核销金额 ${formatCents(requestedCents)} 超过可分配余额 ${formatCents(availableCents)}`
    );
  }
  return {
    allocatedCents: balance.alreadyAllocatedCents + requestedCents,
    unallocatedCents: availableCents - requestedCents,
  };
}

export type DangerousFinanceAction =
  'UNREVIEW_CHARGE' | 'REVERSE_ALLOCATION' | 'REFUND_PAYMENT' | 'REOPEN_PERIOD';

export interface DangerousFinanceCommand {
  action: DangerousFinanceAction;
  impact: string;
  reason: string;
  expectedVersion: number;
  auditDestination: `audit://${string}`;
}

export function buildDangerousFinanceCommand(
  command: DangerousFinanceCommand
): DangerousFinanceCommand & { confirmedAt: string } {
  if (!command.impact.trim()) throw new Error('必须说明业务影响');
  if (command.reason.trim().length < 5) throw new Error('操作原因至少 5 个字');
  if (command.expectedVersion < 1) throw new Error('必须使用有效资源版本');
  if (!command.auditDestination.startsWith('audit://')) throw new Error('必须指定审计去向');
  return { ...command, reason: command.reason.trim(), confirmedAt: new Date().toISOString() };
}

export const financeCapabilities = [
  { id: 'FIN-01', operationId: 'generateCharges', path: '/finance/charges:generate' },
  { id: 'FIN-02', operationId: 'reviewCharge', path: '/finance/charges/{chargeId}:review' },
  { id: 'FIN-02', operationId: 'unreviewCharge', path: '/finance/charges/{chargeId}:unreview' },
  { id: 'FIN-02', operationId: 'adjustCharge', path: '/finance/charges/{chargeId}:adjust' },
  { id: 'FIN-03', operationId: 'createPayableImport', path: '/finance/payable-imports' },
  {
    id: 'FIN-03',
    operationId: 'commitPayableImport',
    path: '/finance/payable-imports/{payableImportId}:commit',
  },
  { id: 'FIN-04', operationId: 'createStatement', path: '/finance/statements' },
  { id: 'FIN-04', operationId: 'sendStatement', path: '/finance/statements/{statementId}:send' },
  {
    id: 'PAY-02',
    operationId: 'createStatementPaymentOrder',
    path: '/payments/statement-orders',
  },
  { id: 'PAY-04', operationId: 'createPaymentRefund', path: '/payments/{paymentOrderId}/refunds' },
  { id: 'FIN-05', operationId: 'recordReceipt', path: '/finance/receipts' },
  { id: 'FIN-05', operationId: 'createDisbursement', path: '/finance/disbursements' },
  {
    id: 'FIN-06',
    operationId: 'allocateReceipt',
    path: '/finance/receipts/{receiptId}:allocate',
  },
  {
    id: 'FIN-06',
    operationId: 'reverseAllocation',
    path: '/finance/allocations/{allocationId}:reverse',
  },
  {
    id: 'FIN-07',
    operationId: 'publishExchangeRateSet',
    path: '/finance/exchange-rate-sets:publish',
  },
  { id: 'FIN-08', operationId: 'allocateCharges', path: '/finance/charges:allocate' },
  { id: 'FIN-08', operationId: 'getProfitTrace', path: '/finance/profit-traces/{waybillId}' },
  {
    id: 'FIN-09',
    operationId: 'closeFinancialPeriod',
    path: '/finance/periods/{periodId}:close',
  },
  {
    id: 'FIN-09',
    operationId: 'reopenFinancialPeriod',
    path: '/finance/periods/{periodId}:reopen',
  },
  { id: 'FIN-10', operationId: 'createInvoiceRequest', path: '/finance/invoice-requests' },
] as const satisfies ReadonlyArray<{ id: string; operationId: string; path: keyof paths }>;

export type UnreviewChargeBody =
  paths['/finance/charges/{chargeId}:unreview']['post']['requestBody']['content']['application/json'];

export function unreviewCharge(
  client: ZhiliApiClient,
  chargeId: string,
  body: UnreviewChargeBody,
  context: { idempotencyKey: string; expectedVersion: string }
) {
  return client.POST('/finance/charges/{chargeId}:unreview', {
    params: {
      path: { chargeId },
      header: {
        'Idempotency-Key': context.idempotencyKey,
        'If-Match': context.expectedVersion,
      },
    },
    body,
  });
}
