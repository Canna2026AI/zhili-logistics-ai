import { createZhiliClient } from '@zhili/api-client';

const meta = { requestId: 'req-f1c-customer', asOf: '2026-07-22T00:00:00.000Z' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ETag: '"1"' },
  });

const mockFetch: typeof fetch = async (input) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = new URL(raw, window.location.origin).pathname;
  if (path.endsWith('/orders'))
    return json(
      {
        data: {
          id: '01JORDER000000000000000006',
          orderNo: 'S2505120006',
          status: 'SUBMITTED',
          version: 1,
        },
        meta,
      },
      201
    );
  if (path.endsWith('/payments/statement-orders'))
    return json(
      {
        data: {
          id: '01JPAYMENT0000000000000001',
          paymentOrderNo: 'PAY-20260512-01',
          purpose: 'STATEMENT',
          status: 'PENDING',
          amount: { amount: '2320.00', currency: 'CNY' },
          paidAmount: { amount: '0.00', currency: 'CNY' },
          refundedAmount: { amount: '0.00', currency: 'CNY' },
          version: 1,
        },
        meta,
      },
      201
    );
  if (path.endsWith('/imports'))
    return json(
      {
        data: {
          id: '01JIMPORT0000000000000001',
          status: 'COMPLETED',
          totalRows: 1,
          validRows: 1,
          invalidRows: 0,
          version: 1,
        },
        meta,
      },
      202
    );
  if (path.endsWith('/issues'))
    return json(
      {
        data: {
          id: '01JISSUE00000000000000001',
          issueNo: 'T250512009',
          status: 'OPEN',
          visibility: 'CUSTOMER',
          version: 1,
        },
        meta,
      },
      201
    );
  return json({
    data: { resourceId: '01JCOMMAND000000000000001', status: 'SUCCEEDED', version: 1 },
    meta,
  });
};

const client = createZhiliClient({ baseUrl: 'http://localhost/api/v1', fetch: mockFetch });
const key = () => `f1c-${crypto.randomUUID?.() ?? Date.now()}`;

function ensure<T>(data: T | undefined, error: unknown): T {
  if (!data || error) throw new Error('业务服务暂时不可用，请保留输入后重试。');
  return data;
}

export const customerPort = {
  async createOrder() {
    const response = await client.POST('/orders', {
      params: { header: { 'Idempotency-Key': key() } },
      body: {
        orderType: 'STANDARD',
        customerId: '01JCUSTOMER000000000000001',
        origin: { countryCode: 'CN', city: '深圳', line1: '南山仓', postalCode: '518000' },
        destination: { countryCode: 'US', city: 'Los Angeles', line1: 'LAX', postalCode: '90001' },
        packages: [
          {
            packageRef: 'PKG-001',
            weightKg: '123.50',
            lengthCm: '80',
            widthCm: '60',
            heightCm: '100',
          },
        ],
      },
    });
    return ensure(response.data, response.error).data;
  },
  async createPayment() {
    const response = await client.POST('/payments/statement-orders', {
      params: { header: { 'Idempotency-Key': key() } },
      body: {
        customerId: '01JCUSTOMER000000000000001',
        statementId: '01JSTATEMENT00000000000001',
        statementVersion: 1,
        amount: { amount: '2320.00', currency: 'CNY' },
        paymentMethod: 'WECHAT_PAY',
      },
    });
    return ensure(response.data, response.error).data;
  },
  async createImport(fileName: string) {
    const response = await client.POST('/imports', {
      params: { header: { 'Idempotency-Key': key() } },
      body: { domain: 'ORDERS', sourceFileRef: fileName, atomicity: 'ALLOW_PARTIAL' },
    });
    return ensure(response.data, response.error).data;
  },
  async saveAddress(name: string) {
    const response = await client.POST('/customers/{customerId}/addresses:upsert', {
      params: {
        path: { customerId: '01JCUSTOMER000000000000001' },
        header: { 'Idempotency-Key': key(), 'If-Match': '"1"' },
      },
      body: {
        id: '01JCUSTOMER000000000000001',
        name,
        customerCode: 'XINYUAN',
        status: 'ACTIVE',
        version: 1,
      },
    });
    ensure(response.data, response.error);
  },
  async uploadReceipt(fileName: string) {
    const response = await client.POST('/warehouse/receipts/{receiptId}/media', {
      params: {
        path: { receiptId: '01JRECEIPT000000000000001' },
        header: { 'Idempotency-Key': key(), 'If-Match': '"1"' },
      },
      body: { kind: 'PAYMENT_VOUCHER', fileName, statementNo: 'ST202605-0008' },
    });
    ensure(response.data, response.error);
  },
  async createTicket(title: string) {
    const response = await client.POST('/issues', {
      params: { header: { 'Idempotency-Key': key() } },
      body: {
        waybillId: '01JWAYBILL000000000000001',
        type: 'TRACKING_STALL',
        title,
        visibility: 'CUSTOMER',
        priority: 'NORMAL',
      },
    });
    return ensure(response.data, response.error).data;
  },
  async requestApi() {
    const response = await client.POST('/portal/api-access-requests', {
      params: { header: { 'Idempotency-Key': key(), 'If-Match': '"1"' } },
      body: { scopes: ['waybill.read'], purpose: '企业 ERP 对接' },
    });
    ensure(response.data, response.error);
  },
  async saveDraft() {
    const response = await client.POST('/orders', {
      params: { header: { 'Idempotency-Key': key() } },
      body: {
        orderType: 'STANDARD',
        customerId: '01JCUSTOMER000000000000001',
        origin: { countryCode: 'CN', city: '深圳', line1: '南山仓', postalCode: '518000' },
        destination: { countryCode: 'US', city: 'Los Angeles', line1: 'LAX', postalCode: '90001' },
        packages: [
          { packageRef: 'DRAFT', weightKg: '1', lengthCm: '1', widthCm: '1', heightCm: '1' },
        ],
      },
    });
    ensure(response.data, response.error);
  },
  async createExport() {
    const response = await client.POST('/documents/exports', {
      params: { header: { 'Idempotency-Key': key(), 'If-Match': '"1"' } },
      body: { kind: 'EXPORT', format: 'CSV' },
    });
    ensure(response.data, response.error);
  },
  async saveShortcuts(shortcuts: string[]) {
    const response = await client.POST('/portal/api-access-requests', {
      params: { header: { 'Idempotency-Key': key(), 'If-Match': '"1"' } },
      body: { kind: 'PORTAL_SHORTCUTS', shortcuts },
    });
    ensure(response.data, response.error);
  },
};
