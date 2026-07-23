import { expect, test } from '@playwright/test';

const paymentOrder = (status: 'PENDING' | 'SUCCEEDED') => ({
  data: {
    id: '01JPAYMENT0000000000000001',
    paymentOrderNo: 'PAY-20260723-AUTH',
    purpose: 'STATEMENT',
    status,
    amount: { amount: '68420.00', currency: 'CNY' },
    paidAmount: { amount: status === 'SUCCEEDED' ? '68420.00' : '0.00', currency: 'CNY' },
    refundedAmount: { amount: '0.00', currency: 'CNY' },
    version: status === 'SUCCEEDED' ? 2 : 1,
  },
  meta: { requestId: 'req-customer-authority', asOf: '2026-07-23T04:30:00.000Z' },
});

const snapshot = {
  data: {
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
  },
};

async function openPayment(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '账单与付款' }).click();
  await page.getByRole('button', { name: '查看账单 INV-202607-018' }).click();
  await page.getByRole('button', { name: '立即支付' }).click();
  await page.getByRole('button', { name: '确认付款' }).click();
}

test('服务端已按 key 提交但响应丢失后使用同 key恢复', async ({ page }) => {
  const keys: string[] = [];
  const committedByKey = new Map<string, object>();
  await page.route('**/api/v1/payments/statement-orders', async (route) => {
    const key = route.request().headers()['idempotency-key'] ?? '';
    keys.push(key);
    const committed = committedByKey.get(key) ?? paymentOrder('PENDING');
    committedByKey.set(key, committed);
    if (keys.length === 1) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(committed),
    });
  });

  await page.goto('/');
  await openPayment(page);
  await expect(page.getByRole('heading', { name: '支付结果待恢复' })).toBeVisible();
  await page.getByRole('button', { name: '工作台' }).click();
  await page.getByRole('button', { name: '账单与付款' }).click();
  await expect(page.getByRole('heading', { name: '支付订单已创建' })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^f1c-/);
  expect(keys[1]).toBe(keys[0]);
  expect(committedByKey.size).toBe(1);
});

for (const status of [409, 412] as const) {
  test(`生产 route 保留 HTTP ${status} 并进入核销冲突恢复`, async ({ page }) => {
    await page.route('**/api/v1/payments/statement-orders', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(paymentOrder('PENDING')),
      })
    );
    await page.route('**/api/v1/payments/01JPAYMENT0000000000000001', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(paymentOrder('SUCCEEDED')),
      })
    );
    await page.route('**/api/v1/portal/receipts/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(snapshot),
      })
    );
    await page.route('**/api/v1/finance/receipts/**', (route) =>
      route.fulfill({
        status,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          code: status === 409 ? 'CONFLICT' : 'STALE_VERSION',
          message: '服务端版本已更新',
          remediation: '刷新后重试',
        }),
      })
    );

    await page.goto('/');
    await openPayment(page);
    await page.getByRole('button', { name: '查询支付结果' }).click();
    await page.getByRole('button', { name: '分配剩余金额' }).click();
    await expect(page.getByRole('heading', { name: '账单已被其他操作员更新' })).toBeVisible();
    await expect(page.getByRole('button', { name: '刷新数据' })).toBeEnabled();
  });
}
