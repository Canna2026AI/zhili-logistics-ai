import { createZhiliClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';

export type CustomerAddressInput = Omit<
  components['schemas']['UpsertCustomerAddressRequest'],
  'mode' | 'id'
>;

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
  id: string;
  optionId: string;
  version: number;
  quoteNo: string;
  channel: string;
  request: QuoteRequest;
  chargeableWeightKg: number;
  zone: string;
  rateCardVersion: string;
  validUntil: string;
  charges: {
    base: string;
    fuel: string;
    remote: string;
    handling: string;
    total: string;
  };
};

export type AcceptedQuoteReference = {
  quoteId: string;
  optionId: string;
  version: number;
};

export type OrderInput = {
  origin: string;
  recipient: string;
  destination: string;
  phone: string;
  commodity: string;
  pieces: number;
  weightKg: number;
  acceptedQuote?: AcceptedQuoteReference;
};

export type VersionDifference = {
  field: string;
  local: string;
  server: string;
};

const mockFetch: typeof fetch = async (input) => {
  const request = input instanceof Request ? input : new Request(input);
  const path = new URL(request.url, window.location.origin).pathname;
  if (path.endsWith('/quotes')) {
    const body = (await request.clone().json()) as {
      destination: { postalCode?: string };
      packages: Array<{ weightKg: string }>;
    };
    const postalCode = body.destination.postalCode ?? '90001';
    const requestedAt = new Date(
      request.headers.get('X-Zhili-Mock-Requested-At') ?? Date.now()
    ).getTime();
    const validUntil = new Date(
      postalCode === 'EXPIRED' ? requestedAt - 1 : requestedAt + 8 * 60 * 60 * 1_000
    ).toISOString();
    const quoteId =
      postalCode === '41000' ? '01JQUOTEGONE00000000000042' : '01JQUOTE000000000000000042';
    return json(
      {
        data: {
          id: quoteId,
          quoteNo: 'Q2505120042',
          status: postalCode === 'EXPIRED' ? 'EXPIRED' : 'CALCULATED',
          options: [
            {
              id: '01JQUOTEOPTION0000000000001',
              channelProductId: '01JCHANNELPRODUCT0000000001',
              chargeableWeightKg: body.packages[0]?.weightKg ?? '123.50',
              available: true,
              lines: [
                { code: 'BASE', label: '基础运费', amount: { amount: '4680.00', currency: 'CNY' } },
                {
                  code: 'FUEL',
                  label: '燃油附加费',
                  amount: { amount: '514.80', currency: 'CNY' },
                },
                {
                  code: 'REMOTE',
                  label: '偏远附加费',
                  amount: { amount: '80.00', currency: 'CNY' },
                },
                { code: 'HANDLING', label: '操作费', amount: { amount: '45.20', currency: 'CNY' } },
              ],
              total: { amount: '5320.00', currency: 'CNY' },
            },
          ],
          validUntil,
          version: 1,
        },
        meta,
      },
      201
    );
  }
  const acceptedQuote = path.match(/\/quotes\/([^/]+):accept$/);
  if (acceptedQuote) {
    if (acceptedQuote[1]?.includes('GONE'))
      return json({ type: 'QUOTE_EXPIRED', title: 'Quote expired', status: 410 }, 410);
    const body = (await request.clone().json()) as { optionId: string };
    return json({
      data: {
        id: acceptedQuote[1],
        quoteNo: 'Q2505120042',
        status: 'ACCEPTED',
        options: [],
        acceptedOptionId: body.optionId,
        validUntil:
          request.headers.get('X-Zhili-Mock-Valid-Until') ??
          new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString(),
        version: 2,
      },
      meta,
    });
  }
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
  const acceptedQuoteLink = path.match(/\/orders\/([^/]+):link-accepted-quote$/);
  if (acceptedQuoteLink) {
    const body = (await request.clone().json()) as { quoteId: string; quoteOptionId: string };
    return json(
      {
        data: {
          quoteId: body.quoteId,
          quoteOptionId: body.quoteOptionId,
          orderId: acceptedQuoteLink[1],
          waybillId: '01JWAYBILL000000000000001',
          orderVersion: 2,
          waybillVersion: 1,
        },
        meta,
      },
      201
    );
  }
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

export class QuoteExpiredError extends Error {
  readonly code = 'QUOTE_EXPIRED';

  constructor() {
    super('报价已在服务端过期，请按当前规则重新查价。');
    this.name = 'QuoteExpiredError';
  }
}

export const customerPort = {
  async quote(request: QuoteRequest, now: () => number = Date.now): Promise<QuoteResult> {
    const requestedAt = now();
    const sideCm = Math.max(1, Math.cbrt(request.volumeM3) * 100).toFixed(2);
    const response = await client.POST('/quotes', {
      params: { header: { 'Idempotency-Key': key() } },
      headers: { 'X-Zhili-Mock-Requested-At': new Date(requestedAt).toISOString() },
      body: {
        customerId: '01JCUSTOMER000000000000001',
        origin: {
          countryCode: request.origin.split('-')[0] || 'CN',
          city: request.origin,
          line1: request.origin,
          postalCode: '518000',
        },
        destination: {
          countryCode: 'US',
          city: request.destinationPostalCode,
          line1: request.destinationPostalCode,
          postalCode: request.destinationPostalCode,
        },
        packages: [
          {
            packageRef: 'QUOTE-PACKAGE',
            weightKg: String(request.weightKg),
            lengthCm: sideCm,
            widthCm: sideCm,
            heightCm: sideCm,
          },
        ],
        quoteDate: new Date(requestedAt).toISOString().slice(0, 10),
        currency: 'CNY',
      },
    });
    const quote = ensure(response.data, response.error).data;
    const option = quote.options.find((item) => item.available) ?? quote.options[0];
    if (!option) throw new Error('当前没有可用报价渠道。');
    const line = (code: string) =>
      Number(option.lines.find((item) => item.code === code)?.amount.amount ?? 0).toLocaleString(
        'en-US',
        { minimumFractionDigits: 2 }
      );
    return {
      id: quote.id,
      optionId: option.id,
      version: quote.version,
      quoteNo: quote.quoteNo,
      channel: '智立海运专线',
      request,
      chargeableWeightKg: Number(option.chargeableWeightKg),
      zone:
        request.destinationPostalCode === '90001'
          ? 'US-LAX 4 区'
          : `${request.destinationPostalCode} 分区`,
      rateCardVersion: 'v2026.07',
      validUntil: quote.validUntil,
      charges: {
        base: line('BASE'),
        fuel: line('FUEL'),
        remote: line('REMOTE'),
        handling: line('HANDLING'),
        total: Number(option.total.amount).toLocaleString('en-US', { minimumFractionDigits: 2 }),
      },
    };
  },
  async acceptQuote(quote: QuoteResult): Promise<QuoteResult> {
    const response = await client.POST('/quotes/{quoteId}:accept', {
      params: {
        path: { quoteId: quote.id },
        header: { 'Idempotency-Key': key(), 'If-Match': `"${quote.version}"` },
      },
      headers: { 'X-Zhili-Mock-Valid-Until': quote.validUntil },
      body: { optionId: quote.optionId, reason: '客户确认报价' },
    });
    if (response.response.status === 410) throw new QuoteExpiredError();
    const accepted = ensure(response.data, response.error).data;
    return { ...quote, version: accepted.version };
  },
  async linkAcceptedQuote(input: {
    orderId: string;
    orderVersion: number;
    quoteId: string;
    optionId: string;
  }) {
    const response = await client.POST('/orders/{orderId}:link-accepted-quote', {
      params: {
        path: { orderId: input.orderId },
        header: { 'Idempotency-Key': key(), 'If-Match': `"${input.orderVersion}"` },
      },
      body: { quoteId: input.quoteId, quoteOptionId: input.optionId },
    });
    return ensure(response.data, response.error).data;
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
    const order = ensure(response.data, response.error).data;
    if (input.acceptedQuote)
      await customerPort.linkAcceptedQuote({
        orderId: order.id,
        orderVersion: order.version,
        quoteId: input.acceptedQuote.quoteId,
        optionId: input.acceptedQuote.optionId,
      });
    return order;
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
  async saveAddress(input: string | CustomerAddressInput) {
    if (typeof input === 'string') {
      throw new Error('请先补全国家、城市、详细地址和邮编后再保存。');
    }
    const response = await client.POST('/customers/{customerId}/addresses:upsert', {
      params: {
        path: { customerId: '01JCUSTOMER000000000000001' },
        header: { 'Idempotency-Key': key() },
      },
      body: { mode: 'CREATE', ...input },
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
