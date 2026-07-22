import { sql } from 'drizzle-orm';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PostgresJsTransaction } from 'drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'drizzle-orm/relations';
import { getDatabaseClient } from './client';
import * as schema from './schema';

export interface TenantContext {
  tenantId: string;
  subjectId: string;
  requestId: string;
  permissions: readonly string[];
}

export type DbTransaction = PostgresJsTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export type TenantWork<T> = (tx: DbTransaction) => Promise<T>;

interface ActiveTenantTransaction {
  readonly context: TenantContext;
  readonly transaction: DbTransaction;
}

const activeTenantTransaction = new AsyncLocalStorage<ActiveTenantTransaction>();

function requireNonEmpty(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Tenant context ${name} must be a non-empty string`);
  }
}

function validateContext(context: TenantContext): void {
  if (!context || typeof context !== 'object') {
    throw new Error('Tenant context is required');
  }

  requireNonEmpty('tenantId', context.tenantId);
  requireNonEmpty('subjectId', context.subjectId);
  requireNonEmpty('requestId', context.requestId);

  if (!Array.isArray(context.permissions)) {
    throw new Error('Tenant context permissions must be an array');
  }

  for (const permission of context.permissions) {
    requireNonEmpty('permissions entry', permission);
  }
}

function settingLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function setLocalContext(tx: DbTransaction, context: TenantContext): Promise<void> {
  await tx.execute(sql.raw(`SET LOCAL app.tenant_id = ${settingLiteral(context.tenantId)}`));
  await tx.execute(sql.raw(`SET LOCAL app.subject_id = ${settingLiteral(context.subjectId)}`));
  await tx.execute(sql.raw(`SET LOCAL app.request_id = ${settingLiteral(context.requestId)}`));
  await tx.execute(
    sql.raw(`SET LOCAL app.permissions = ${settingLiteral(JSON.stringify(context.permissions))}`)
  );
}

export async function withTenantTransaction<T>(
  context: TenantContext,
  work: TenantWork<T>
): Promise<T> {
  validateContext(context);
  if (typeof work !== 'function') throw new Error('Tenant transaction work must be a function');

  const active = activeTenantTransaction.getStore();
  if (active) {
    assertSameTenantContext(active.context, context);
    return work(active.transaction);
  }

  return getDatabaseClient().transaction(async (tx) => {
    await setLocalContext(tx, context);
    return activeTenantTransaction.run({ context, transaction: tx }, () => work(tx));
  });
}

export function currentTenantTransaction(): DbTransaction | undefined {
  return activeTenantTransaction.getStore()?.transaction;
}

export async function withTenantSavepoint<T>(work: TenantWork<T>): Promise<T> {
  if (typeof work !== 'function') throw new Error('Tenant savepoint work must be a function');
  const active = activeTenantTransaction.getStore();
  if (!active) throw new Error('Tenant savepoint requires an active tenant transaction');

  return active.transaction.transaction((savepoint) =>
    activeTenantTransaction.run({ context: active.context, transaction: savepoint }, () =>
      work(savepoint)
    )
  );
}

function assertSameTenantContext(active: TenantContext, requested: TenantContext): void {
  const samePermissions =
    active.permissions.length === requested.permissions.length &&
    active.permissions.every((permission, index) => permission === requested.permissions[index]);
  if (
    active.tenantId !== requested.tenantId ||
    active.subjectId !== requested.subjectId ||
    active.requestId !== requested.requestId ||
    !samePermissions
  ) {
    throw new Error('Nested tenant transaction context must match the active request context');
  }
}
