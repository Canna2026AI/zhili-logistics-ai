import type { ZhiliApiClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';
import type { MasterDataPort } from '../../model/master-data';

export interface MasterDataCommandPort extends MasterDataPort {
  upsertOrganization(
    record: components['schemas']['UpsertOrganizationNodeRequest'],
    version?: number
  ): Promise<void>;
  upsertAddress(
    customerId: string,
    record: components['schemas']['UpsertCustomerAddressRequest'],
    version?: number
  ): Promise<void>;
  publishReference(
    record: components['schemas']['PublishReferenceDataVersionRequest'],
    version: number
  ): Promise<void>;
  updateCredit(
    customerId: string,
    record: components['schemas']['UpdateCustomerCreditPolicyRequest'],
    version: number
  ): Promise<void>;
}

export function createMasterDataApi(
  client: ZhiliApiClient,
  createIdempotencyKey: () => string = () => crypto.randomUUID()
): MasterDataCommandPort {
  const createHeaders = () => ({ 'Idempotency-Key': createIdempotencyKey() });
  const headers = (version: number) => ({
    'Idempotency-Key': createIdempotencyKey(),
    'If-Match': `"${version}"`,
  });
  const upsertHeaders = (mode: 'CREATE' | 'UPDATE', version?: number) => {
    if (mode === 'UPDATE') {
      if (!version) throw new Error('UPDATE_REQUIRES_VERSION');
      return headers(version);
    }
    return createHeaders();
  };
  const ensureSucceeded = (response: { error?: unknown }) => {
    if (response.error) throw response.error;
  };
  return {
    async createCustomer(input) {
      const response = await client.POST('/customers', {
        params: { header: createHeaders() },
        body: {
          name: input.name,
          customerCode: `CUST-${createIdempotencyKey().slice(0, 8)}`,
          settlementCurrency: 'CNY',
          creditLimit: { amount: input.creditLimit, currency: 'CNY' },
        },
      });
      if (response.error) throw response.error;
      if (!response.data) throw new Error('CUSTOMER_RESPONSE_EMPTY');
      const customer = response.data.data;
      return {
        id: customer.id,
        category: '客户',
        code: customer.customerCode,
        name: customer.name,
        scope: input.scope,
        status:
          customer.status === 'ACTIVE'
            ? '启用'
            : customer.status === 'INACTIVE'
              ? '停用'
              : '待审核',
        version: customer.version,
        branch: input.scope,
        creditLimit: `CNY ${input.creditLimit}`,
        paymentTerms: input.paymentTerms,
      };
    },
    async upsertOrganization(record, version) {
      ensureSucceeded(
        await client.POST('/master-data/organization-nodes:upsert', {
          params: { header: upsertHeaders(record.mode, version) },
          body: record,
        })
      );
    },
    async upsertAddress(customerId, record, version) {
      ensureSucceeded(
        await client.POST('/customers/{customerId}/addresses:upsert', {
          params: { path: { customerId }, header: upsertHeaders(record.mode, version) },
          body: record,
        })
      );
    },
    async publishReference(record, version) {
      ensureSucceeded(
        await client.POST('/master-data/reference-data:publish', {
          params: { header: headers(version) },
          body: record,
        })
      );
    },
    async updateCredit(customerId, record, version) {
      ensureSucceeded(
        await client.PUT('/customers/{customerId}/credit-policy', {
          params: { path: { customerId }, header: headers(version) },
          body: record,
        })
      );
    },
  };
}
