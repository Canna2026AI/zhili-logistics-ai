import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import {
  organizations,
  sessions,
  tenants,
  users,
  warehouses,
} from './identity';
import { partners } from './identity-contracts';
import { idempotencyRecords } from './platform';
import {
  attachments,
  customsDeclarations,
  orders,
  quoteAcceptances,
  quoteOptions,
  quoteVersions,
  quotes,
  waybills,
} from './rates-waybills';
import {
  billsOfLading,
  deliveryTasks,
  deviceMediaReservations,
  loadUnits,
  podVersions,
} from './warehouse-linehaul';

const tenantPolicy = (name: string) =>
  pgPolicy(name, {
    as: 'permissive',
    for: 'all',
    to: ['zhili_app'],
    using: sql`tenant_id = NULLIF(current_setting('app.tenant_id', true), '')`,
    withCheck: sql`tenant_id = NULLIF(current_setting('app.tenant_id', true), '')`,
  });

const versionCheck = (name: string) => check(name, sql`version >= 1`);
const timestampsCheck = (name: string) => check(name, sql`updated_at >= created_at`);
const tenantIdentityChecks = (
  name: string,
  table: { id: AnyPgColumn; tenantId: AnyPgColumn }
) => [
  check(`${name}_id_ulid_check`, sql`${table.id} ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
  check(
    `${name}_tenant_id_ulid_check`,
    sql`${table.tenantId} ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`
  ),
] as const;

export const userOrganizationMemberships = pgTable(
  'user_organization_memberships',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    organizationId: text('organization_id').notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'user_org_memberships_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'user_org_memberships_user_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizations.tenantId, organizations.id],
      name: 'user_org_memberships_organization_fk',
    }).onDelete('restrict'),
    unique('user_org_memberships_identity_unique').on(table.tenantId, table.id),
    unique('user_org_memberships_user_org_unique').on(
      table.tenantId,
      table.userId,
      table.organizationId
    ),
    uniqueIndex('user_org_memberships_one_primary_idx')
      .on(table.tenantId, table.userId)
      .where(sql`is_primary`),
    ...tenantIdentityChecks('user_org_memberships', table),
    tenantPolicy('user_org_memberships_tenant_isolation'),
    versionCheck('user_org_memberships_version_check'),
    timestampsCheck('user_org_memberships_timestamps_check'),
  ]
).enableRLS();

export const partnerContacts = pgTable(
  'partner_contacts',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    partnerId: text('partner_id').notNull(),
    contactName: text('contact_name').notNull(),
    contactPhone: text('contact_phone'),
    contactEmail: text('contact_email'),
    isPrimary: boolean('is_primary').default(false).notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'partner_contacts_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.partnerId],
      foreignColumns: [partners.tenantId, partners.id],
      name: 'partner_contacts_partner_fk',
    }).onDelete('cascade'),
    unique('partner_contacts_identity_unique').on(table.tenantId, table.id),
    uniqueIndex('partner_contacts_one_primary_idx')
      .on(table.tenantId, table.partnerId)
      .where(sql`is_primary`),
    ...tenantIdentityChecks('partner_contacts', table),
    tenantPolicy('partner_contacts_tenant_isolation'),
    check(
      'partner_contacts_name_check',
      sql`length(btrim(contact_name)) BETWEEN 1 AND 160`
    ),
    check(
      'partner_contacts_channel_check',
      sql`contact_phone IS NOT NULL OR contact_email IS NOT NULL`
    ),
    versionCheck('partner_contacts_version_check'),
    timestampsCheck('partner_contacts_timestamps_check'),
  ]
).enableRLS();

export const reauthenticationGrants = pgTable(
  'reauthentication_grants',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    sessionId: text('session_id').notNull(),
    grantDigest: text('grant_digest').notNull(),
    actionClasses: jsonb('action_classes').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'string' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('reauthentication_grants_expiry_idx').on(table.tenantId, table.expiresAt),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'reauthentication_grants_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'reauthentication_grants_user_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.sessionId],
      foreignColumns: [sessions.tenantId, sessions.id],
      name: 'reauthentication_grants_session_fk',
    }).onDelete('cascade'),
    unique('reauthentication_grants_identity_unique').on(table.tenantId, table.id),
    unique('reauthentication_grants_digest_unique').on(table.grantDigest),
    ...tenantIdentityChecks('reauthentication_grants', table),
    tenantPolicy('reauthentication_grants_tenant_isolation'),
    check('reauthentication_grants_digest_check', sql`grant_digest ~ '^[0-9a-f]{64}$'`),
    check(
      'reauthentication_grants_actions_check',
      sql`jsonb_typeof(action_classes) = 'array' AND jsonb_array_length(action_classes) > 0`
    ),
    check(
      'reauthentication_grants_lifecycle_check',
      sql`expires_at > created_at AND NOT (consumed_at IS NOT NULL AND revoked_at IS NOT NULL)`
    ),
    versionCheck('reauthentication_grants_version_check'),
    timestampsCheck('reauthentication_grants_timestamps_check'),
  ]
).enableRLS();

// Global keyed buckets intentionally have no zhili_app policy/grants. Unknown logins do not have
// a truthful tenant scope; FORCE RLS plus no policy keeps direct access fail-closed while the
// SECURITY DEFINER auth capability can still mutate these rows as the table owner.
export const loginThrottleBuckets = pgTable(
  'login_throttle_buckets',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id'),
    loginKeyHash: text('login_key_hash').notNull(),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true, mode: 'string' }).notNull(),
    failureCount: integer('failure_count').default(0).notNull(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true, mode: 'string' }),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'login_throttle_buckets_tenant_fk',
    }).onDelete('cascade'),
    unique('login_throttle_buckets_key_unique').on(table.loginKeyHash),
    check('login_throttle_buckets_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check(
      'login_throttle_buckets_tenant_id_ulid_check',
      sql`tenant_id IS NULL OR tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`
    ),
    check('login_throttle_buckets_hash_check', sql`login_key_hash ~ '^[0-9a-f]{64}$'`),
    check('login_throttle_buckets_failures_check', sql`failure_count >= 0`),
    versionCheck('login_throttle_buckets_version_check'),
    timestampsCheck('login_throttle_buckets_timestamps_check'),
  ]
).enableRLS();

export const shipmentRestrictionRules = pgTable(
  'shipment_restriction_rules',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    ruleCode: text('rule_code').notNull(),
    severity: text().notNull(),
    transportMode: text('transport_mode'),
    originCountryCode: text('origin_country_code'),
    destinationCountryCode: text('destination_country_code'),
    packageType: text('package_type'),
    minWeightGrams: bigint('min_weight_grams', { mode: 'number' }),
    maxWeightGrams: bigint('max_weight_grams', { mode: 'number' }),
    conditionOperator: text('condition_operator').notNull(),
    conditionValue: jsonb('condition_value').notNull(),
    message: text().notNull(),
    remediation: text(),
    state: text().default('DRAFT').notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('shipment_restriction_rules_eval_idx').on(
      table.tenantId,
      table.state,
      table.transportMode,
      table.originCountryCode,
      table.destinationCountryCode
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'shipment_restriction_rules_tenant_fk',
    }).onDelete('cascade'),
    unique('shipment_restriction_rules_identity_unique').on(table.tenantId, table.id),
    unique('shipment_restriction_rules_code_unique').on(table.tenantId, table.ruleCode),
    ...tenantIdentityChecks('shipment_restriction_rules', table),
    tenantPolicy('shipment_restriction_rules_tenant_isolation'),
    check(
      'shipment_restriction_rules_shape_check',
      sql`severity IN ('INFO', 'WARNING', 'ERROR') AND state IN ('DRAFT', 'ACTIVE', 'INACTIVE') AND condition_operator IN ('EQ', 'IN', 'RANGE', 'REGEX') AND jsonb_typeof(condition_value) IN ('object', 'array', 'string', 'number')`
    ),
    check(
      'shipment_restriction_rules_weight_check',
      sql`(min_weight_grams IS NULL OR min_weight_grams >= 0) AND (max_weight_grams IS NULL OR max_weight_grams >= min_weight_grams)`
    ),
    versionCheck('shipment_restriction_rules_version_check'),
    timestampsCheck('shipment_restriction_rules_timestamps_check'),
  ]
).enableRLS();

export const orderPackageSnapshots = pgTable(
  'order_package_snapshots',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    orderId: text('order_id').notNull(),
    packageSequence: integer('package_sequence').notNull(),
    packageRef: text('package_ref').notNull(),
    packageType: text('package_type'),
    weightKg: numeric('weight_kg', { precision: 20, scale: 6 }).notNull(),
    lengthCm: numeric('length_cm', { precision: 20, scale: 6 }).notNull(),
    widthCm: numeric('width_cm', { precision: 20, scale: 6 }).notNull(),
    heightCm: numeric('height_cm', { precision: 20, scale: 6 }).notNull(),
    commodityDescription: text('commodity_description'),
    snapshotVersion: bigint('snapshot_version', { mode: 'number' }).default(1).notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'order_package_snapshots_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'order_package_snapshots_order_fk',
    }).onDelete('cascade'),
    unique('order_package_snapshots_identity_unique').on(table.tenantId, table.id),
    unique('order_package_snapshots_sequence_unique').on(
      table.tenantId,
      table.orderId,
      table.snapshotVersion,
      table.packageSequence
    ),
    ...tenantIdentityChecks('order_package_snapshots', table),
    tenantPolicy('order_package_snapshots_tenant_isolation'),
    check('order_package_snapshots_sequence_check', sql`package_sequence >= 1`),
    check(
      'order_package_snapshots_dimensions_check',
      sql`weight_kg > 0 AND length_cm > 0 AND width_cm > 0 AND height_cm > 0`
    ),
    check('order_package_snapshots_snapshot_version_check', sql`snapshot_version >= 1`),
    versionCheck('order_package_snapshots_version_check'),
    timestampsCheck('order_package_snapshots_timestamps_check'),
  ]
).enableRLS();

export const acceptedQuoteOrderLinks = pgTable(
  'accepted_quote_order_links',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    quoteId: text('quote_id').notNull(),
    quoteOptionId: text('quote_option_id').notNull(),
    quoteAcceptanceId: text('quote_acceptance_id').notNull(),
    quoteVersionId: text('quote_version_id').notNull(),
    acceptedQuoteVersion: bigint('accepted_quote_version', { mode: 'number' }).notNull(),
    orderId: text('order_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    acceptedBySubjectId: text('accepted_by_subject_id').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'accepted_quote_order_links_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.quoteId],
      foreignColumns: [quotes.tenantId, quotes.id],
      name: 'accepted_quote_order_links_quote_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [
        table.tenantId,
        table.quoteAcceptanceId,
        table.quoteId,
        table.quoteVersionId,
        table.quoteOptionId,
      ],
      foreignColumns: [
        quoteAcceptances.tenantId,
        quoteAcceptances.id,
        quoteAcceptances.quoteId,
        quoteAcceptances.quoteVersionId,
        quoteAcceptances.quoteOptionId,
      ],
      name: 'accepted_quote_order_links_acceptance_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.quoteId, table.acceptedQuoteVersion],
      foreignColumns: [
        quoteVersions.tenantId,
        quoteVersions.quoteId,
        quoteVersions.versionNumber,
      ],
      name: 'accepted_quote_order_links_version_number_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.quoteOptionId, table.quoteVersionId, table.quoteId],
      foreignColumns: [
        quoteOptions.tenantId,
        quoteOptions.id,
        quoteOptions.quoteVersionId,
        quoteOptions.quoteId,
      ],
      name: 'accepted_quote_order_links_option_ownership_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'accepted_quote_order_links_order_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'accepted_quote_order_links_waybill_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.acceptedBySubjectId],
      foreignColumns: [users.tenantId, users.id],
      name: 'accepted_quote_order_links_actor_fk',
    }).onDelete('restrict'),
    unique('accepted_quote_order_links_identity_unique').on(table.tenantId, table.id),
    unique('accepted_quote_order_links_order_unique').on(table.tenantId, table.orderId),
    unique('accepted_quote_order_links_waybill_unique').on(table.tenantId, table.waybillId),
    ...tenantIdentityChecks('accepted_quote_order_links', table),
    tenantPolicy('accepted_quote_order_links_tenant_isolation'),
    check('accepted_quote_order_links_quote_version_check', sql`accepted_quote_version >= 1`),
    versionCheck('accepted_quote_order_links_version_check'),
    timestampsCheck('accepted_quote_order_links_timestamps_check'),
  ]
).enableRLS();

export const waybillLineage = pgTable(
  'waybill_lineage',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    sourceWaybillId: text('source_waybill_id').notNull(),
    targetWaybillId: text('target_waybill_id').notNull(),
    relationshipType: text('relationship_type').notNull(),
    lineageGroupId: text('lineage_group_id').notNull(),
    itemSequence: integer('item_sequence').notNull(),
    packageRefs: jsonb('package_refs').default([]).notNull(),
    reason: text().notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'waybill_lineage_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.sourceWaybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'waybill_lineage_source_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.targetWaybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'waybill_lineage_target_fk',
    }).onDelete('restrict'),
    unique('waybill_lineage_identity_unique').on(table.tenantId, table.id),
    unique('waybill_lineage_edge_unique').on(
      table.tenantId,
      table.lineageGroupId,
      table.sourceWaybillId,
      table.targetWaybillId
    ),
    unique('waybill_lineage_sequence_unique').on(
      table.tenantId,
      table.lineageGroupId,
      table.itemSequence
    ),
    ...tenantIdentityChecks('waybill_lineage', table),
    tenantPolicy('waybill_lineage_tenant_isolation'),
    check('waybill_lineage_type_check', sql`relationship_type IN ('SPLIT', 'MERGE')`),
    check('waybill_lineage_distinct_check', sql`source_waybill_id <> target_waybill_id`),
    check('waybill_lineage_sequence_check', sql`item_sequence >= 1`),
    check('waybill_lineage_packages_check', sql`jsonb_typeof(package_refs) = 'array'`),
    versionCheck('waybill_lineage_version_check'),
    timestampsCheck('waybill_lineage_timestamps_check'),
  ]
).enableRLS();

export const waybillNumberHistory = pgTable(
  'waybill_number_history',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    previousNumber: text('previous_number').notNull(),
    newNumber: text('new_number').notNull(),
    reason: text().notNull(),
    changedBySubjectId: text('changed_by_subject_id').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'waybill_number_history_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'waybill_number_history_waybill_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.changedBySubjectId],
      foreignColumns: [users.tenantId, users.id],
      name: 'waybill_number_history_actor_fk',
    }).onDelete('restrict'),
    unique('waybill_number_history_identity_unique').on(table.tenantId, table.id),
    unique('waybill_number_history_previous_unique').on(table.tenantId, table.previousNumber),
    unique('waybill_number_history_new_unique').on(table.tenantId, table.newNumber),
    ...tenantIdentityChecks('waybill_number_history', table),
    tenantPolicy('waybill_number_history_tenant_isolation'),
    check('waybill_number_history_distinct_check', sql`previous_number <> new_number`),
    versionCheck('waybill_number_history_version_check'),
    timestampsCheck('waybill_number_history_timestamps_check'),
  ]
).enableRLS();

export const labelJobs = pgTable(
  'label_jobs',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    format: text().notNull(),
    copies: integer().notNull(),
    status: text().default('QUEUED').notNull(),
    objectRef: text('object_ref'),
    lastError: text('last_error'),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('label_jobs_queue_idx').on(table.tenantId, table.status, table.createdAt),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'label_jobs_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'label_jobs_waybill_fk',
    }).onDelete('cascade'),
    unique('label_jobs_identity_unique').on(table.tenantId, table.id),
    ...tenantIdentityChecks('label_jobs', table),
    tenantPolicy('label_jobs_tenant_isolation'),
    check('label_jobs_format_check', sql`format IN ('A4', '100X150')`),
    check('label_jobs_copies_check', sql`copies BETWEEN 1 AND 100`),
    check(
      'label_jobs_status_check',
      sql`status IN ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED')`
    ),
    check(
      'label_jobs_result_check',
      sql`(status = 'SUCCEEDED' AND object_ref IS NOT NULL AND last_error IS NULL) OR (status = 'FAILED' AND last_error IS NOT NULL) OR (status IN ('QUEUED', 'PROCESSING') AND object_ref IS NULL AND last_error IS NULL)`
    ),
    versionCheck('label_jobs_version_check'),
    timestampsCheck('label_jobs_timestamps_check'),
  ]
).enableRLS();

