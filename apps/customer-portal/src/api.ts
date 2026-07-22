import { createZhiliClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';

export type CustomerAddressInput = Omit<
  components['schemas']['CreateCustomerAddressRequest'],
  'mode'
>;

const meta = { requestId: 'req-f1c-customer', asOf: '2026-07-22T00:00:00.000Z' };
const json = (body: unknown, status = 200, authoritativeVersion?: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(authoritativeVersion === undefined ? {} : { ETag: `"${authoritativeVersion}"` }),
    },
  });

const preconditionProblem = (
  code: 'PRECONDITION_REQUIRED' | 'PRECONDITION_INVALID' | 'STALE_VERSION'
) =>
  new Response(
    JSON.stringify({
      code,
      message:
        code === 'PRECONDITION_REQUIRED'
          ? 'Missing required strong If-Match precondition.'
          : code === 'PRECONDITION_INVALID'
            ? 'If-Match must be a positive strong numeric ETag.'
            : 'If-Match no longer matches the current aggregate version.',
      details: [{ field: 'If-Match', reason: code }],
      remediation: 'Refresh the resource and retry with its latest strong ETag.',
      requestId: meta.requestId,
    }),
    { status: 412, headers: { 'content-type': 'application/problem+json' } }
  );

type StrongPrecondition = { ok: true; version: number } | { ok: false; response: Response };

function readStrongIfMatch(request: Request): StrongPrecondition {
  const ifMatch = request.headers.get('If-Match');
  if (ifMatch === null) {
    return { ok: false, response: preconditionProblem('PRECONDITION_REQUIRED') };
  }
  const match = ifMatch.match(/^"([1-9][0-9]*)"$/);
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version) || version < 1 || version >= Number.MAX_SAFE_INTEGER) {
    return { ok: false, response: preconditionProblem('PRECONDITION_INVALID') };
  }
  const mockCurrentVersion = request.headers.get('X-Zhili-Mock-Current-Version');
  if (mockCurrentVersion !== null && mockCurrentVersion !== ifMatch) {
    return { ok: false, response: preconditionProblem('STALE_VERSION') };
  }
  return { ok: true, version };
}

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

