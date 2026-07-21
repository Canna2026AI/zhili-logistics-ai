import type { ZhiliApiClient } from '@zhili/api-client';
import { unreviewCharge } from '../../../../../packages/features/finance/src';
import type {
  FulfillmentFinanceCommand,
  FulfillmentFinanceCommandPort,
} from './fulfillment-finance-workbench';

function requireString(payload: Record<string, unknown> | undefined, key: string): string {
  const value = payload?.[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`命令缺少 ${key}`);
  return value;
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error && 'detail' in error) return String(error.detail);
  return 'API 命令执行失败';
}

/**
 * Production API adapter for the high-risk command. Other operation families are
 * composed by the application backend adapters through the same discriminated port.
 */
export function createApiFulfillmentFinanceCommandPort(
  client: ZhiliApiClient
): FulfillmentFinanceCommandPort {
  return {
    async execute(command: FulfillmentFinanceCommand) {
      if (command.operationId !== 'unreviewCharge') {
        throw new Error(`API 端口尚未注册操作 ${command.operationId}`);
      }
      if (command.expectedVersion === undefined) throw new Error('反审核缺少 If-Match 版本');

      const { data, error } = await unreviewCharge(
        client,
        command.entityRef,
        {
          reason: requireString(command.payload, 'reason'),
          impact: requireString(command.payload, 'impact'),
          version: command.expectedVersion,
        },
        {
          idempotencyKey: command.idempotencyKey,
          expectedVersion: String(command.expectedVersion),
        }
      );
      if (error) throw new Error(errorMessage(error));
      const response = data as unknown as { auditId?: string; meta?: { requestId?: string } };
      return {
        auditId: response.auditId ?? response.meta?.requestId ?? `AUD-${command.entityRef}`,
      };
    },
  };
}