export const declarationAttachments = pgTable(
  'declaration_attachments',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    declarationId: text('declaration_id').notNull(),
    attachmentId: text('attachment_id'),
    attachmentRef: text('attachment_ref').notNull(),
    itemSequence: integer('item_sequence').notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'declaration_attachments_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.declarationId],
      foreignColumns: [customsDeclarations.tenantId, customsDeclarations.id],
      name: 'declaration_attachments_declaration_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.attachmentId],
      foreignColumns: [attachments.tenantId, attachments.id],
      name: 'declaration_attachments_attachment_fk',
    }).onDelete('restrict'),
    unique('declaration_attachments_identity_unique').on(table.tenantId, table.id),
    unique('declaration_attachments_ref_unique').on(
      table.tenantId,
      table.declarationId,
      table.attachmentRef
    ),
    unique('declaration_attachments_sequence_unique').on(
      table.tenantId,
      table.declarationId,
      table.itemSequence
    ),
    ...tenantIdentityChecks('declaration_attachments', table),
    tenantPolicy('declaration_attachments_tenant_isolation'),
    check('declaration_attachments_ref_check', sql`length(btrim(attachment_ref)) >= 1`),
    check('declaration_attachments_sequence_check', sql`item_sequence >= 1`),
    versionCheck('declaration_attachments_version_check'),
    timestampsCheck('declaration_attachments_timestamps_check'),
  ]
).enableRLS();

