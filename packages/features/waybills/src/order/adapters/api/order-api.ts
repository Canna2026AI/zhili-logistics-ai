import type { ZhiliApiClient } from '@zhili/api-client';
import type { OrderPort, OrderResult, OrderValidation } from '../../model/order';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOrder(value: unknown): value is OrderResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.orderNo === 'string' &&
    ['DRAFT', 'VALIDATED', 'SUBMITTED', 'CANCELLED'].includes(String(value.status)) &&
    Number.isInteger(value.version) &&
    Number(value.version) >= 1
  );
}

function isValidation(value: unknown): value is OrderValidation {
  return (
    isRecord(value) &&
    typeof value.valid === 'boolean' &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        ['INFO', 'WARNING', 'ERROR'].includes(String(item.severity)) &&
        typeof item.code === 'string' &&
        typeof item.message === 'string'
    )
  );
}

export function createOrderApi(
  client: ZhiliApiClient,
  createIdempotencyKey: () => string = () => crypto.randomUUID()
): OrderPort {
  const createHeaders = () => ({ 'Idempotency-Key': createIdempotencyKey() });
  const headers = (version: number) => ({
    'Idempotency-Key': createIdempotencyKey(),
    'If-Match': `"${version}"`,
  });
  return {
    async save(body) {
      const response = await client.POST('/orders', {
        body,
        params: { header: createHeaders() },
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (!isOrder(data)) throw new Error('ORDER_RESPONSE_INCOMPLETE');
      return data;
    },
    async validate(orderId, version) {
      const response = await client.POST('/orders/{orderId}:validate', {
        params: { path: { orderId }, header: headers(version) },
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (!isValidation(data)) throw new Error('ORDER_VALIDATION_INCOMPLETE');
      return data;
    },
    async copy(orderId, version) {
      const response = await client.POST('/orders/{orderId}:copy', {
        params: { path: { orderId }, header: headers(version) },
        body: { copyAddresses: true, copyPackages: true },
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (!isOrder(data) || data.id === orderId || data.status !== 'DRAFT')
        throw new Error('ORDER_COPY_RESPONSE_INCOMPLETE');
      return data;
    },
    async submit(orderId, version) {
      const response = await client.POST('/orders/{orderId}:submit', {
        params: { path: { orderId }, header: headers(version) },
      });
      if (response.error) throw response.error;
      const data: unknown = response.data?.data;
      if (!isOrder(data) || data.id !== orderId || data.status !== 'SUBMITTED')
        throw new Error('ORDER_SUBMIT_RESPONSE_INCOMPLETE');
      return data;
    },
  };
}
