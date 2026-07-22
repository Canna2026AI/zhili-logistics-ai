import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validatePreconditionFailed } from '../../../packages/contracts/test/precondition-schema.js';
import { createCustomerCommandTransport, customerMockFetch } from './api';

const contract = readFileSync(
  resolve(import.meta.dirname, '../../../packages/contracts/openapi/zhili.openapi.yaml'),
  'utf8'
);

function operationBlock(operationId: string): string {
  const start = contract.indexOf(`      operationId: ${operationId}`);
  if (start === -1) return '';
  const end = contract.indexOf('\n  /', start);
  return contract.slice(start, end === -1 ? undefined : end);
}

function componentResponseBlock(responseName: string): string {
  const start = contract.indexOf(`    ${responseName}:`);
  if (start === -1) return '';
  const remainder = contract.slice(start + 5);
  const next = remainder.search(/^ {4}[A-Za-z][A-Za-z0-9]+:/m);
  return contract.slice(start, next === -1 ? undefined : start + 5 + next);
}

function successDeclaresEtag(operationId: string, status: number): boolean {
  const operation = operationBlock(operationId);
  const responseStart = operation.indexOf(`        '${status}':`);
  if (responseStart === -1) return false;
  const responseTail = operation.slice(responseStart + 9);
  const nextResponse = responseTail.search(/^ {8}'[1-5][0-9]{2}':/m);
  const response = operation.slice(
    responseStart,
    nextResponse === -1 ? undefined : responseStart + 9 + nextResponse
  );
  if (/^ {12}ETag:/m.test(response)) return true;
  const component = response.match(/\$ref: '#\/components\/responses\/([^']+)'/)?.[1];
  return component ? /^ {8}ETag:/m.test(componentResponseBlock(component)) : false;
}

