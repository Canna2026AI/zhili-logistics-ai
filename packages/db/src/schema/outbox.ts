import { sql } from 'drizzle-orm';
import {
  bigint,
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

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    aggregateVersion: bigint('aggregate_version', { mode: 'bigint' }).notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp('published_at', { mode: 'date', withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (table) => [
    unique('outbox_events_tenant_dedupe_unique').on(table.tenantId, table.dedupeKey),
    index('outbox_events_pending_idx').on(table.publishedAt, table.occurredAt),
    index('outbox_events_aggregate_idx').on(
      table.tenantId,
      table.aggregateType,
      table.aggregateId,
      table.aggregateVersion
    ),
    check('outbox_events_id_ulid_check', sql`${table.id} ~ '^[0-9A-HJKMNP-TV-Z]{26}$'`),
    check('outbox_events_tenant_ulid_check', sql`${table.tenantId} ~ '^[0-9A-HJKMNP-TV-Z]{26}$'`),
    check('outbox_events_aggregate_version_check', sql`${table.aggregateVersion} >= 0`),
    check('outbox_events_attempts_check', sql`${table.attempts} >= 0`),
    tenantIsolationPolicy('outbox_events_tenant_isolation', table.tenantId),
  ]
).enableRLS();
