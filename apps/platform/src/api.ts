import { createZhiliClient } from '@zhili/api-client';
import type { ZhiliApiClient } from '@zhili/api-client';
import type { components } from '@zhili/contracts';

const json = (body: unknown, status = 200, authoritativeVersion?: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(authoritativeVersion === undefined ? {} : { ETag: `"${authoritativeVersion}"` }),
    },
  });
const meta = { requestId: 'req-f1c-platform', asOf: '2026-07-22T00:00:00.000Z' };
export const platformMockFetch: typeof fetch = async (input) => {
  const request = input instanceof Request ? input : new Request(input);
  const path = new URL(request.url).pathname;
  const rolePolicy = path.match(/\/iam\/roles\/([^/]+)\/policy$/);
  if (rolePolicy && request.method === 'PUT') {
    const body = (await request.clone().json()) as components['schemas']['UpdateRolePolicyRequest'];
    const version = Number(request.headers.get('If-Match')?.replaceAll('"', '') ?? 18) + 1;
    return json(
      { data: { roleId: rolePolicy[1], statements: body.statements, version }, meta },
      200,
      version
    );
  }
  const effectivePreview = path.match(/\/iam\/users\/([^/]+)\/effective-permissions:preview$/);
  if (effectivePreview && request.method === 'POST') {
    const body = (await request
      .clone()
      .json()) as components['schemas']['PermissionPreviewRequest'];
    return json({
      data: {
        userId: effectivePreview[1],
        effectiveStatements: body.proposedStatements ?? [],
        differences: ['新增 3 项', '移除 1 项'],
      },
      meta,
    });
  }
  if (path.endsWith('/iam/field-policy:preview') && request.method === 'POST') {
    const body = (await request
      .clone()
      .json()) as components['schemas']['PreviewFieldPolicyRequest'];
    return json({
      data: {
        subjectId: body.subjectId,
        effectivePolicies: body.proposedPolicies,
        differences: body.proposedPolicies.map((item) => `${item.field}:${item.decision}`),
      },
      meta,
    });
  }
  if (path.endsWith('/iam/permission-simulations') && request.method === 'POST') {
    const body = (await request
      .clone()
      .json()) as components['schemas']['StartPermissionSimulationRequest'];
    return json(
      {
        data: {
          id: '01JSIMULATION0000000000001',
          userId: body.userId,
          actorId: '01JADMIN000000000000000001',
          expiresAt: new Date(Date.now() + body.durationMinutes * 60_000).toISOString(),
        },
        meta,
      },
      201
    );
  }
  if (/\/iam\/permission-simulations\/[^/]+:verify$/.test(path) && request.method === 'POST')
    return json({ data: { allowed: true, trace: ['tenant', 'role', 'field-policy'] }, meta });
  if (/\/iam\/permission-simulations\/[^/]+$/.test(path) && request.method === 'DELETE')
    return new Response(null, { status: 204 });
  if (path.endsWith('/platform/tenants'))
    return json(
      {
        data: {
          id: '01JTENANT0000000000000006',
          name: '厦门远海物流有限公司',
          slug: 'yuanhai-xm',
          status: 'ACTIVE',
          version: 1,
        },
        meta,
      },
      201,
      1
    );
  if (path.endsWith('/platform/impersonations'))
    return json(
      {
        data: {
          id: '01JIMPERSONATE000000000001',
          tenantId: '01JTENANT0000000000000001',
          actorId: '01JADMIN000000000000000001',
          reason: '协助排查订单同步问题',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        meta,
      },
      201
    );
  if (path.endsWith('/platform/impersonations/current')) return new Response(null, { status: 204 });
  const tenantStatus = path.match(/\/platform\/tenants\/([^/]+):change-status$/);
  if (tenantStatus) {
    const body = (await request.clone().json()) as { status: 'ACTIVE' | 'SUSPENDED' };
    const currentVersion = Number(request.headers.get('If-Match')?.replaceAll('"', '') ?? 1);
    const nextVersion = currentVersion + 1;
    return json(
      {
        data: {
          id: tenantStatus[1],
          name: '上海智立科技有限公司',
          slug: 'zhili-sh',
          status: body.status,
          version: nextVersion,
        },
        meta,
      },
      200,
      nextVersion
    );
  }
  const tenantEntitlements = path.match(/\/platform\/tenants\/([^/]+)\/entitlements$/);
  if (tenantEntitlements) {
    const body = (await request
      .clone()
      .json()) as components['schemas']['UpdateTenantEntitlementsRequest'];
    const currentVersion = Number(request.headers.get('If-Match')?.replaceAll('"', '') ?? 1);
    const nextVersion = currentVersion + 1;
    return json(
      {
        data: {
          tenantId: tenantEntitlements[1],
          modules: body.modules,
          version: nextVersion,
        },
        meta,
      },
      200,
      nextVersion
    );
  }
  return json({ message: `No typed mock route for ${path}` }, 404);
};

export type RuntimeDifference = { field: string; local: string; server: string };
const revokedMockSessions = new Set<string>();

/** App-local port for platform operations pending inclusion in shared OpenAPI. */
const platformCommand = async <TResponse>(
  path: string,
  body: Record<string, unknown>
): Promise<TResponse> => {
  const mock =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('mock') === '1';
  if (mock && path === '/api/v1/platform/plans')
    return { id: 'PLAN-CUSTOM', name: body.name, status: 'DRAFT', version: 1 } as TResponse;
  if (mock && path === '/api/v1/platform/announcements')
    return { id: 'ANN-20260722-01', status: 'PUBLISHED', version: 1 } as TResponse;
  if (mock && path === '/api/v1/platform/runtime-snapshots:compare')
    return {
      serverVersion: 'runtime-v13',
      differences: [{ field: 'snapshotAt', local: '10:18', server: '10:21' }],
    } as TResponse;
  if (mock && path === '/api/v1/platform/runtime-snapshots:refresh')
    return { version: 'runtime-v13', refreshedAt: '10:21' } as TResponse;
  if (mock && path === '/api/v1/platform/runtime-jobs:retry-failed') {
    const itemIds = body.itemIds as string[];
    return { items: itemIds.map((id) => ({ id, status: 'SUCCEEDED' })) } as TResponse;
  }
  if (mock && path.startsWith('/api/v1/platform/operations/')) {
    if (path.endsWith('/release'))
      throw new PlatformApiError(403, 'FORBIDDEN', '缺少 platform.release.publish 权限');
    return {
      operationId: `OPS-${path.split('/').at(-1)?.toUpperCase()}-21`,
      status: 'SUCCEEDED',
      message: '服务端操作已完成',
    } as TResponse;
  }
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const value = isRecord(payload) ? payload : {};
    throw new PlatformApiError(
      response.status,
      String(value.code ?? 'PLATFORM_OPERATION_FAILED'),
      String(value.message ?? `平台命令失败（${response.status}）`)
    );
  }
  return (isRecord(payload) && 'data' in payload ? payload.data : payload) as TResponse;
};