// This row is created in the same transaction as the foundation idempotency receipt and domain
// aggregate. Domain idempotency columns may remain NULL; this context is the authoritative link.
export const transactionCommandContexts = pgTable(
  'transaction_command_contexts',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    idempotencyRecordId: text('idempotency_record_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    operationId: text('operation_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'transaction_command_contexts_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.idempotencyRecordId],
      foreignColumns: [idempotencyRecords.tenantId, idempotencyRecords.id],
      name: 'transaction_command_contexts_receipt_fk',
    }).onDelete('cascade'),
    unique('transaction_command_contexts_identity_unique').on(table.tenantId, table.id),
    unique('transaction_command_contexts_receipt_unique').on(
      table.tenantId,
      table.idempotencyRecordId
    ),
    unique('transaction_command_contexts_key_unique').on(
      table.tenantId,
      table.idempotencyKey
    ),
    ...tenantIdentityChecks('transaction_command_contexts', table),
    tenantPolicy('transaction_command_contexts_tenant_isolation'),
    check('transaction_command_contexts_hash_check', sql`request_hash ~ '^[0-9a-f]{64}$'`),
    check(
      'transaction_command_contexts_shape_check',
      sql`length(btrim(idempotency_key)) >= 16 AND length(btrim(operation_id)) >= 1 AND length(btrim(aggregate_type)) >= 1 AND length(btrim(aggregate_id)) >= 1`
    ),
    versionCheck('transaction_command_contexts_version_check'),
    timestampsCheck('transaction_command_contexts_timestamps_check'),
  ]
).enableRLS();

