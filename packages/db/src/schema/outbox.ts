import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { tenantIsolationPolicy, workerRole } from '../rls';

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
    traceId: text('trace_id'),
    publishedAt: timestamp('published_at', { mode: 'date', withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { mode: 'date', withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    deadLetteredAt: timestamp('dead_lettered_at', { mode: 'date', withTimezone: true }),
    deadLetterAttempts: integer('dead_letter_attempts').notNull().default(0),
  },
  (table) => [
    unique('outbox_events_tenant_dedupe_unique').on(table.tenantId, table.dedupeKey),
    index('outbox_events_pending_claim_idx')
      .on(table.nextAttemptAt, table.occurredAt)
      .where(sql`${table.publishedAt} IS NULL AND ${table.deadLetteredAt} IS NULL`),
    index('outbox_events_aggregate_idx').on(
      table.tenantId,
      table.aggregateType,
      table.aggregateId,
      table.aggregateVersion
    ),
    check('outbox_events_id_ulid_check', sql`${table.id} ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check(
      'outbox_events_tenant_ulid_check',
      sql`${table.tenantId} ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`
    ),
    check('outbox_events_aggregate_version_check', sql`${table.aggregateVersion} >= 0`),
    check('outbox_events_attempts_check', sql`${table.attempts} >= 0`),
    check('outbox_events_dead_letter_attempts_check', sql`${table.deadLetterAttempts} >= 0`),
    tenantIsolationPolicy('outbox_events_tenant_isolation', table.tenantId),
    pgPolicy('outbox_events_worker_select', {
      as: 'permissive',
      for: 'select',
      to: workerRole,
      using: sql`true`,
    }),
    pgPolicy('outbox_events_worker_update', {
      as: 'permissive',
      for: 'update',
      to: workerRole,
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ]
).enableRLS();
