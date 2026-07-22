import type { ZhiliApiClient } from '@zhili/api-client';
import type { OrderPort } from '../../model/order';

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
      if (!response.data) throw new Error('ORDER_RESPONSE_EMPTY');
      return response.data.data;
    },
    async validate(orderId, version) {
      const response = await client.POST('/orders/{orderId}:validate', {
        params: { path: { orderId }, header: headers(version) },
      });
      if (response.error) throw response.error;
      if (!response.data) throw new Error('ORDER_VALIDATION_EMPTY');
      return response.data.data;
    },
    async copy(orderId, version) {
      const response = await client.POST('/orders/{orderId}:copy', {
        params: { path: { orderId }, header: headers(version) },
        body: { id: orderId, version },
      });
      if (response.error) throw response.error;
      const data = response.data?.data;
      return {
        id: String(data?.resourceId ?? `${orderId}-copy`),
        orderNo: String(
          (data?.domain as { orderNo?: string } | null | undefined)?.orderNo ?? 'COPY-PENDING'
        ),
        status: 'DRAFT',
        version: Number(data?.version ?? 1),
      };
    },
    async submit(orderId, version) {
      const response = await client.POST('/waybills/{waybillId}:submit', {
        params: { path: { waybillId: orderId }, header: headers(version) },
      });
      if (response.error) throw response.error;
      return {
        id: orderId,
        orderNo: String(response.data?.data.waybillNo ?? orderId),
        status: 'SUBMITTED',
        version: Number(response.data?.data.version ?? version + 1),
      };
    },
  };
}
