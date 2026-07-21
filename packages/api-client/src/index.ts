import createClient from 'openapi-fetch';
import type { paths } from '@zhili/contracts';

export interface ZhiliClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createZhiliClient({ baseUrl = '/api/v1', fetch }: ZhiliClientOptions = {}) {
  return createClient<paths>({
    baseUrl,
    credentials: 'include',
    fetch,
  });
}

export type ZhiliApiClient = ReturnType<typeof createZhiliClient>;