export const warehouseLocationInventory = pgTable(
  'warehouse_location_inventory',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    warehouseId: text('warehouse_id').notNull(),
    locationId: text('location_id').notNull(),
    sku: text().notNull(),
    quantity: bigint({ mode: 'number' }).default(0).notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('warehouse_location_inventory_list_idx').on(
      table.tenantId,
      table.warehouseId,
      table.locationId,
      table.sku
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'warehouse_location_inventory_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.warehouseId],
      foreignColumns: [warehouses.tenantId, warehouses.id],
      name: 'warehouse_location_inventory_warehouse_fk',
    }).onDelete('restrict'),
    unique('warehouse_location_inventory_identity_unique').on(table.tenantId, table.id),
    unique('warehouse_location_inventory_balance_unique').on(
      table.tenantId,
      table.warehouseId,
      table.locationId,
      table.sku
    ),
    ...tenantIdentityChecks('warehouse_location_inventory', table),
    tenantPolicy('warehouse_location_inventory_tenant_isolation'),
    check('warehouse_location_inventory_sku_check', sql`length(btrim(sku)) BETWEEN 1 AND 120`),
    check('warehouse_location_inventory_quantity_check', sql`quantity >= 0`),
    versionCheck('warehouse_location_inventory_version_check'),
    timestampsCheck('warehouse_location_inventory_timestamps_check'),
  ]
).enableRLS();

