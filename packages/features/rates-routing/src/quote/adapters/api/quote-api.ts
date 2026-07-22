import type { ZhiliApiClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';
import type {
  CalculatedOption,
  CalculatedQuote,
  QuotePort,
  QuoteWorkflowRequest,
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
    version: remote.version,
    chargeableWeightKg: remote.options[0]!.chargeableWeightKg,
    volumeWeightKg: volumeWeight(request.quote),
    options: remote.options.map(mapRemoteOption),
  };
}

export function createQuoteApi(
  client: ZhiliApiClient,
  createIdempotencyKey: () => string = () => crypto.randomUUID()
): QuotePort {
  const createHeaders = () => ({ 'Idempotency-Key': `quote-${createIdempotencyKey()}` });
  const headers = (version: number) => ({
    'Idempotency-Key': `quote-${createIdempotencyKey()}`,
    'If-Match': `"${version}"`,
  });
  const acceptQuote: QuotePort['accept'] = async (quoteId, optionId, version) => {
    const response = await client.POST('/quotes/{quoteId}:accept', {
      params: { path: { quoteId }, header: headers(version) },
      body: { optionId, reason: '运营确认选定渠道并提交预报' },
    });
    if (response.error) throw response.error;
    return {
      acceptedOptionId: response.data?.data.acceptedOptionId ?? optionId,
      version: response.data?.data.version ?? version + 1,
    };
  };

  return {
    async create(request) {
      const response = await client.POST('/quotes', {
        body: request.quote,
        params: { header: createHeaders() },
      });
      if (response.error) throw response.error;
      const remote = response.data?.data;
      if (!remote) throw new Error('QUOTE_RESPONSE_EMPTY');
      return mapRemoteQuote(remote, request);
    },
    async explain(snapshot) {
      const response = await client.GET('/quotes/{quoteId}/explanation', {
        params: { path: { quoteId: snapshot.quoteId } },
      });
      if (response.error) throw response.error;
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
      const response = await client.POST('/orders', { body, params: { header: createHeaders() } });
      if (response.error) throw response.error;
      return {
        version: response.data?.data.version ?? 1,
        message: `草稿 ${response.data?.data.orderNo ?? '已保存'}`,
      };
    },
    async submitForecast(quoteId, optionId, version) {
      return acceptQuote(quoteId, optionId, version);
    },
  };
}
