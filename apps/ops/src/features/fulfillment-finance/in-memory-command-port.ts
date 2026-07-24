import type { FulfillmentFinanceCommandPort } from './fulfillment-finance-workbench';

export function createInMemoryFulfillmentFinanceCommandPort(): FulfillmentFinanceCommandPort {
  const auditSequence = new Map<string, number>();
  const completed = new Map<string, { auditId: string }>();

  return {
    async execute(command) {
      if (!command.operationId || !command.entityRef || !command.idempotencyKey) {
        throw new Error('命令缺少 operationId、entityRef 或幂等键');
      }
      const duplicate = completed.get(command.idempotencyKey);
      if (duplicate) return duplicate;

      await Promise.resolve();
      const next = (auditSequence.get(command.operationId) ?? 0) + 1;
      auditSequence.set(command.operationId, next);
      const result = { auditId: `AUD-${command.operationId}-${next}` };
      completed.set(command.idempotencyKey, result);
      return result;
    },
  };
}
