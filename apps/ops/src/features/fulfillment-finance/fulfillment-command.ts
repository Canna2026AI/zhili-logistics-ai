import type {
  FulfillmentFinanceCommand,
  FulfillmentFinanceOperationId,
  FulfillmentSection,
} from './fulfillment-finance-workbench';

function canonicalPayload(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalPayload(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalPayload(item)}`)
    .join(',')}}`;
}

function payloadDigest(payload: Record<string, unknown> | undefined) {
  let hash = 0xcbf29ce484222325n;
  for (const unit of canonicalPayload(payload ?? {})) {
    hash ^= BigInt(unit.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export function createFulfillmentCommand(
  domain: FulfillmentSection,
  operationId: FulfillmentFinanceOperationId,
  entityRef: string,
  expectedVersion = 1,
  payload?: Record<string, unknown>
): FulfillmentFinanceCommand {
  return {
    domain,
    operationId,
    entityRef,
    idempotencyKey: `${operationId}:${entityRef}:v${expectedVersion}:p${payloadDigest(payload)}`,
    expectedVersion,
    payload,
  };
}
