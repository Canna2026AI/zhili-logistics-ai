import type { ZhiliApiClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';

export interface QuotePort {
  create(request: components['schemas']['CreateQuoteRequest']): Promise<unknown>;
  explain(quoteId: string): Promise<unknown>;
}

export function createQuoteApi(client: ZhiliApiClient): QuotePort {
  return {
    async create(request) {
      const response = await client.POST('/quotes', {
        body: request,
        params: { header: { 'Idempotency-Key': `quote-${crypto.randomUUID()}` } },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
    async explain(quoteId) {
      const response = await client.GET('/quotes/{quoteId}/explanation', {
        params: { path: { quoteId } },
      });
      if (response.error) throw response.error;
      return response.data?.data;
    },
  };
}