export const customerMockFetch: typeof fetch = async (input) => {
  const request = input instanceof Request ? input : new Request(input);
  const path = new URL(request.url).pathname;
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
      201,
      1
    );
  }
  const acceptedQuote = path.match(/\/quotes\/([^/]+):accept$/);
  if (acceptedQuote) {
    const precondition = readStrongIfMatch(request);
    if (!precondition.ok) return precondition.response;
    if (acceptedQuote[1]?.includes('GONE'))
      return json({ type: 'QUOTE_EXPIRED', title: 'Quote expired', status: 410 }, 410);
    const body = (await request.clone().json()) as { optionId: string };
    const quoteVersion = precondition.version + 1;
    return json(
      {
        data: {
          id: acceptedQuote[1],
          quoteNo: 'Q2505120042',
          status: 'ACCEPTED',
          options: [],
          acceptedOptionId: body.optionId,
          validUntil:
            request.headers.get('X-Zhili-Mock-Valid-Until') ??
            new Date(Date.now() + 8 * 60 * 60 * 1_000).toISOString(),
          version: quoteVersion,
        },
        meta,
      },
      200,
      quoteVersion
    );
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
      201,
      1
    );
  const acceptedQuoteLink = path.match(/\/orders\/([^/]+):link-accepted-quote$/);
  if (acceptedQuoteLink) {
    const precondition = readStrongIfMatch(request);
    if (!precondition.ok) return precondition.response;
    const body = (await request.clone().json()) as {
      quoteId: string;
      quoteOptionId: string;
      acceptedQuoteVersion: number;
    };
    const orderVersion = precondition.version + 1;
    return json(
      {
        data: {
          quoteId: body.quoteId,
          quoteOptionId: body.quoteOptionId,
          quoteVersion: body.acceptedQuoteVersion,
          linkId: '01JQUOTELINK00000000000001',
          linkVersion: 1,
          orderId: acceptedQuoteLink[1],
          waybillId: '01JWAYBILL000000000000001',
          orderVersion,
          waybillVersion: 1,
        },
        meta,
      },
      201,
      orderVersion
    );
  }
  if (path.endsWith('/payments/statement-orders')) {
    const body = (await request.clone().json()) as {
      amount?: { amount?: string; currency?: string };
    };
    return json(
      {
        data: {
          id: '01JPAYMENT0000000000000001',
          paymentOrderNo: 'PAY-20260512-01',
          purpose: 'STATEMENT',
          status: 'PENDING',
          amount: {
            amount: body.amount?.amount ?? '2320.00',
            currency: body.amount?.currency ?? 'CNY',
          },
          paidAmount: { amount: '0.00', currency: 'CNY' },
          refundedAmount: { amount: '0.00', currency: 'CNY' },
          version: 1,
        },
        meta,
      },
      201
    );
  }
  const paymentOrder = path.match(/\/payments\/([^/]+)$/);
  if (paymentOrder && request.method === 'GET')
    return json(
      {
        data: {
          id: paymentOrder[1],
          paymentOrderNo: 'PAY-20260512-01',
          purpose: 'STATEMENT',
          status: 'SUCCEEDED',
          amount: { amount: '68420.00', currency: 'CNY' },
          paidAmount: { amount: '68420.00', currency: 'CNY' },
          refundedAmount: { amount: '0.00', currency: 'CNY' },
          version: 2,
        },
        meta,
      },
      200,
      2
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
          issueNo: 'TKT-20260723-086',
          status: 'OPEN',
          visibility: 'CUSTOMER',
          version: 1,
        },
        meta,
      },
      201,
      1
    );
  const resolvedIssue = path.match(/\/issues\/([^/]+):resolve$/);
  if (resolvedIssue) {
    const precondition = readStrongIfMatch(request);
    if (!precondition.ok) return precondition.response;
    const version = precondition.version + 1;
    return json(
      {
        data: {
          id: resolvedIssue[1],
          issueNo: 'TKT-20260723-086',
          status: 'RESOLVED',
          visibility: 'CUSTOMER',
          version,
        },
        meta,
      },
      200,
      version
    );
  }
  const allocatedReceipt = path.match(/\/finance\/receipts\/([^/]+):allocate$/);
  if (allocatedReceipt) {
    const precondition = readStrongIfMatch(request);
    if (!precondition.ok) return precondition.response;
    const version = precondition.version + 1;
    return json(
      {
        data: {
          id: allocatedReceipt[1],
          total: { amount: '68420.00', currency: 'CNY' },
          allocated: { amount: '68420.00', currency: 'CNY' },
          unapplied: { amount: '0.00', currency: 'CNY' },
          refunded: { amount: '0.00', currency: 'CNY' },
          version,
        },
        meta,
      },
      200,
      version
    );
  }
  const customerAddress = path.match(/\/customers\/[^/]+\/addresses:upsert$/);
  if (customerAddress) {
    const body = (await request.clone().json()) as { mode?: 'CREATE' | 'UPDATE' };
    if (body.mode === 'CREATE') {
      if (request.headers.has('If-Match')) {
        return json(
          {
            code: 'VALIDATION_FAILED',
            message: 'CREATE forbids If-Match.',
            requestId: meta.requestId,
          },
          422
        );
      }
      return json(
        {
          data: { resourceId: '01JCOMMAND000000000000001', status: 'SUCCEEDED', version: 1 },
          meta,
        },
        200,
        1
      );
    }
    const precondition = readStrongIfMatch(request);
    if (!precondition.ok) return precondition.response;
    const version = precondition.version + 1;
    return json(
      {
        data: { resourceId: '01JCOMMAND000000000000001', status: 'SUCCEEDED', version },
        meta,
      },
      200,
      version
    );
  }
  if (path.endsWith('/portal/api-access-requests') || path.endsWith('/documents/exports')) {
    const precondition = readStrongIfMatch(request);
    if (!precondition.ok) return precondition.response;
    return json(
      {
        data: { resourceId: '01JCOMMAND000000000000001', status: 'SUCCEEDED', version: 1 },
        meta,
      },
      200,
      1
    );
  }
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
  if (/^\/api\/v1\/portal\/issues\/[^/]+\/materials$/.test(path))
    return {
      issueId: path.split('/')[5],
      status: 'PARTIAL',
      version: 2,
      failedNotificationIds: ['notification-sms'],
    };
  if (path === '/api/v1/portal/dashboard:compare')
    return {
      serverVersion: 'v13',
      differences: [{ field: 'snapshotAt', local: '10:18', server: '10:21' }],
    };
  if (path === '/api/v1/portal/dashboard:refresh') return { version: 'v13', refreshedAt: '10:21' };
  const refreshedReceipt = path.match(/^\/api\/v1\/portal\/receipts\/([^/]+):refresh$/);
  if (refreshedReceipt)
    return {
      receiptId: refreshedReceipt[1],
      version: 2,
      differences: [
        {
          field: 'allocated',
          local: '¥67,820.00',
          server: '¥67,820.00',
        },
      ],
    };
  if (path === '/api/v1/portal/notifications:retry-failed') {
    const itemIds = body.itemIds as string[];
    return { items: itemIds.map((id) => ({ id, status: 'SUCCEEDED' })) };
  }
  throw new Error(`未实现的客户门户命令：${path}`);
};

export function resolveCustomerTransport(
  search: string,
  mode: string = import.meta.env.MODE
): typeof fetch | undefined {
  if (mode === 'test' || new URLSearchParams(search).get('mock') === '1') {
    return customerMockFetch;
  }
  return undefined;
}

const key = () => `f1c-${crypto.randomUUID?.() ?? Date.now()}`;

