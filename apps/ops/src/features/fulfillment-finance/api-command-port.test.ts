import { createZhiliClient } from '@zhili/api-client';
import { describe, expect, it } from 'vitest';
import { createApiFulfillmentFinanceCommandPort } from './api-command-port';

describe('API fulfillment finance command port', () => {
  it('uses the generated unreview adapter with reason, If-Match and idempotency key', async () => {
    let request: Request | undefined;
    const client = createZhiliClient({
      baseUrl: 'https://api.zhili.test/v1',
      fetch: async (input) => {
        request = new Request(input);
        return Response.json({ auditId: 'AUD-FIN-0098' });
      },
    });
    const port = createApiFulfillmentFinanceCommandPort(client);

    const result = await port.execute({
      domain: 'finance',
      operationId: 'unreviewCharge',
      entityRef: 'CHG-S2505120004',
      idempotencyKey: 'unreviewCharge:CHG-S2505120004:v11',
      expectedVersion: 11,
      payload: {
        reason: '承运商补传尾程费用',
        impact: '需要重新检查支付分配与期间',
        auditDestination: 'audit://finance/charges/CHG-S2505120004',
      },
    });

    expect(request?.url).toBe('https://api.zhili.test/v1/finance/charges/CHG-S2505120004:unreview');
    expect(request?.headers.get('If-Match')).toBe('11');
    expect(request?.headers.get('Idempotency-Key')).toBe('unreviewCharge:CHG-S2505120004:v11');
    await expect(request?.json()).resolves.toMatchObject({ reason: '承运商补传尾程费用' });
    expect(result.auditId).toBe('AUD-FIN-0098');
  });
});