export const warehouseLocationInventoryLedger = pgTable(
  'warehouse_location_inventory_ledger',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    balanceId: text('balance_id').notNull(),
    sku: text().notNull(),
    fromLocationId: text('from_location_id'),
    toLocationId: text('to_location_id'),
    quantityDelta: bigint('quantity_delta', { mode: 'number' }).notNull(),
    reason: text().notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('warehouse_location_inventory_ledger_fold_idx').on(
      table.tenantId,
      table.balanceId,
      table.occurredAt,
      table.id
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'warehouse_location_inventory_ledger_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.balanceId],
      foreignColumns: [warehouseLocationInventory.tenantId, warehouseLocationInventory.id],
      name: 'warehouse_location_inventory_ledger_balance_fk',
    }).onDelete('restrict'),
    unique('warehouse_location_inventory_ledger_identity_unique').on(table.tenantId, table.id),
    unique('warehouse_location_inventory_ledger_idempotency_unique').on(
      table.tenantId,
      table.idempotencyKey
    ),
    ...tenantIdentityChecks('warehouse_location_inventory_ledger', table),
    tenantPolicy('warehouse_location_inventory_ledger_tenant_isolation'),
    check('warehouse_location_inventory_ledger_quantity_check', sql`quantity_delta <> 0`),
    check(
      'warehouse_location_inventory_ledger_locations_check',
      sql`num_nonnulls(from_location_id, to_location_id) >= 1 AND from_location_id IS DISTINCT FROM to_location_id`
    ),
    versionCheck('warehouse_location_inventory_ledger_version_check'),
    timestampsCheck('warehouse_location_inventory_ledger_timestamps_check'),
  ]
).enableRLS();

export const warehouseStocktakes = pgTable(
  'warehouse_stocktakes',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    warehouseId: text('warehouse_id').notNull(),
    locationId: text('location_id').notNull(),
    countedAt: timestamp('counted_at', { withTimezone: true, mode: 'string' }).notNull(),
    status: text().default('COMMITTED').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'warehouse_stocktakes_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.warehouseId],
      foreignColumns: [warehouses.tenantId, warehouses.id],
      name: 'warehouse_stocktakes_warehouse_fk',
    }).onDelete('restrict'),
    unique('warehouse_stocktakes_identity_unique').on(table.tenantId, table.id),
    unique('warehouse_stocktakes_idempotency_unique').on(table.tenantId, table.idempotencyKey),
    ...tenantIdentityChecks('warehouse_stocktakes', table),
    tenantPolicy('warehouse_stocktakes_tenant_isolation'),
    check('warehouse_stocktakes_status_check', sql`status IN ('COMMITTED', 'VOID')`),
    versionCheck('warehouse_stocktakes_version_check'),
    timestampsCheck('warehouse_stocktakes_timestamps_check'),
  ]
).enableRLS();

export const warehouseStocktakeItems = pgTable(
  'warehouse_stocktake_items',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    stocktakeId: text('stocktake_id').notNull(),
    itemSequence: integer('item_sequence').notNull(),
    sku: text().notNull(),
    countedQuantity: bigint('counted_quantity', { mode: 'number' }).notNull(),
    previousQuantity: bigint('previous_quantity', { mode: 'number' }).notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'warehouse_stocktake_items_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.stocktakeId],
      foreignColumns: [warehouseStocktakes.tenantId, warehouseStocktakes.id],
      name: 'warehouse_stocktake_items_stocktake_fk',
    }).onDelete('cascade'),
    unique('warehouse_stocktake_items_identity_unique').on(table.tenantId, table.id),
    unique('warehouse_stocktake_items_sequence_unique').on(
      table.tenantId,
      table.stocktakeId,
      table.itemSequence
    ),
    unique('warehouse_stocktake_items_sku_unique').on(
      table.tenantId,
      table.stocktakeId,
      table.sku
    ),
    ...tenantIdentityChecks('warehouse_stocktake_items', table),
    tenantPolicy('warehouse_stocktake_items_tenant_isolation'),
    check(
      'warehouse_stocktake_items_quantity_check',
      sql`counted_quantity >= 0 AND previous_quantity >= 0`
    ),
    versionCheck('warehouse_stocktake_items_version_check'),
    timestampsCheck('warehouse_stocktake_items_timestamps_check'),
  ]
).enableRLS();

export const loadUnitWaybills = pgTable(
  'load_unit_waybills',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    loadUnitId: text('load_unit_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    itemSequence: integer('item_sequence').notNull(),
    attachedAt: timestamp('attached_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'load_unit_waybills_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.loadUnitId],
      foreignColumns: [loadUnits.tenantId, loadUnits.id],
      name: 'load_unit_waybills_load_unit_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'load_unit_waybills_waybill_fk',
    }).onDelete('restrict'),
    unique('load_unit_waybills_identity_unique').on(table.tenantId, table.id),
    unique('load_unit_waybills_waybill_unique').on(
      table.tenantId,
      table.loadUnitId,
      table.waybillId
    ),
    unique('load_unit_waybills_sequence_unique').on(
      table.tenantId,
      table.loadUnitId,
      table.itemSequence
    ),
    ...tenantIdentityChecks('load_unit_waybills', table),
    tenantPolicy('load_unit_waybills_tenant_isolation'),
    check('load_unit_waybills_sequence_check', sql`item_sequence >= 1`),
    versionCheck('load_unit_waybills_version_check'),
    timestampsCheck('load_unit_waybills_timestamps_check'),
  ]
).enableRLS();

