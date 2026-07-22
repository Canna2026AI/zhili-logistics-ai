import { sql } from 'drizzle-orm';
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

  return getDatabaseClient().transaction(async (tx) => {
    await setLocalContext(tx, context);
    return work(tx);
  });
}
