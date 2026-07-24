import type { DeviceContext } from '../domain/types';

export function deviceTaskCacheKey(
  scope: Pick<DeviceContext, 'tenantId' | 'warehouseId' | 'subjectId' | 'deviceId'>
) {
  return `device-tasks:${scope.tenantId}:${scope.warehouseId}:${scope.subjectId}:${scope.deviceId}`;
}