const key = () => `f1c-${crypto.randomUUID?.() ?? Date.now()}`;
const ensure = <T>(data: T | undefined, error: unknown): T => {
  if (!data || error) throw new Error('平台命令失败，输入已保留，请重试。');
  return data;
};
export class PlatformApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly remediation?: string
  ) {
    super(message);
    this.name = 'PlatformApiError';
  }
}
function throwResponseError(response: {
  error?: unknown;
  response?: Response | { status?: number };
}) {
  if (!response.error) return;
  const value = isRecord(response.error) ? response.error : {};
  throw new PlatformApiError(
    Number(response.response?.status ?? 0),
    typeof value.code === 'string' ? value.code : 'PLATFORM_API_ERROR',
    typeof value.message === 'string' ? value.message : '平台命令失败，输入已保留，请重试。',
    typeof value.remediation === 'string' ? value.remediation : undefined
  );
}
const entitlementCode = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'core';

type TenantResource = components['schemas']['Tenant'];
type TenantStatusResult = Omit<TenantResource, 'status'> & {
  status: 'ACTIVE' | 'SUSPENDED';
};
type EntitlementRequest = components['schemas']['UpdateTenantEntitlementsRequest'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveVersion(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1;
}

function isTenant(value: unknown): value is TenantResource {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    ['ACTIVE', 'SUSPENDED', 'EXPIRED'].includes(String(value.status)) &&
    isPositiveVersion(value.version)
  );
}