export function createCustomerCommandTransport(
  search: string,
  mode: string = import.meta.env.MODE,
  productionFetch: typeof fetch = globalThis.fetch
) {
  const useMock = mode === 'test' || new URLSearchParams(search).get('mock') === '1';
  return async <TRequest extends Record<string, unknown>, TResponse>(
    path: string,
    body: TRequest
  ): Promise<TResponse> => {
    if (useMock) return (await mockCustomerCommandFetch(path, body)) as TResponse;
    const response = await productionFetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': key(),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const problem = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(problem.message ?? `客户门户命令失败（HTTP ${response.status}）`);
    }
    if (response.status === 204) return {} as TResponse;
    return (await response.json()) as TResponse;
  };
}

const runtimeSearch = typeof window === 'undefined' ? '' : window.location.search;
const runtimeTransport = resolveCustomerTransport(runtimeSearch);
const customerCommand = createCustomerCommandTransport(runtimeSearch);
const client = createZhiliClient({
  baseUrl: import.meta.env.MODE === 'test' ? 'http://localhost/api/v1' : '/api/v1',
  ...(runtimeTransport ? { fetch: runtimeTransport } : {}),
});

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
    acceptedQuoteVersion: number;
  }) {
    const response = await client.POST('/orders/{orderId}:link-accepted-quote', {
      params: {
        path: { orderId: input.orderId },
        header: { 'Idempotency-Key': key(), 'If-Match': `"${input.orderVersion}"` },
      },
      body: {
        quoteId: input.quoteId,
        quoteOptionId: input.optionId,
        acceptedQuoteVersion: input.acceptedQuoteVersion,
      },
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
        acceptedQuoteVersion: input.acceptedQuote.version,
      });
    return order;
  },
  async createPayment(
    input: { statementId: string; statementVersion: number; amount: string } = {
      statementId: '01JSTATEMENT00000000000001',
      statementVersion: 1,
      amount: '2320.00',
    }
  ) {
    const response = await client.POST('/payments/statement-orders', {
      params: { header: { 'Idempotency-Key': key() } },
      body: {
        customerId: '01JCUSTOMER000000000000001',
        statementId: input.statementId,
        statementVersion: input.statementVersion,
        amount: { amount: input.amount, currency: 'CNY' },
        paymentMethod: 'WECHAT_PAY',
      },
    });
    return ensure(response.data, response.error).data;
  },
  async getPaymentOrder(paymentOrderId: string) {
    const response = await client.GET('/payments/{paymentOrderId}', {
      params: { path: { paymentOrderId } },
    });
    return ensure(response.data, response.error).data;
  },
  async allocateReceipt(receiptId: string, version: number, statementId: string, amount: string) {
    const response = await client.POST('/finance/receipts/{receiptId}:allocate', {
      params: {
        path: { receiptId },
        header: { 'Idempotency-Key': key(), 'If-Match': `"${version}"` },
      },
      body: { allocations: [{ statementId, amount: { amount, currency: 'CNY' } }] },
    });
    return ensure(response.data, response.error).data;
  },
  refreshReceiptAllocation(receiptId: string, localVersion: number) {
    return customerCommand<
      { localVersion: number },
      {
        receiptId: string;
        version: number;
        differences: VersionDifference[];
      }
    >(`/api/v1/portal/receipts/${receiptId}:refresh`, { localVersion });
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
    await customerCommand('/api/v1/portal/payment-vouchers', {
      fileName,
      statementNo: 'ST202605-0008',
    });
  },
  submitIssueEvidence(
    issueId: string,
    input: { fileName: string; fileType: string; fileSize: number; contact: string; note: string }
  ) {
    return customerCommand<
      typeof input,
      {
        issueId: string;
        status: 'PARTIAL' | 'SUCCEEDED';
        version: number;
        failedNotificationIds: string[];
      }
    >(`/api/v1/portal/issues/${issueId}/materials`, input);
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
  async resolveIssue(issueId: string, version: number, reason: string) {
    const response = await client.POST('/issues/{issueId}:resolve', {
      params: {
        path: { issueId },
        header: { 'Idempotency-Key': key(), 'If-Match': `"${version}"` },
      },
      body: { resolutionCode: 'CUSTOMER_CONFIRMED_RESOLVED', reason },
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
    await customerCommand('/api/v1/portal/preferences/shortcuts', { shortcuts });
  },
  compareDashboard(localVersion: string) {
    return customerCommand<
      { localVersion: string },
      { serverVersion: string; differences: VersionDifference[] }
    >('/api/v1/portal/dashboard:compare', { localVersion });
  },
  refreshDashboard(serverVersion = 'v13') {
    return customerCommand<{ serverVersion: string }, { version: string; refreshedAt: string }>(
      '/api/v1/portal/dashboard:refresh',
      { serverVersion }
    );
  },
  retryFailedNotifications(itemIds: string[]) {
    return customerCommand<
      { itemIds: string[] },
      { items: Array<{ id: string; status: 'SUCCEEDED' }> }
    >('/api/v1/portal/notifications:retry-failed', { itemIds });
  },
};
