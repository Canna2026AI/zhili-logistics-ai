import type { ZhiliApiClient } from '@zhili/api-client';
import type { SessionPort } from '../../model/session';

export function createSessionApi(client: ZhiliApiClient): SessionPort {
  return {
    async login(credentials) {
      const response = await client.POST('/auth/password/sessions', { body: credentials });
      if (response.error) throw response.error;
      if (!response.data) throw new Error('SESSION_RESPONSE_EMPTY');
      const { subjectId, tenantId, expiresAt, permissionsVersion } = response.data.data;
      return { subjectId, tenantId, expiresAt, permissionsVersion };
    },
  };
}
