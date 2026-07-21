import type { ZhiliApiClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';
import { calculateQuote, quoteInputFixture, type QuotePort } from '../../model/quote';

export function createQuoteApi(
  client: ZhiliApiClient,
  createIdempotencyKey: () => string = () => crypto.randomUUID()
): QuotePort {
  const createHeaders = () => ({ 'Idempotency-Key': `quote-${createIdempotencyKey()}` });
  const headers = (version: number) => ({
    'Idempotency-Key': `quote-${createIdempotencyKey()}`,
    'If-Match': `"${version}"`,
  });
  return {
    async create(request) {
      const response = await client.POST('/quotes', {
        body: request,
        params: { header: createHeaders() },
      });
      if (response.error) throw response.error;
      const calculated = calculateQuote({
        request,
        volumeDivisor: quoteInputFixture.volumeDivisor,
      });
      const remote = response.data?.data;
      return remote
        ? {
            ...calculated,
            id: remote.id,
            quoteNo: remote.quoteNo,
            version: remote.version,
          }
        : calculated;
    },
    async explain(quoteId, optionId = 'dhl-express') {
      const response = await client.GET('/quotes/{quoteId}/explanation', {
        params: { path: { quoteId } },
      });
      if (response.error) throw response.error;
      const remote = response.data?.data;
      if (remote) {
        return {
          rateCardVersion: remote.rateCardVersion ?? 'RATE-UNKNOWN',
          steps: remote.steps?.map((step) => step.result) ?? [],
        };
      }
      const local = calculateQuote(quoteInputFixture);
      const option = local.options.find((item) => item.id === optionId) ?? local.options[0]!;
      return { rateCardVersion: option.rateCardVersion, steps: option.explanationSteps };
    },
    async accept(quoteId, optionId, version) {
      const response = await client.POST('/quotes/{quoteId}:accept', {
        params: { path: { quoteId }, header: headers(version) },
        body: { optionId, reason: '运营确认选定渠道并提交预报' },
      });
      if (response.error) throw response.error;
      return {
        acceptedOptionId: response.data?.data.acceptedOptionId ?? optionId,
        version: response.data?.data.version ?? version + 1,
      };
    },
    async saveDraft(request) {
      const body: components['schemas']['CreateOrderDraftRequest'] = {
        orderType: 'STANDARD',
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
      return this.accept(quoteId, optionId, version);
    },
  };
}
