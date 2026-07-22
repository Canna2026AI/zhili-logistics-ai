import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { tenantIsolationPolicy } from '../rls';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    subjectId: text('subject_id').notNull(),
    requestId: text('request_id').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_events_entity_idx').on(
      table.tenantId,
      table.entityType,
      table.entityId,
      table.occurredAt
    ),
    check('audit_events_id_ulid_check', sql`${table.id} ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check(
      'audit_events_tenant_ulid_check',
      sql`${table.tenantId} ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`
    ),
    tenantIsolationPolicy('audit_events_tenant_isolation', table.tenantId),
  ]
).enableRLS();