export const billOfLadingWaybills = pgTable(
  'bill_of_lading_waybills',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    billOfLadingId: text('bill_of_lading_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    itemSequence: integer('item_sequence').notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'bill_of_lading_waybills_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.billOfLadingId],
      foreignColumns: [billsOfLading.tenantId, billsOfLading.id],
      name: 'bill_of_lading_waybills_bill_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'bill_of_lading_waybills_waybill_fk',
    }).onDelete('restrict'),
    unique('bill_of_lading_waybills_identity_unique').on(table.tenantId, table.id),
    unique('bill_of_lading_waybills_waybill_unique').on(
      table.tenantId,
      table.billOfLadingId,
      table.waybillId
    ),
    unique('bill_of_lading_waybills_sequence_unique').on(
      table.tenantId,
      table.billOfLadingId,
      table.itemSequence
    ),
    ...tenantIdentityChecks('bill_of_lading_waybills', table),
    tenantPolicy('bill_of_lading_waybills_tenant_isolation'),
    check('bill_of_lading_waybills_sequence_check', sql`item_sequence >= 1`),
    versionCheck('bill_of_lading_waybills_version_check'),
    timestampsCheck('bill_of_lading_waybills_timestamps_check'),
  ]
).enableRLS();

export const fbaShipmentLinks = pgTable(
  'fba_shipment_links',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    loadUnitId: text('load_unit_id').notNull(),
    amazonShipmentId: text('amazon_shipment_id').notNull(),
    status: text().default('LINKED').notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'fba_shipment_links_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.loadUnitId],
      foreignColumns: [loadUnits.tenantId, loadUnits.id],
      name: 'fba_shipment_links_load_unit_fk',
    }).onDelete('restrict'),
    unique('fba_shipment_links_identity_unique').on(table.tenantId, table.id),
    unique('fba_shipment_links_amazon_unique').on(table.tenantId, table.amazonShipmentId),
    ...tenantIdentityChecks('fba_shipment_links', table),
    tenantPolicy('fba_shipment_links_tenant_isolation'),
    check(
      'fba_shipment_links_status_check',
      sql`status IN ('LINKED', 'CONFIRMED', 'CANCELLED')`
    ),
    versionCheck('fba_shipment_links_version_check'),
    timestampsCheck('fba_shipment_links_timestamps_check'),
  ]
).enableRLS();

export const fbaShipmentCartons = pgTable(
  'fba_shipment_cartons',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    fbaShipmentLinkId: text('fba_shipment_link_id').notNull(),
    cartonRef: text('carton_ref').notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'fba_shipment_cartons_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.fbaShipmentLinkId],
      foreignColumns: [fbaShipmentLinks.tenantId, fbaShipmentLinks.id],
      name: 'fba_shipment_cartons_link_fk',
    }).onDelete('cascade'),
    unique('fba_shipment_cartons_identity_unique').on(table.tenantId, table.id),
    unique('fba_shipment_cartons_ref_unique').on(
      table.tenantId,
      table.fbaShipmentLinkId,
      table.cartonRef
    ),
    ...tenantIdentityChecks('fba_shipment_cartons', table),
    tenantPolicy('fba_shipment_cartons_tenant_isolation'),
    check('fba_shipment_cartons_ref_check', sql`length(btrim(carton_ref)) >= 1`),
    versionCheck('fba_shipment_cartons_version_check'),
    timestampsCheck('fba_shipment_cartons_timestamps_check'),
  ]
).enableRLS();

export const lastMileIntakes = pgTable(
  'last_mile_intakes',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    intakeNo: text('intake_no').notNull(),
    stationId: text('station_id').notNull(),
    sourceType: text('source_type').notNull(),
    status: text().default('OPEN').notNull(),
    expectedCount: integer('expected_count').notNull(),
    scannedCount: integer('scanned_count').default(0).notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('last_mile_intakes_immutable_list_idx').on(
      table.tenantId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index('last_mile_intakes_filter_idx').on(
      table.tenantId,
      table.status,
      table.stationId,
      table.createdAt.desc(),
      table.id.desc()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'last_mile_intakes_tenant_fk',
    }).onDelete('cascade'),
    unique('last_mile_intakes_identity_unique').on(table.tenantId, table.id),
    unique('last_mile_intakes_number_unique').on(table.tenantId, table.intakeNo),
    ...tenantIdentityChecks('last_mile_intakes', table),
    tenantPolicy('last_mile_intakes_tenant_isolation'),
    check('last_mile_intakes_source_check', sql`source_type IN ('LINEHAUL', 'PARTNER')`),
    check('last_mile_intakes_status_check', sql`status IN ('OPEN', 'RECONCILING', 'CLOSED')`),
    check(
      'last_mile_intakes_count_check',
      sql`expected_count >= 0 AND scanned_count >= 0`
    ),
    versionCheck('last_mile_intakes_version_check'),
    timestampsCheck('last_mile_intakes_timestamps_check'),
  ]
).enableRLS();

