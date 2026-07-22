import type { ZhiliApiClient } from '@zhili/api-client';
import type { RateCatalogPort } from '../../model/catalog';

export function createRateCatalogApi(
  client: ZhiliApiClient,
  createIdempotencyKey: () => string = () => crypto.randomUUID()
): RateCatalogPort {
  return {
    async publish(rateCardId, version, reason) {
      const response = await client.POST('/rates/rate-cards/{rateCardId}:publish', {
        params: {
          path: { rateCardId },
          header: {
            'Idempotency-Key': createIdempotencyKey(),
            'If-Match': `"${version}"`,
          },
        },
        body: {
          versionLabel: `v${version + 1}`,
          effectiveFrom: new Date().toISOString(),
          currency: 'CNY',
          reason,
        },
      });
      if (response.error) throw response.error;
      const data = response.data?.data;
      return { version: `v${Number(data?.version ?? version + 1)}`, status: '生效' };
    },
  };
}
