import { sql } from 'drizzle-orm';
import { pgPolicy, pgRole, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const applicationRole = pgRole('zhili_app').existing();

export function tenantIsolationPolicy(name: string, tenantId: AnyPgColumn) {
  const belongsToCurrentTenant = sql`${tenantId} = nullif(current_setting('app.tenant_id', true), '')`;

  return pgPolicy(name, {
    as: 'permissive',
    for: 'all',
    to: applicationRole,
    using: belongsToCurrentTenant,
    withCheck: belongsToCurrentTenant,
  });
}