export function createPlatformApi(
  apiClient: Pick<ZhiliApiClient, 'POST' | 'PUT' | 'DELETE'>,
  createIdempotencyKey: () => string = () => `platform-${crypto.randomUUID()}`
) {
  return {
    async changeTenantStatus(
      tenant: TenantResource,
      status: 'ACTIVE' | 'SUSPENDED'
    ): Promise<TenantStatusResult> {
      const response = await apiClient.POST('/platform/tenants/{tenantId}:change-status', {
        params: {
          path: { tenantId: tenant.id },
          header: {
            'Idempotency-Key': createIdempotencyKey(),
            'If-Match': `"${tenant.version}"`,
          },
        },
        body: { status },
      });
      throwResponseError(response);
      const data: unknown = response.data?.data;
      if (!isTenant(data) || data.id !== tenant.id || data.status !== status)
        throw new Error('TENANT_STATUS_RESPONSE_INCOMPLETE');
      return data as TenantStatusResult;
    },
    async saveEntitlements(
      tenantId: string,
      version: number,
      body: EntitlementRequest
    ): Promise<number> {
      const response = await apiClient.PUT('/platform/tenants/{tenantId}/entitlements', {
        params: {
          path: { tenantId },
          header: {
            'Idempotency-Key': createIdempotencyKey(),
            'If-Match': `"${version}"`,
          },
        },
        body,
      });
      throwResponseError(response);
      const data: unknown = response.data?.data;
      if (
        !isRecord(data) ||
        data.tenantId !== tenantId ||
        !Array.isArray(data.modules) ||
        !isPositiveVersion(data.version)
      ) {
        throw new Error('TENANT_ENTITLEMENTS_RESPONSE_INCOMPLETE');
      }
      return data.version;
    },
    async updateRolePolicy(
      roleId: string,
      version: number,
      body: components['schemas']['UpdateRolePolicyRequest']
    ) {
      const response = await apiClient.PUT('/iam/roles/{roleId}/policy', {
        params: {
          path: { roleId },
          header: { 'Idempotency-Key': createIdempotencyKey(), 'If-Match': `"${version}"` },
        },
        body,
      });
      throwResponseError(response);
      return ensure(response.data, response.error).data;
    },
    async previewEffectivePermissions(
      userId: string,
      body: components['schemas']['PermissionPreviewRequest']
    ) {
      const response = await apiClient.POST('/iam/users/{userId}/effective-permissions:preview', {
        params: { path: { userId } },
        body,
      });
      throwResponseError(response);
      return ensure(response.data, response.error).data;
    },
    async previewFieldPolicy(body: components['schemas']['PreviewFieldPolicyRequest']) {
      const response = await apiClient.POST('/iam/field-policy:preview', { body });
      throwResponseError(response);
      return ensure(response.data, response.error).data;
    },
    async startPermissionSimulation(
      body: components['schemas']['StartPermissionSimulationRequest']
    ) {
      const response = await apiClient.POST('/iam/permission-simulations', {
        params: { header: { 'Idempotency-Key': createIdempotencyKey() } },
        body,
      });
      throwResponseError(response);
      return ensure(response.data, response.error).data;
    },
    async verifyPermissionSimulation(
      simulationId: string,
      body: components['schemas']['VerifyPermissionRequest']
    ) {
      const response = await apiClient.POST('/iam/permission-simulations/{simulationId}:verify', {
        params: { path: { simulationId } },
        body,
      });
      throwResponseError(response);
      return ensure(response.data, response.error).data;
    },
    async endPermissionSimulation(simulationId: string) {
      const response = await apiClient.DELETE('/iam/permission-simulations/{simulationId}', {
        params: { path: { simulationId } },
      });
      throwResponseError(response);
    },
  };
}

const runtimeClient = () =>
  createZhiliClient({
    baseUrl:
      typeof window === 'undefined'
        ? 'http://localhost/api/v1'
        : `${window.location.origin}/api/v1`,
    fetch:
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mock') === '1'
        ? platformMockFetch
        : undefined,
  });
const typedPlatformApi = () => createPlatformApi(runtimeClient(), key);