export const lastMileIntakeExpectedWaybills = pgTable(
  'last_mile_intake_expected_waybills',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    intakeId: text('intake_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'last_mile_intake_expected_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.intakeId],
      foreignColumns: [lastMileIntakes.tenantId, lastMileIntakes.id],
      name: 'last_mile_intake_expected_intake_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'last_mile_intake_expected_waybill_fk',
    }).onDelete('restrict'),
    unique('last_mile_intake_expected_identity_unique').on(table.tenantId, table.id),
    unique('last_mile_intake_expected_waybill_unique').on(
      table.tenantId,
      table.intakeId,
      table.waybillId
    ),
    ...tenantIdentityChecks('last_mile_intake_expected', table),
    tenantPolicy('last_mile_intake_expected_tenant_isolation'),
    versionCheck('last_mile_intake_expected_version_check'),
    timestampsCheck('last_mile_intake_expected_timestamps_check'),
  ]
).enableRLS();

export const lastMileIntakeScans = pgTable(
  'last_mile_intake_scans',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    intakeId: text('intake_id').notNull(),
    deviceEventId: text('device_event_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    condition: text().notNull(),
    note: text(),
    scannedAt: timestamp('scanned_at', { withTimezone: true, mode: 'string' }).notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'last_mile_intake_scans_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.intakeId],
      foreignColumns: [lastMileIntakes.tenantId, lastMileIntakes.id],
      name: 'last_mile_intake_scans_intake_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'last_mile_intake_scans_waybill_fk',
    }).onDelete('restrict'),
    unique('last_mile_intake_scans_identity_unique').on(table.tenantId, table.id),
    unique('last_mile_intake_scans_event_unique').on(
      table.tenantId,
      table.intakeId,
      table.deviceEventId
    ),
    unique('last_mile_intake_scans_waybill_unique').on(
      table.tenantId,
      table.intakeId,
      table.waybillId
    ),
    ...tenantIdentityChecks('last_mile_intake_scans', table),
    tenantPolicy('last_mile_intake_scans_tenant_isolation'),
    check(
      'last_mile_intake_scans_condition_check',
      sql`condition IN ('ACCEPTED', 'DAMAGED', 'MISSING')`
    ),
    versionCheck('last_mile_intake_scans_version_check'),
    timestampsCheck('last_mile_intake_scans_timestamps_check'),
  ]
).enableRLS();

export const deliveryTaskWaybills = pgTable(
  'delivery_task_waybills',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    deliveryTaskId: text('delivery_task_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    itemSequence: integer('item_sequence').notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'delivery_task_waybills_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.deliveryTaskId],
      foreignColumns: [deliveryTasks.tenantId, deliveryTasks.id],
      name: 'delivery_task_waybills_task_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'delivery_task_waybills_waybill_fk',
    }).onDelete('restrict'),
    unique('delivery_task_waybills_identity_unique').on(table.tenantId, table.id),
    unique('delivery_task_waybills_waybill_unique').on(
      table.tenantId,
      table.deliveryTaskId,
      table.waybillId
    ),
    unique('delivery_task_waybills_sequence_unique').on(
      table.tenantId,
      table.deliveryTaskId,
      table.itemSequence
    ),
    ...tenantIdentityChecks('delivery_task_waybills', table),
    tenantPolicy('delivery_task_waybills_tenant_isolation'),
    check('delivery_task_waybills_sequence_check', sql`item_sequence >= 1`),
    versionCheck('delivery_task_waybills_version_check'),
    timestampsCheck('delivery_task_waybills_timestamps_check'),
  ]
).enableRLS();

export const podVersionMedia = pgTable(
  'pod_version_media',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    podVersionId: text('pod_version_id').notNull(),
    mediaReservationId: text('media_reservation_id').notNull(),
    itemSequence: integer('item_sequence').notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'pod_version_media_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.podVersionId],
      foreignColumns: [podVersions.tenantId, podVersions.id],
      name: 'pod_version_media_pod_version_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.mediaReservationId],
      foreignColumns: [deviceMediaReservations.tenantId, deviceMediaReservations.id],
      name: 'pod_version_media_reservation_fk',
    }).onDelete('restrict'),
    unique('pod_version_media_identity_unique').on(table.tenantId, table.id),
    unique('pod_version_media_reservation_unique').on(
      table.tenantId,
      table.podVersionId,
      table.mediaReservationId
    ),
    unique('pod_version_media_sequence_unique').on(
      table.tenantId,
      table.podVersionId,
      table.itemSequence
    ),
    ...tenantIdentityChecks('pod_version_media', table),
    tenantPolicy('pod_version_media_tenant_isolation'),
    check('pod_version_media_sequence_check', sql`item_sequence >= 1`),
    versionCheck('pod_version_media_version_check'),
    timestampsCheck('pod_version_media_timestamps_check'),
  ]
).enableRLS();

export const partnerEventReceipts = pgTable(
  'partner_event_receipts',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    partnerId: text('partner_id').notNull(),
    externalEventId: text('external_event_id').notNull(),
    eventType: text('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
    payloadRef: text('payload_ref').notNull(),
    status: text().default('RECEIVED').notNull(),
    lastError: text('last_error'),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('partner_event_receipts_queue_idx').on(
      table.tenantId,
      table.status,
      table.createdAt,
      table.id
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'partner_event_receipts_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.partnerId],
      foreignColumns: [partners.tenantId, partners.id],
      name: 'partner_event_receipts_partner_fk',
    }).onDelete('restrict'),
    unique('partner_event_receipts_identity_unique').on(table.tenantId, table.id),
    unique('partner_event_receipts_external_unique').on(
      table.tenantId,
      table.partnerId,
      table.externalEventId
    ),
    ...tenantIdentityChecks('partner_event_receipts', table),
    tenantPolicy('partner_event_receipts_tenant_isolation'),
    check(
      'partner_event_receipts_status_check',
      sql`status IN ('RECEIVED', 'QUEUED', 'APPLIED', 'REJECTED')`
    ),
    check(
      'partner_event_receipts_error_check',
      sql`(status = 'REJECTED' AND last_error IS NOT NULL) OR status <> 'REJECTED'`
    ),
    versionCheck('partner_event_receipts_version_check'),
    timestampsCheck('partner_event_receipts_timestamps_check'),
  ]
).enableRLS();

