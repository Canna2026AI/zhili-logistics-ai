// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import * as apiModule from './api';

type PlatformApiFactory = (
  client: {
    POST: ReturnType<typeof vi.fn>;
    PUT: ReturnType<typeof vi.fn>;
    DELETE: ReturnType<typeof vi.fn>;
  },
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
  updateRolePolicy: (...args: unknown[]) => Promise<unknown>;
  previewEffectivePermissions: (...args: unknown[]) => Promise<unknown>;
  previewFieldPolicy: (...args: unknown[]) => Promise<unknown>;
  startPermissionSimulation: (...args: unknown[]) => Promise<unknown>;
  verifyPermissionSimulation: (...args: unknown[]) => Promise<unknown>;
  endPermissionSimulation: (...args: unknown[]) => Promise<unknown>;
};

describe('platform OpenAPI adapter', () => {
  it('fails closed when typed IAM responses do not belong to the requested resource', async () => {
    const createPlatformApi = (apiModule as unknown as { createPlatformApi?: PlatformApiFactory })
      .createPlatformApi!;
    const roleId = '01JROLE000000000000000001';
    const userId = '01JUSER000000000000000001';
    const simulationId = '01JSIMULATION0000000000001';
    const api = createPlatformApi(
      {
        PUT: vi.fn().mockResolvedValue({
          data: { data: { roleId: 'another-role', statements: [], version: 0 } },
        }),
        POST: vi
          .fn()
          .mockResolvedValueOnce({
            data: { data: { userId: 'another-user', effectiveStatements: [], differences: [] } },
          })
          .mockResolvedValueOnce({
            data: { data: { subjectId: 'another-user', effectivePolicies: [], differences: [] } },
          })
          .mockResolvedValueOnce({
            data: {
              data: {
                id: simulationId,
                userId: 'another-user',
                actorId: '01JADMIN000000000000000001',
                expiresAt: '2099-12-31T23:59:59.000Z',
              },
            },
          })
          .mockResolvedValueOnce({
            data: {
              data: {
                simulationId: 'another-simulation',
                allowed: true,
                trace: ['role'],
              },
            },
          }),
        DELETE: vi.fn(),
      },
      () => 'idem-identity'
    );

    await expect(
      api.updateRolePolicy(roleId, 18, { statements: [], reason: '身份校验' })
    ).rejects.toThrow('ROLE_POLICY_RESPONSE_MISMATCH');
    await expect(api.previewEffectivePermissions(userId, {})).rejects.toThrow(
      'PERMISSION_PREVIEW_RESPONSE_MISMATCH'
    );
    await expect(
      api.previewFieldPolicy({ subjectId: userId, proposedPolicies: [] })
    ).rejects.toThrow('FIELD_POLICY_RESPONSE_MISMATCH');
    await expect(
      api.startPermissionSimulation({ userId, reason: '身份校验', durationMinutes: 15 })
    ).rejects.toThrow('PERMISSION_SIMULATION_RESPONSE_MISMATCH');
    await expect(
      api.verifyPermissionSimulation(simulationId, { resource: 'waybill', action: 'read' })
    ).rejects.toThrow('PERMISSION_DECISION_RESPONSE_MISMATCH');
  });

  it('reuses an app-local command idempotency key after a lost response and rotates it after success', async () => {
    window.history.replaceState({}, '', '/');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { operationId: 'OPS-1', status: 'SUCCEEDED', message: 'done' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { operationId: 'OPS-2', status: 'SUCCEEDED', message: 'done again' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiModule.platformPort.executeOperation('系统健康')).rejects.toThrow(
      'response lost'
    );
    await expect(apiModule.platformPort.executeOperation('系统健康')).resolves.toMatchObject({
      operationId: 'OPS-1',
    });
    await expect(apiModule.platformPort.executeOperation('系统健康')).resolves.toMatchObject({
      operationId: 'OPS-2',
    });

    const idempotencyKeys = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get('Idempotency-Key')
    );
    expect(idempotencyKeys[0]).toBeTruthy();
    expect(idempotencyKeys[1]).toBe(idempotencyKeys[0]);
    expect(idempotencyKeys[2]).not.toBe(idempotencyKeys[1]);
    vi.unstubAllGlobals();
  });

  it('rejects a successful impersonation response for a different tenant', async () => {
    window.history.replaceState({}, '', '/');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              id: '01JIMPERSONATE000000000001',
              tenantId: '01JTENANT0000000000000099',
              actorId: '01JADMIN000000000000000001',
              reason: '排查',
              expiresAt: '2099-12-31T23:59:59.000Z',
            },
          }),
          { status: 201, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    await expect(
      apiModule.platformPort.startImpersonation('01JTENANT0000000000000001', '排查')
    ).rejects.toThrow('IMPERSONATION_RESPONSE_MISMATCH');
    vi.unstubAllGlobals();
  });

  it('fails closed when an impersonation status receipt has the wrong session or version', async () => {
    window.history.replaceState({}, '', '/');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              sessionId: 'another-session',
              status: 'ACTIVE',
              permissionsVersion: 0,
              eventId: 'ACL-0',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );

    await expect(
      apiModule.platformPort.checkImpersonation('01JIMPERSONATE000000000001', 19)
    ).rejects.toThrow('IMPERSONATION_STATUS_RESPONSE_MISMATCH');
    vi.unstubAllGlobals();
  });

  it('derives status and entitlement mock ETags from non-default authoritative versions', async () => {
    const platformMockFetch = (apiModule as unknown as { platformMockFetch?: typeof fetch })
      .platformMockFetch;
    expect(platformMockFetch).toBeTypeOf('function');
    if (!platformMockFetch) return;

    const statusResponse = await platformMockFetch(
      new Request(
        'http://localhost/api/v1/platform/tenants/01JTENANT0000000000000001:change-status',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'If-Match': '"7"' },
          body: JSON.stringify({ status: 'SUSPENDED' }),
        }
      )
    );
    const statusBody = (await statusResponse.json()) as { data: { version: number } };
    expect(statusBody.data.version).toBe(8);
    expect(statusResponse.headers.get('ETag')).toBe('"8"');

    const entitlementResponse = await platformMockFetch(
      new Request(
        'http://localhost/api/v1/platform/tenants/01JTENANT0000000000000001/entitlements',
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json', 'If-Match': '"7"' },
          body: JSON.stringify({
            modules: [{ moduleCode: 'portal', enabled: true, quotas: {} }],
          }),
        }
      )
    );
    const entitlementBody = (await entitlementResponse.json()) as {
      data: { version: number };
    };
    expect(entitlementBody.data.version).toBe(8);
    expect(entitlementResponse.headers.get('ETag')).toBe('"8"');
  });

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
    const api = createPlatformApi({ POST, PUT, DELETE: vi.fn() }, () => 'idem-platform');
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

  it('uses every typed IAM route with the exact caller payload and authoritative versions', async () => {
    const createPlatformApi = (apiModule as unknown as { createPlatformApi?: PlatformApiFactory })
      .createPlatformApi;
    expect(createPlatformApi).toBeTypeOf('function');
    if (!createPlatformApi) return;
    const rolePolicy = {
      roleId: '01JROLE000000000000000001',
      statements: [
        { effect: 'ALLOW', resource: 'waybill', actions: ['read'], dataScope: 'TENANT' },
      ],
      version: 19,
    };
    const preview = {
      userId: '01JUSER000000000000000001',
      effectiveStatements: rolePolicy.statements,
      differences: ['新增 waybill.read'],
    };
    const fieldPreview = {
      subjectId: preview.userId,
      effectivePolicies: [
        { resource: 'waybill', field: 'customerPhone', decision: 'DENY', contexts: ['VIEW'] },
      ],
      differences: ['customerPhone MASK -> DENY'],
    };
    const simulation = {
      id: '01JSIMULATION0000000000001',
      userId: preview.userId,
      actorId: '01JADMIN000000000000000001',
      expiresAt: '2099-12-31T23:59:59.000Z',
    };
    const PUT = vi.fn().mockResolvedValue({ data: { data: rolePolicy } });
    const POST = vi
      .fn()
      .mockResolvedValueOnce({ data: { data: preview } })
      .mockResolvedValueOnce({ data: { data: fieldPreview } })
      .mockResolvedValueOnce({ data: { data: simulation } })
      .mockResolvedValueOnce({ data: { data: { allowed: true, trace: ['role'] } } });
    const DELETE = vi.fn().mockResolvedValue({ response: { status: 204 } });
    const api = createPlatformApi({ POST, PUT, DELETE }, () => 'idem-iam');

    await api.updateRolePolicy(rolePolicy.roleId, 18, {
      statements: rolePolicy.statements,
      reason: '季度权限复核',
    });
    await api.previewEffectivePermissions(preview.userId, {
      proposedRoleIds: [rolePolicy.roleId],
      proposedStatements: rolePolicy.statements,
    });
    await api.previewFieldPolicy({
      subjectId: preview.userId,
      proposedPolicies: fieldPreview.effectivePolicies,
    });
    await api.startPermissionSimulation({
      userId: preview.userId,
      reason: '验证字段脱敏',
      durationMinutes: 15,
    });
    await api.verifyPermissionSimulation(simulation.id, {
      resource: 'waybill',
      action: 'read',
      field: 'customerPhone',
    });
    await api.endPermissionSimulation(simulation.id);

    expect(PUT).toHaveBeenCalledWith('/iam/roles/{roleId}/policy', {
      params: {
        path: { roleId: rolePolicy.roleId },
        header: { 'Idempotency-Key': 'idem-iam', 'If-Match': '"18"' },
      },
      body: { statements: rolePolicy.statements, reason: '季度权限复核' },
    });
    expect(POST.mock.calls.map(([path]) => path)).toEqual([
      '/iam/users/{userId}/effective-permissions:preview',
      '/iam/field-policy:preview',
      '/iam/permission-simulations',
      '/iam/permission-simulations/{simulationId}:verify',
    ]);
    expect(DELETE).toHaveBeenCalledWith('/iam/permission-simulations/{simulationId}', {
      params: { path: { simulationId: simulation.id } },
    });
  });

  it.each([409, 422, 403, 410])('preserves authoritative IAM HTTP %s failures', async (status) => {
    const createPlatformApi = (apiModule as unknown as { createPlatformApi?: PlatformApiFactory })
      .createPlatformApi!;
    const failure = {
      error: { code: `IAM_${status}`, message: `server-${status}` },
      response: { status },
    };
    const api = createPlatformApi(
      {
        PUT: vi.fn().mockResolvedValue(failure),
        POST: vi.fn().mockResolvedValue(failure),
        DELETE: vi.fn().mockResolvedValue(failure),
      },
      () => 'idem-error'
    );
    const operation =
      status === 409 || status === 422
        ? api.updateRolePolicy('01JROLE000000000000000001', 18, {
            statements: [],
            reason: '复核失败证据',
          })
        : status === 403
          ? api.previewEffectivePermissions('01JUSER000000000000000001', {})
          : api.verifyPermissionSimulation('01JSIMULATION0000000000001', {
              resource: 'waybill',
              action: 'read',
            });

    await expect(operation).rejects.toMatchObject({ status, code: `IAM_${status}` });
  });
});
