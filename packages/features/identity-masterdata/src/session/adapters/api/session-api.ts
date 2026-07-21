import type { ZhiliApiClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';
import type { SessionInfo, SessionPort } from '../../model/session';

export function createSessionApi(client: ZhiliApiClient): SessionPort {
  const readSession = (response: {
    error?: unknown;
    data?: { data: components['schemas']['Session'] };
  }): SessionInfo => {
    if (response.error) throw response.error;
    if (!response.data) throw new Error('SESSION_RESPONSE_EMPTY');
    const { subjectId, tenantId, expiresAt, permissionsVersion } = response.data.data;
    return { subjectId, tenantId, expiresAt, permissionsVersion };
  };
  return {
    async login(credentials) {
      const response = await client.POST('/auth/password/sessions', { body: credentials });
      return readSession(response);
    },
    async refresh() {
      const response = await client.POST('/auth/sessions:refresh');
      return readSession(response);
    },
    async reauthenticate(session) {
      const response = await client.POST('/auth/sessions/current:reauthenticate', {
        body: { id: 'current-session', ...session },
      });
      if (response.error) throw response.error;
    },
    async logout() {
      const response = await client.DELETE('/auth/sessions/current');
      if (response.error) throw response.error;
    },
  };
}
