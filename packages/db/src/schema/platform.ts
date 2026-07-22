import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { tenantIsolationPolicy } from '../rls';

export interface ResponseHeadersSnapshot {
  readonly [name: string]: string | readonly string[];
}

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseHeaders: jsonb('response_headers').$type<ResponseHeadersSnapshot>(),
    responseBody: jsonb('response_body').$type<unknown>(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { mode: 'date', withTimezone: true }).notNull(),
  },
  (table) => [
    unique('idempotency_records_tenant_key_unique').on(table.tenantId, table.idempotencyKey),
    index('idempotency_records_expiry_idx').on(table.expiresAt),
    check('idempotency_records_id_ulid_check', sql`${table.id} ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check(
      'idempotency_records_tenant_ulid_check',
      sql`${table.tenantId} ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`
    ),
    check('idempotency_records_request_hash_check', sql`length(${table.requestHash}) = 64`),
    check('idempotency_records_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
    tenantIsolationPolicy('idempotency_records_tenant_isolation', table.tenantId),
  ]
).enableRLS();