export const platformPort = {
  async createTenant(name: string, slug: string, plan: string) {
    const client = runtimeClient();
    const response = await client.POST('/platform/tenants', {
      params: { header: { 'Idempotency-Key': key() } },
      body: { name, slug, defaultTimezone: 'Asia/Shanghai', defaultCurrency: 'CNY' },
    });
    const created = ensure(response.data, response.error).data;
    const version = await typedPlatformApi().saveEntitlements(created.id, created.version, {
      modules: [
        {
          moduleCode: entitlementCode(plan),
          enabled: true,
          quotas: { monthlyWaybills: 200000 },
        },
      ],
    });
    return { ...created, version };
  },
  async startImpersonation(tenantId: string, reason: string) {
    const client = runtimeClient();
    const response = await client.POST('/platform/impersonations', {
      params: { header: { 'Idempotency-Key': key() } },
      body: { tenantId, reason, durationMinutes: 60 },
    });
    const created = ensure(response.data, response.error).data;
    revokedMockSessions.delete(created.id);
    return created;
  },
  async endImpersonation() {
    const client = runtimeClient();
    const response = await client.DELETE('/platform/impersonations/current');
    throwResponseError(response);
  },
  changeTenantStatus: (
    ...args: Parameters<ReturnType<typeof typedPlatformApi>['changeTenantStatus']>
  ) => typedPlatformApi().changeTenantStatus(...args),
  saveEntitlements: (
    ...args: Parameters<ReturnType<typeof typedPlatformApi>['saveEntitlements']>
  ) => typedPlatformApi().saveEntitlements(...args),
  updateRolePolicy: (
    ...args: Parameters<ReturnType<typeof typedPlatformApi>['updateRolePolicy']>
  ) => typedPlatformApi().updateRolePolicy(...args),
  previewEffectivePermissions: (
    ...args: Parameters<ReturnType<typeof typedPlatformApi>['previewEffectivePermissions']>
  ) => typedPlatformApi().previewEffectivePermissions(...args),
  previewFieldPolicy: (
    ...args: Parameters<ReturnType<typeof typedPlatformApi>['previewFieldPolicy']>
  ) => typedPlatformApi().previewFieldPolicy(...args),
  startPermissionSimulation: (
    ...args: Parameters<ReturnType<typeof typedPlatformApi>['startPermissionSimulation']>
  ) => typedPlatformApi().startPermissionSimulation(...args),
  verifyPermissionSimulation: (
    ...args: Parameters<ReturnType<typeof typedPlatformApi>['verifyPermissionSimulation']>
  ) => typedPlatformApi().verifyPermissionSimulation(...args),
  endPermissionSimulation: (
    ...args: Parameters<ReturnType<typeof typedPlatformApi>['endPermissionSimulation']>
  ) => typedPlatformApi().endPermissionSimulation(...args),
  setModuleEntitlement(tenantId: string, version: number, module: string, enabled: boolean) {
    return typedPlatformApi().saveEntitlements(tenantId, version, {
      modules: [{ moduleCode: entitlementCode(module), enabled, quotas: {} }],
    });
  },
  saveTenantConfiguration(
    tenantId: string,
    version: number,
    body: { plan: string; waybillLimit: number; expires: string }
  ) {
    return typedPlatformApi().saveEntitlements(tenantId, version, {
      modules: [
        {
          moduleCode: entitlementCode(body.plan),
          enabled: true,
          expiresAt: new Date(`${body.expires}T23:59:59.999Z`).toISOString(),
          quotas: { monthlyWaybills: body.waybillLimit },
        },
      ],
    });
  },
  async createPlan(name: string) {
    await platformCommand('/api/v1/platform/plans', { name });
  },
  async publishAnnouncement(title: string) {
    await platformCommand('/api/v1/platform/announcements', { title, audience: 'ALL_TENANTS' });
  },
  compareRuntime(localVersion: string) {
    return platformCommand<{ serverVersion: string; differences: RuntimeDifference[] }>(
      '/api/v1/platform/runtime-snapshots:compare',
      { localVersion }
    );
  },
  refreshRuntime(serverVersion = 'runtime-v13') {
    return platformCommand<{ version: string; refreshedAt: string }>(
      '/api/v1/platform/runtime-snapshots:refresh',
      { serverVersion }
    );
  },
  retryRuntimeJobs(itemIds: string[]) {
    return platformCommand<{ items: Array<{ id: string; status: 'SUCCEEDED' }> }>(
      '/api/v1/platform/runtime-jobs:retry-failed',
      { itemIds }
    );
  },
  executeOperation(page: '系统健康' | '任务与队列' | '审计日志' | '版本发布') {
    const code = {
      系统健康: 'health',
      任务与队列: 'queue',
      审计日志: 'audit',
      版本发布: 'release',
    }[page];
    return platformCommand<{ operationId: string; status: 'SUCCEEDED'; message: string }>(
      `/api/v1/platform/operations/${code}`,
      { page }
    );
  },
  async checkImpersonation(sessionId: string, permissionsVersion: number) {
    const mock =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mock') === '1';
    if (mock)
      return revokedMockSessions.has(sessionId)
        ? {
            status: 'REVOKED' as const,
            permissionsVersion: Math.max(20, permissionsVersion + 1),
            eventId: 'ACL-MOCK-20',
          }
        : {
            status: 'ACTIVE' as const,
            permissionsVersion: permissionsVersion || 19,
            eventId: `SESSION-${sessionId.slice(-6)}`,
          };
    const response = await fetch(
      `/api/v1/platform/impersonations/${sessionId}:status?permissionsVersion=${permissionsVersion}`,
      { credentials: 'include' }
    );
    const payload = await response.json().catch(() => undefined);
    if (!response.ok)
      throw new PlatformApiError(
        response.status,
        'IMPERSONATION_STATUS_FAILED',
        String((isRecord(payload) && payload.message) || '代入会话状态检查失败')
      );
    return (isRecord(payload) && 'data' in payload ? payload.data : payload) as {
      status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
      permissionsVersion: number;
      eventId: string;
    };
  },
  async revokeMockImpersonation(sessionId: string) {
    const mock =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mock') === '1';
    if (!mock) throw new PlatformApiError(403, 'MOCK_ONLY', '生产环境禁止模拟撤权');
    revokedMockSessions.add(sessionId);
  },
};
