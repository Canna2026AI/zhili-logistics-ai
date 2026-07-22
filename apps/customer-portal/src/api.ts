import { createZhiliClient } from '@zhili/api-client';

const meta = { requestId: 'req-f1c-customer', asOf: '2026-07-22T00:00:00.000Z' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ETag: '"1"' },
  });

export type QuoteRequest = {
  origin: string;
  destinationPostalCode: string;
  weightKg: number;
  volumeM3: number;
};

export type QuoteResult = {
  quoteNo: string;
  channel: string;
  request: QuoteRequest;
  chargeableWeightKg: number;
  zone: string;
  rateCardVersion: string;
  validUntil: string;
  evaluatedAt: string;
  charges: {
    base: string;
    fuel: string;
    remote: string;
    handling: string;
    total: string;
  };
};

export type OrderInput = {
  origin: string;
  recipient: string;
  destination: string;
  phone: string;
  commodity: string;
  pieces: number;
  weightKg: number;
  quoteNo?: string;
};

export type VersionDifference = {
  field: string;
  local: string;
  server: string;
};

const mockFetch: typeof fetch = async (input) => {
  const request = input instanceof Request ? input : new Request(input);
  const path = new URL(request.url, window.location.origin).pathname;
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
  if (
    path.includes('/customers/') ||
    path.endsWith('/portal/api-access-requests') ||
    path.endsWith('/documents/exports')
  )
    return json({
      data: { resourceId: '01JCOMMAND000000000000001', status: 'SUCCEEDED', version: 1 },
      meta,
    });
  return json({ message: `No typed mock route for ${path}` }, 404);
};

type LocalCommandResponse = Record<string, unknown>;

/**
 * App-local port for operations not yet present in the shared OpenAPI document.
 * Paths and DTOs intentionally describe the real business action instead of
 * reusing an unrelated generated operation.
 */
const mockCustomerCommandFetch = async (
  path: string,
  body: Record<string, unknown>
): Promise<LocalCommandResponse> => {
  if (path === '/api/v1/portal/quotes:calculate') {
    const request = body as QuoteRequest;
    return {
      quoteNo: 'Q2505120042',
      channel: '智立海运专线',
      request,
      chargeableWeightKg: request.weightKg,
      zone:
        request.destinationPostalCode === '90001'
          ? 'US-LAX 4 区'
          : `${request.destinationPostalCode} 分区`,
      rateCardVersion: 'v2026.07',
      validUntil:
        request.destinationPostalCode === 'EXPIRED'
          ? '2026-05-12T18:00:00+08:00'
          : '2026-07-22T18:00:00+08:00',
      evaluatedAt: '2026-07-22T10:00:00+08:00',
      charges: {
        base: '4,680.00',
        fuel: '514.80',
        remote: '80.00',
        handling: '45.20',
        total: '5,320.00',
      },
    } satisfies QuoteResult;
  }
  if (path === '/api/v1/portal/payment-vouchers' || path === '/api/v1/portal/preferences/shortcuts')
    return { resourceId: '01JPORTALCOMMAND0000000001', status: 'SUCCEEDED', version: 1 };
  if (path === '/api/v1/portal/dashboard:compare')
    return {
      serverVersion: 'v13',
      differences: [{ field: 'snapshotAt', local: '10:18', server: '10:21' }],
    };
  if (path === '/api/v1/portal/dashboard:refresh') return { version: 'v13', refreshedAt: '10:21' };
  if (path === '/api/v1/portal/notifications:retry-failed') {
    const itemIds = body.itemIds as string[];
    return { items: itemIds.map((id) => ({ id, status: 'SUCCEEDED' })) };
  }
  throw new Error(`未实现的客户门户命令：${path}`);
};

async function localCommand<TRequest extends Record<string, unknown>, TResponse>(
  path: string,
  body: TRequest
): Promise<TResponse> {
  return (await mockCustomerCommandFetch(path, body)) as TResponse;
}

const client = createZhiliClient({ baseUrl: 'http://localhost/api/v1', fetch: mockFetch });
const key = () => `f1c-${crypto.randomUUID?.() ?? Date.now()}`;

function ensure<T>(data: T | undefined, error: unknown): T {
  if (!data || error) throw new Error('业务服务暂时不可用，请保留输入后重试。');
  return data;
}

export const customerPort = {
  quote(request: QuoteRequest) {
    return localCommand<QuoteRequest, QuoteResult>('/api/v1/portal/quotes:calculate', request);
  },
  async createOrder(input: OrderInput) {
    const originCountry = input.origin.split('-')[0] || 'CN';
    const destinationCountry = input.destination.split('-')[0] || 'US';
    const response = await client.POST('/orders', {
      params: { header: { 'Idempotency-Key': key() } },
      body: {
        orderType: 'STANDARD',
        customerId: '01JCUSTOMER000000000000001',
        origin: {
          countryCode: originCountry,
          city: input.origin,
          line1: input.origin,
          postalCode: input.origin.match(/\b\d{6}\b/)?.[0] ?? '000000',
        },
        destination: {
          countryCode: destinationCountry,
          city: input.destination,
          line1: `${input.recipient} · ${input.phone}`,
          postalCode: input.destination.match(/\b\d{5}\b/)?.[0] ?? '00000',
        },
        packages: [
          {
            packageRef: `${input.commodity}-${input.pieces}PCS`,
            weightKg: String(input.weightKg),
            lengthCm: '1',
            widthCm: '1',
            heightCm: '1',
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
    await localCommand('/api/v1/portal/payment-vouchers', {
      fileName,
      statementNo: 'ST202605-0008',
    });
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
  async saveDraft(input?: Partial<OrderInput>) {
    const response = await client.POST('/orders', {
      params: { header: { 'Idempotency-Key': key() } },
      body: {
        orderType: 'STANDARD',
        customerId: '01JCUSTOMER000000000000001',
        origin: {
          countryCode: input?.origin?.split('-')[0] || 'CN',
          city: input?.origin || '草稿发货地',
          line1: input?.origin || '草稿发货地',
          postalCode: '000000',
        },
        destination: {
          countryCode: 'US',
          city: input?.destination || '草稿目的地',
          line1: input?.recipient || '草稿收件人',
          postalCode: '00000',
        },
        packages: [
          {
            packageRef: input?.commodity || 'DRAFT',
            weightKg: String(input?.weightKg || 1),
            lengthCm: '1',
            widthCm: '1',
            heightCm: '1',
          },
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
    await localCommand('/api/v1/portal/preferences/shortcuts', { shortcuts });
  },
  compareDashboard(localVersion: string) {
    return localCommand<
      { localVersion: string },
      { serverVersion: string; differences: VersionDifference[] }
    >('/api/v1/portal/dashboard:compare', { localVersion });
  },
  refreshDashboard(serverVersion = 'v13') {
    return localCommand<{ serverVersion: string }, { version: string; refreshedAt: string }>(
      '/api/v1/portal/dashboard:refresh',
      { serverVersion }
    );
  },
  retryFailedNotifications(itemIds: string[]) {
    return localCommand<
      { itemIds: string[] },
      { items: Array<{ id: string; status: 'SUCCEEDED' }> }
    >('/api/v1/portal/notifications:retry-failed', { itemIds });
  },
};
