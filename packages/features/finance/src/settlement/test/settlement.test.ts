import { describe, expect, it } from 'vitest';
import { createZhiliClient } from '@zhili/api-client';
import {
  allocateReceipt,
  buildDangerousFinanceCommand,
  financeCapabilities,
  summarizeCharge,
  unreviewCharge,
} from '../index';

describe('finance settlement', () => {
  it('keeps canonical charge, payment and profit arithmetic exact in cents', () => {
    expect(summarizeCharge([468000, 51480, 8000, 4520], 458050)).toEqual({
      salesCents: 532000,
      costCents: 458050,
      profitCents: 73950,
      marginPercent: 13.9,
    });
    expect(allocateReceipt({ receiptCents: 300000, alreadyAllocatedCents: 0 }, 300000)).toEqual({
      allocatedCents: 300000,
      unallocatedCents: 0,
    });
  });

  it('rejects allocations that break the cash conservation invariant', () => {
    expect(() =>
      allocateReceipt({ receiptCents: 250000, alreadyAllocatedCents: 230000 }, 50000)
    ).toThrow('核销金额 500.00 超过可分配余额 200.00');
  });

  it('requires impact, reason, version and audit destination for dangerous commands', () => {
    expect(() =>
      buildDangerousFinanceCommand({
        action: 'UNREVIEW_CHARGE',
        impact: '会解锁账单 ST202605-0008 的费用版本',
        reason: '调整',
        expectedVersion: 11,
        auditDestination: 'audit://finance/charges/CHG-S2505120004',
      })
    ).toThrow('操作原因至少 5 个字');

    expect(
      buildDangerousFinanceCommand({
        action: 'UNREVIEW_CHARGE',
        impact: '会解锁账单 ST202605-0008 的费用版本',
        reason: '承运商补传尾程费用',
        expectedVersion: 11,
        auditDestination: 'audit://finance/charges/CHG-S2505120004',
      })
    ).toMatchObject({ reason: '承运商补传尾程费用', expectedVersion: 11 });
  });

  it('publishes the complete logistics finance contract surface', () => {
    expect(financeCapabilities.map((item) => item.operationId)).toEqual(
      expect.arrayContaining([
        'generateCharges',
        'reviewCharge',
        'unreviewCharge',
        'createStatement',
        'createStatementPaymentOrder',
        'createPaymentRefund',
        'recordReceipt',
        'allocateReceipt',
        'reverseAllocation',
        'publishExchangeRateSet',
        'allocateCharges',
        'getProfitTrace',
        'closeFinancialPeriod',
        'reopenFinancialPeriod',
        'createInvoiceRequest',
      ])
    );
  });

  it('sends dangerous unreview with idempotency and optimistic version headers', async () => {
    let captured: Request | undefined;
    const client = createZhiliClient({
      baseUrl: 'https://api.zhili.test/v1',
      fetch: async (input, init) => {
        captured = new Request(input, init);
        return new Response(
          JSON.stringify({
            data: { resourceId: 'CHG-S2505120004', status: 'DRAFT', version: 12 },
            meta: { requestId: 'REQ-FIN-UNREVIEW-1' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    });

    await unreviewCharge(
      client,
      'CHG-S2505120004',
      { reason: '承运商补传尾程费用', impact: '重新检查账单与核销', version: 11 },
      { idempotencyKey: 'unreview:CHG-S2505120004:v11', expectedVersion: '11' }
    );

    expect(captured?.url).toBe(
      'https://api.zhili.test/v1/finance/charges/CHG-S2505120004:unreview'
    );
    expect(captured?.headers.get('Idempotency-Key')).toBe('unreview:CHG-S2505120004:v11');
    expect(captured?.headers.get('If-Match')).toBe('11');
  });
});
