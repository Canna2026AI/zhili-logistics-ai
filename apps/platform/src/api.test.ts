import { describe, expect, it, vi } from 'vitest';
import * as apiModule from './api';

type PlatformApiFactory = (
  client: { POST: ReturnType<typeof vi.fn>; PUT: ReturnType<typeof vi.fn> },
  createIdempotencyKey: () => string
) => {
  changeTenantStatus: (
    tenant: {
      id: string;
      name: string;
      slug: string;
      status: 'ACTIVE' | 'SUSPENDED';
      version: number;
    },
    status: 'ACTIVE' | 'SUSPENDED'
  ) => Promise<unknown>;
  saveEntitlements: (
    tenantId: string,
    version: number,
    body: {
      modules: Array<{ moduleCode: string; enabled: boolean; quotas: Record<string, number> }>;
    }
  ) => Promise<number>;
};

describe('platform OpenAPI adapter', () => {
  it('uses the caller tenant and current version and returns authoritative resources', async () => {
    const createPlatformApi = (apiModule as unknown as { createPlatformApi?: PlatformApiFactory })
      .createPlatformApi;
    expect(createPlatformApi).toBeTypeOf('function');
    if (!createPlatformApi) return;

    const POST = vi.fn().mockResolvedValue({
      data: {
        data: {
          id: '01JTENANT0000000000000001',
          name: '上海智立科技有限公司',
          slug: 'zhili-sh',
          status: 'SUSPENDED',
          version: 8,
        },
      },
    });
    const PUT = vi.fn().mockResolvedValue({
      data: {
        data: {
          tenantId: '01JTENANT0000000000000001',
          modules: [{ moduleCode: 'portal', enabled: true, quotas: {} }],
          version: 8,
        },
      },
    });
    const api = createPlatformApi({ POST, PUT }, () => 'idem-platform');
    const tenant = {
      id: '01JTENANT0000000000000001',
      name: '上海智立科技有限公司',
      slug: 'zhili-sh',
      status: 'ACTIVE' as const,
      version: 7,
    };

    await expect(api.changeTenantStatus(tenant, 'SUSPENDED')).resolves.toMatchObject({
      id: tenant.id,
      status: 'SUSPENDED',
      version: 8,
    });
    await expect(
      api.saveEntitlements(tenant.id, tenant.version, {
        modules: [{ moduleCode: 'portal', enabled: true, quotas: {} }],
      })
    ).resolves.toBe(8);

    expect(POST).toHaveBeenNthCalledWith(1, '/platform/tenants/{tenantId}:change-status', {
      params: {
        path: { tenantId: tenant.id },
        header: { 'Idempotency-Key': 'idem-platform', 'If-Match': '"7"' },
      },
      body: { status: 'SUSPENDED' },
    });
    expect(PUT).toHaveBeenCalledWith('/platform/tenants/{tenantId}/entitlements', {
      params: {
        path: { tenantId: tenant.id },
        header: { 'Idempotency-Key': 'idem-platform', 'If-Match': '"7"' },
      },
      body: { modules: [{ moduleCode: 'portal', enabled: true, quotas: {} }] },
    });
  });
});
