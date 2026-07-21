import type { ZhiliApiClient } from '@zhili/api-client';
import type { ImportPort } from '../../model/import';

export function createImportApi(
  client: ZhiliApiClient,
  createIdempotencyKey: () => string = () => crypto.randomUUID()
): ImportPort {
  const createHeaders = () => ({ 'Idempotency-Key': createIdempotencyKey() });
  const headers = (version: number) => ({
    'Idempotency-Key': createIdempotencyKey(),
    'If-Match': `"${version}"`,
  });
  return {
    async create(source) {
      const response = await client.POST('/imports', {
        params: { header: createHeaders() },
        body: { domain: 'ORDERS', sourceFileRef: source, atomicity: 'ALLOW_PARTIAL' },
      });
      if (response.error) throw response.error;
      if (!response.data) throw new Error('IMPORT_RESPONSE_EMPTY');
      return { id: response.data.data.id, version: response.data.data.version };
    },
    async validate(importId, version) {
      const response = await client.POST('/imports/{importId}:validate', {
        params: { path: { importId }, header: headers(version) },
      });
      if (response.error) throw response.error;
      return { id: importId, version: version + 1 };
    },
    async commit(importId, version, acknowledgePartial) {
      const response = await client.POST('/imports/{importId}:commit', {
        params: { path: { importId }, header: headers(version) },
        body: { mappingVersion: 1, validationVersion: version, acknowledgePartial },
      });
      if (response.error) throw response.error;
      return { id: importId, version: version + 1 };
    },
    async rollback(importId, version) {
      const response = await client.POST('/imports/{importId}:rollback', {
        params: { path: { importId }, header: headers(version) },
        body: { id: importId, version },
      });
      if (response.error) throw response.error;
      return { id: importId, version: version + 1, status: 'ROLLED_BACK' };
    },
  };
}
