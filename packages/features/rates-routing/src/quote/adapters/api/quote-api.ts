import { DomainApiError, toDomainApiError, type ZhiliApiClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';
import {
  quoteAcceptabilityCode,
  type CalculatedOption,
  type CalculatedQuote,
  type QuotePort,
  type QuoteWorkflowRequest,
} from '../../model/quote';

function volumeWeight(request: QuoteWorkflowRequest['quote']) {
  return request.packages
    .reduce(
      (total, item) =>
        total + (Number(item.lengthCm) * Number(item.widthCm) * Number(item.heightCm)) / 6000,
      0
    )
    .toFixed(2);
}

function mapRemoteOption(option: components['schemas']['QuoteOption']): CalculatedOption {
  return {
    id: option.id,
    carrier: '服务端渠道',
    product: option.channelProductId,
    available: option.available,
    unavailableReason: option.unavailableReasons?.map((item) => item.message).join('；'),
    lines: option.lines,
    total: option.total,
    rateCardVersion: option.lines.find((line) => line.ruleVersion)?.ruleVersion ?? '服务端报价快照',
    explanationSteps: [],
  };
}

function mapRemoteQuote(
  remote: components['schemas']['Quote'],
  request: QuoteWorkflowRequest
): CalculatedQuote {
  if (remote.options.length === 0) throw new Error('QUOTE_OPTIONS_EMPTY');
  return {
    id: remote.id,
    quoteNo: remote.quoteNo,
    status: remote.status,
    acceptedOptionId: remote.acceptedOptionId,
    validUntil: remote.validUntil,
    version: remote.version,
    chargeableWeightKg: remote.options[0]!.chargeableWeightKg,
    volumeWeightKg: volumeWeight(request.quote),
    options: remote.options.map(mapRemoteOption),
  };
}

const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function assertUlid(value: string, code: string) {
  if (!ulidPattern.test(value)) throw new DomainApiError(code, { code });
}

function assertRemoteQuote(remote: components['schemas']['Quote']) {
  assertUlid(remote.id, 'QUOTE_ID_INVALID');
  if (!Number.isInteger(remote.version) || remote.version < 1)
    throw new DomainApiError('QUOTE_VERSION_INVALID', { code: 'QUOTE_VERSION_INVALID' });
  if (remote.options.length === 0)
    throw new DomainApiError('QUOTE_OPTIONS_EMPTY', { code: 'QUOTE_OPTIONS_EMPTY' });
  for (const option of remote.options) {
    assertUlid(option.id, 'QUOTE_OPTION_ID_INVALID');
    assertUlid(option.channelProductId, 'QUOTE_PRODUCT_ID_INVALID');
  }
}

function intentId(operation: string, payload: unknown) {
  return `${operation}:${JSON.stringify(payload)}`;
}

export function createQuoteApi(
  client: ZhiliApiClient,
  createIdempotencyKey: () => string = () => crypto.randomUUID()
): QuotePort {
  const pendingIntentKeys = new Map<string, string>();
  const quoteRequests = new Map<string, QuoteWorkflowRequest>();
  const keyFor = (intent: string) => {
    const existing = pendingIntentKeys.get(intent);
    if (existing) return existing;
    const key = `quote-${createIdempotencyKey()}`;
    pendingIntentKeys.set(intent, key);
    return key;
  };
  const createHeaders = (intent: string) => ({ 'Idempotency-Key': keyFor(intent) });
  const headers = (intent: string, version: number) => ({
    'Idempotency-Key': keyFor(intent),
    'If-Match': `"${version}"`,
  });
  const acceptQuote: QuotePort['accept'] = async (quoteId, optionId, version) => {
    assertUlid(quoteId, 'QUOTE_ID_INVALID');
    assertUlid(optionId, 'QUOTE_OPTION_ID_INVALID');
    const intent = intentId('accept', { quoteId, optionId, version });
    let response;
    try {
      response = await client.POST('/quotes/{quoteId}:accept', {
        params: { path: { quoteId }, header: headers(intent, version) },
        body: { optionId, reason: '运营确认选定渠道并提交预报' },
      });
    } catch (error) {
      throw toDomainApiError(error);
    }
    if (response.error) {
      pendingIntentKeys.delete(intent);
      throw toDomainApiError(response.error, response.response);
    }
    const remote = response.data?.data;
    if (!remote)
      throw new DomainApiError('QUOTE_ACCEPT_RESPONSE_EMPTY', {
        code: 'QUOTE_ACCEPT_RESPONSE_EMPTY',
      });
    assertRemoteQuote(remote);
    if (
      remote.id !== quoteId ||
      remote.status !== 'ACCEPTED' ||
      remote.acceptedOptionId !== optionId ||
      remote.version <= version ||
      !remote.options.some((option) => option.id === optionId)
    ) {
      throw new DomainApiError('QUOTE_ACCEPT_SNAPSHOT_MISMATCH', {
        code: 'QUOTE_ACCEPT_SNAPSHOT_MISMATCH',
      });
    }
    const request = quoteRequests.get(quoteId);
    if (!request)
      throw new DomainApiError('QUOTE_REQUEST_CONTEXT_MISSING', {
        code: 'QUOTE_REQUEST_CONTEXT_MISSING',
      });
    const accepted = mapRemoteQuote(remote, request);
    pendingIntentKeys.delete(intent);
    return accepted;
  };

  return {
    async create(request) {
      assertUlid(request.quote.customerId, 'QUOTE_CUSTOMER_ID_INVALID');
      const intent = intentId('create', request.quote);
      let response;
      try {
        response = await client.POST('/quotes', {
          body: request.quote,
          params: { header: createHeaders(intent) },
        });
      } catch (error) {
        throw toDomainApiError(error);
      }
      if (response.error) {
        pendingIntentKeys.delete(intent);
        throw toDomainApiError(response.error, response.response);
      }
      const remote = response.data?.data;
      if (!remote)
        throw new DomainApiError('QUOTE_RESPONSE_EMPTY', { code: 'QUOTE_RESPONSE_EMPTY' });
      assertRemoteQuote(remote);
      const quote = mapRemoteQuote(remote, request);
      const acceptabilityCode = quoteAcceptabilityCode(quote);
      if (acceptabilityCode) {
        throw new DomainApiError(acceptabilityCode, { code: acceptabilityCode });
      }
      quoteRequests.set(quote.id, request);
      pendingIntentKeys.delete(intent);
      return quote;
    },
    async explain(snapshot) {
      const response = await client.GET('/quotes/{quoteId}/explanation', {
        params: { path: { quoteId: snapshot.quoteId } },
      });
      if (response.error) throw toDomainApiError(response.error, response.response);
      const remote = response.data?.data;
      if (!remote || remote.quoteId !== snapshot.quoteId)
        throw new Error('QUOTE_EXPLANATION_SNAPSHOT_MISMATCH');
      return {
        ...snapshot,
        rateCardVersion: remote.rateCardVersion,
        steps: remote.steps.map((step) => step.result),
      };
    },
    accept: acceptQuote,
    async saveDraft(workflow) {
      const request = workflow.quote;
      const body: components['schemas']['CreateOrderDraftRequest'] = {
        orderType: workflow.orderContext.orderType,
        customerId: request.customerId,
        origin: request.origin,
        destination: request.destination,
        packages: request.packages,
      };
      const intent = intentId('save-draft', body);
      let response;
      try {
        response = await client.POST('/orders', {
          body,
          params: { header: createHeaders(intent) },
        });
      } catch (error) {
        throw toDomainApiError(error);
      }
      if (response.error) {
        pendingIntentKeys.delete(intent);
        throw toDomainApiError(response.error, response.response);
      }
      if (!response.data?.data)
        throw new DomainApiError('ORDER_DRAFT_RESPONSE_EMPTY', {
          code: 'ORDER_DRAFT_RESPONSE_EMPTY',
        });
      pendingIntentKeys.delete(intent);
      return {
        version: response.data.data.version,
        message: `草稿 ${response.data.data.orderNo}`,
      };
    },
    async submitForecast(quoteId, optionId, version) {
      const accepted = await acceptQuote(quoteId, optionId, version);
      return {
        acceptedOptionId: optionId,
        version: accepted.version,
        message: `报价 ${accepted.quoteNo} 已接受并提交预报`,
      };
    },
  };
}
