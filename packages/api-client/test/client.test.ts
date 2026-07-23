import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createZhiliClient } from '../src';

const server = setupServer(
  http.get('http://localhost/api/v1/waybills/:waybillId', ({ request }) => {
    expect(request.credentials).toBe('include');
    return HttpResponse.json({
      data: {
        id: '01J00000000000000000000000',
        waybillNo: 'S2505120004',
        state: 'RECEIVED',
        allowedActions: [],
        version: 7,
      },
      meta: { requestId: 'req-test', timestamp: '2026-07-22T00:00:00.000Z' },
    });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('createZhiliClient', () => {
  it('returns contract typed data with cookie credentials', async () => {
    const client = createZhiliClient({ baseUrl: 'http://localhost/api/v1' });
    const response = await client.GET('/waybills/{waybillId}', {
      params: { path: { waybillId: '01J00000000000000000000000' } },
    });
    expect(response.data?.data.waybillNo).toBe('S2505120004');
  });

  it('normalizes problem details into a typed recoverable domain error', async () => {
    const apiClient = await import('../src');
    expect(apiClient).toHaveProperty('toDomainApiError');

    const normalize = Reflect.get(apiClient, 'toDomainApiError') as (
      error: unknown,
      response?: Response
    ) => Error & {
      status?: number;
      code?: string;
      remediation?: string;
      requestId?: string;
    };
    const error = normalize(
      {
        code: 'AI_LOW_CONFIDENCE',
        message: '映射置信度过低',
        remediation: '请人工确认字段映射',
        requestId: 'REQ-LOW-CONFIDENCE',
      },
      new Response(null, { status: 422 })
    );

    expect(error).toMatchObject({
      name: 'DomainApiError',
      message: '映射置信度过低',
      status: 422,
      code: 'AI_LOW_CONFIDENCE',
      remediation: '请人工确认字段映射',
      requestId: 'REQ-LOW-CONFIDENCE',
    });
  });
});