export const partnerEventReplayAttempts = pgTable(
  'partner_event_replay_attempts',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    partnerEventReceiptId: text('partner_event_receipt_id').notNull(),
    attemptNumber: integer('attempt_number').notNull(),
    reason: text().notNull(),
    requestedBySubjectId: text('requested_by_subject_id').notNull(),
    status: text().default('QUEUED').notNull(),
    outboxDedupeKey: text('outbox_dedupe_key').notNull(),
    lastError: text('last_error'),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'partner_event_replay_attempts_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.partnerEventReceiptId],
      foreignColumns: [partnerEventReceipts.tenantId, partnerEventReceipts.id],
      name: 'partner_event_replay_attempts_receipt_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.requestedBySubjectId],
      foreignColumns: [users.tenantId, users.id],
      name: 'partner_event_replay_attempts_actor_fk',
    }).onDelete('restrict'),
    unique('partner_event_replay_attempts_identity_unique').on(table.tenantId, table.id),
    unique('partner_event_replay_attempts_number_unique').on(
      table.tenantId,
      table.partnerEventReceiptId,
      table.attemptNumber
    ),
    unique('partner_event_replay_attempts_outbox_unique').on(
      table.tenantId,
      table.outboxDedupeKey
    ),
    ...tenantIdentityChecks('partner_event_replay_attempts', table),
    tenantPolicy('partner_event_replay_attempts_tenant_isolation'),
    check('partner_event_replay_attempts_number_check', sql`attempt_number >= 1`),
    check(
      'partner_event_replay_attempts_status_check',
      sql`status IN ('QUEUED', 'APPLIED', 'FAILED')`
    ),
    versionCheck('partner_event_replay_attempts_version_check'),
    timestampsCheck('partner_event_replay_attempts_timestamps_check'),
  ]
).enableRLS();

export const lastMileChargeGenerations = pgTable(
  'last_mile_charge_generations',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    billingDate: date('billing_date').notNull(),
    currency: text().notNull(),
    requestHash: text('request_hash').notNull(),
    status: text().default('QUEUED').notNull(),
    outboxDedupeKey: text('outbox_dedupe_key').notNull(),
    lastError: text('last_error'),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('last_mile_charge_generations_queue_idx').on(
      table.tenantId,
      table.status,
      table.createdAt
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'last_mile_charge_generations_tenant_fk',
    }).onDelete('cascade'),
    unique('last_mile_charge_generations_identity_unique').on(table.tenantId, table.id),
    unique('last_mile_charge_generations_request_unique').on(table.tenantId, table.requestHash),
    unique('last_mile_charge_generations_outbox_unique').on(
      table.tenantId,
      table.outboxDedupeKey
    ),
    ...tenantIdentityChecks('last_mile_charge_generations', table),
    tenantPolicy('last_mile_charge_generations_tenant_isolation'),
    check('last_mile_charge_generations_currency_check', sql`currency ~ '^[A-Z]{3}$'`),
    check('last_mile_charge_generations_hash_check', sql`request_hash ~ '^[0-9a-f]{64}$'`),
    check(
      'last_mile_charge_generations_status_check',
      sql`status IN ('QUEUED', 'COMPLETED', 'FAILED')`
    ),
    versionCheck('last_mile_charge_generations_version_check'),
    timestampsCheck('last_mile_charge_generations_timestamps_check'),
  ]
).enableRLS();

export const lastMileChargeGenerationTasks = pgTable(
  'last_mile_charge_generation_tasks',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    generationId: text('generation_id').notNull(),
    deliveryTaskId: text('delivery_task_id').notNull(),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'last_mile_charge_generation_tasks_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.generationId],
      foreignColumns: [lastMileChargeGenerations.tenantId, lastMileChargeGenerations.id],
      name: 'last_mile_charge_generation_tasks_generation_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.deliveryTaskId],
      foreignColumns: [deliveryTasks.tenantId, deliveryTasks.id],
      name: 'last_mile_charge_generation_tasks_task_fk',
    }).onDelete('restrict'),
    unique('last_mile_charge_generation_tasks_identity_unique').on(table.tenantId, table.id),
    unique('last_mile_charge_generation_tasks_task_unique').on(
      table.tenantId,
      table.generationId,
      table.deliveryTaskId
    ),
    ...tenantIdentityChecks('last_mile_charge_generation_tasks', table),
    tenantPolicy('last_mile_charge_generation_tasks_tenant_isolation'),
    versionCheck('last_mile_charge_generation_tasks_version_check'),
    timestampsCheck('last_mile_charge_generation_tasks_timestamps_check'),
  ]
).enableRLS();
