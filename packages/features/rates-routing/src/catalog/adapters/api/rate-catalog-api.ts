import type { ZhiliApiClient } from '@zhili/api-client';
import type { RateCatalogPort } from '../../model/catalog';

function isRateCardPublication(value: unknown): value is {
  rateCardId: string;
  version: number;
  versionLabel: string;
  status: 'PUBLISHED';
  effectiveFrom: string;
  effectiveUntil: string | null;
  currency: string;
} {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.rateCardId === 'string' &&
    typeof record.version === 'number' &&
    typeof record.versionLabel === 'string' &&
    record.status === 'PUBLISHED' &&
    typeof record.effectiveFrom === 'string' &&
    (typeof record.effectiveUntil === 'string' || record.effectiveUntil === null) &&
    typeof record.currency === 'string'
  );
}

export function createRateCatalogApi(
  client: ZhiliApiClient,
  createIdempotencyKey: () => string = () => crypto.randomUUID()
): RateCatalogPort {
  return {
    async publish(rateCardId, version, input) {
      const response = await client.POST('/rates/rate-cards/{rateCardId}:publish', {
        params: {
          path: { rateCardId },
          header: {
            'Idempotency-Key': createIdempotencyKey(),
            'If-Match': `"${version}"`,
          },
        },
        body: input,
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (!isRateCardPublication(data) || data.rateCardId !== rateCardId) {
        throw new Error('RATE_CARD_PUBLICATION_CONTRACT_INCOMPLETE');
      }
      return { version: data.versionLabel, status: '生效' };
    },
  };
}