const jsonRequest = (
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
) =>
  new Request(`http://localhost/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

describe('customer mock OpenAPI conformance', () => {
  const etagCases = [
    {
      operationId: 'createQuote',
      status: 201,
      request: () =>
        jsonRequest('/quotes', {
          destination: { postalCode: '90001' },
          packages: [{ weightKg: '18.50' }],
        }),
      expectedVersion: 1,
      version: (body: { data: { version: number } }) => body.data.version,
    },
    {
      operationId: 'acceptQuote',
      status: 200,
      request: () =>
        jsonRequest(
          '/quotes/01JQUOTE000000000000000042:accept',
          { optionId: '01JQUOTEOPTION0000000000001' },
          { 'If-Match': '"7"' }
        ),
      expectedVersion: 8,
      version: (body: { data: { version: number } }) => body.data.version,
    },
    {
      operationId: 'createOrderDraft',
      status: 201,
      request: () => jsonRequest('/orders', {}),
      expectedVersion: 1,
      version: (body: { data: { version: number } }) => body.data.version,
    },
    {
      operationId: 'linkAcceptedQuoteToOrder',
      status: 201,
      request: () =>
        jsonRequest(
          '/orders/01JORDER000000000000000006:link-accepted-quote',
          {
            quoteId: '01JQUOTE000000000000000042',
            quoteOptionId: '01JQUOTEOPTION0000000000001',
            acceptedQuoteVersion: 2,
          },
          { 'If-Match': '"7"' }
        ),
      expectedVersion: 8,
      version: (body: { data: { orderVersion: number } }) => body.data.orderVersion,
    },
    {
      operationId: 'createIssue',
      status: 201,
      request: () => jsonRequest('/issues', {}),
      expectedVersion: 1,
      version: (body: { data: { version: number } }) => body.data.version,
    },
    {
      operationId: 'upsertCustomerAddress',
      status: 200,
      request: () =>
        jsonRequest(
          '/customers/01JCUSTOMER000000000000001/addresses:upsert',
          { mode: 'UPDATE' },
          { 'If-Match': '"7"' }
        ),
      expectedVersion: 8,
      version: (body: { data: { version: number } }) => body.data.version,
    },
    {
      operationId: 'createApiAccessRequest',
      status: 200,
      request: () => jsonRequest('/portal/api-access-requests', {}, { 'If-Match': '"7"' }),
      expectedVersion: 1,
      version: (body: { data: { version: number } }) => body.data.version,
    },
    {
      operationId: 'createExportJob',
      status: 200,
      request: () => jsonRequest('/documents/exports', {}, { 'If-Match': '"7"' }),
      expectedVersion: 1,
      version: (body: { data: { version: number } }) => body.data.version,
    },
  ] as const;

  it.each(etagCases)(
    '$operationId emits a strong ETag equal to its authoritative body version',
    async ({ operationId, status, request, expectedVersion, version }) => {
      expect(successDeclaresEtag(operationId, status)).toBe(true);
      const response = await customerMockFetch(request());
      const body = (await response.json()) as never;
      const authoritativeVersion = version(body);
      expect(response.status).toBe(status);
      expect(authoritativeVersion).toBe(expectedVersion);
      expect(response.headers.get('ETag')).toBe(`"${authoritativeVersion}"`);
    }
  );

  it.each([
    {
      operationId: 'createStatementPaymentOrder',
      status: 201,
      request: () => jsonRequest('/payments/statement-orders', {}),
    },
    {
      operationId: 'createImportJob',
      status: 202,
      request: () => jsonRequest('/imports', {}),
    },
  ])(
    '$operationId omits ETag because its OpenAPI success response does not declare one',
    async ({ operationId, status, request }) => {
      expect(successDeclaresEtag(operationId, status)).toBe(false);
      const response = await customerMockFetch(request());
      expect(response.status).toBe(status);
      expect(response.headers.get('ETag')).toBeNull();
    }
  );

  it.each([
    {
      operationId: 'acceptQuote',
      path: '/quotes/01JQUOTE000000000000000042:accept',
      body: { optionId: 'option-1' },
    },
    {
      operationId: 'linkAcceptedQuoteToOrder',
      path: '/orders/01JORDER000000000000000006:link-accepted-quote',
      body: { quoteId: 'quote-1', quoteOptionId: 'option-1', acceptedQuoteVersion: 2 },
    },
    {
      operationId: 'upsertCustomerAddress',
      path: '/customers/01JCUSTOMER000000000000001/addresses:upsert',
      body: { mode: 'UPDATE' },
    },
    {
      operationId: 'createApiAccessRequest',
      path: '/portal/api-access-requests',
      body: {},
    },
    {
      operationId: 'createExportJob',
      path: '/documents/exports',
      body: {},
    },
  ] as const)(
    'fails closed with 412 when $operationId has no strong If-Match',
    async ({ operationId, path, body }) => {
      expect(operationBlock(operationId)).toContain('#/components/responses/PreconditionFailed');
      for (const ifMatch of [undefined, '7', 'W/"7"', '"0"', '"invalid"']) {
        const response = await customerMockFetch(
          jsonRequest(path, body, ifMatch === undefined ? {} : { 'If-Match': ifMatch })
        );
        const problem = (await response.json()) as { code: string };
        expect(response.status, ifMatch).toBe(412);
        expect(problem.code).toMatch(/^PRECONDITION_(?:REQUIRED|INVALID)$/);
        expect(
          validatePreconditionFailed(problem),
          JSON.stringify(validatePreconditionFailed.errors)
        ).toBe(true);
      }
    }
  );

  it('returns a schema-valid STALE_VERSION 412 for an expired strong If-Match', async () => {
    const response = await customerMockFetch(
      jsonRequest(
        '/quotes/01JQUOTE000000000000000042:accept',
        { optionId: 'option-1' },
        { 'If-Match': '"6"', 'X-Zhili-Mock-Current-Version': '"7"' }
      )
    );
    const problem = (await response.json()) as { code: string };
    expect(response.status).toBe(412);
    expect(problem.code).toBe('STALE_VERSION');
    expect(
      validatePreconditionFailed(problem),
      JSON.stringify(validatePreconditionFailed.errors)
    ).toBe(true);
  });

  it('rejects an If-Match on customer-address CREATE because the OpenAPI upsert forbids it', async () => {
    const response = await customerMockFetch(
      jsonRequest(
        '/customers/01JCUSTOMER000000000000001/addresses:upsert',
        { mode: 'CREATE' },
        { 'If-Match': '"7"' }
      )
    );
    expect(response.status).toBe(422);
  });
});

describe('customer app-local command transport', () => {
  it('uses real same-origin HTTP outside explicit mock mode', async () => {
    const productionFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ resourceId: 'cmd-real', status: 'SUCCEEDED', version: 7 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
    );
    const command = createCustomerCommandTransport('', 'production', productionFetch);

    await expect(
      command('/api/v1/portal/payment-vouchers', { fileName: 'proof.pdf' })
    ).resolves.toEqual({ resourceId: 'cmd-real', status: 'SUCCEEDED', version: 7 });
    expect(productionFetch).toHaveBeenCalledWith(
      '/api/v1/portal/payment-vouchers',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
      })
    );
  });

  it('keeps the deterministic app-local mock behind mock=1 only', async () => {
    const productionFetch = vi.fn();
    const command = createCustomerCommandTransport('?mock=1', 'production', productionFetch);

    await expect(
      command('/api/v1/portal/preferences/shortcuts', { shortcuts: ['工作台'] })
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(productionFetch).not.toHaveBeenCalled();
  });
});
