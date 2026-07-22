import {
  bigint,
  check,
  foreignKey,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { customers, tenants, users } from './identity';

const tenantPolicy = (name: string) =>
  pgPolicy(name, {
    as: 'permissive',
    for: 'all',
    to: ['zhili_app'],
    using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
  });

export const tenantEntitlements = pgTable(
  'tenant_entitlements',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    moduleCode: text('module_code').notNull(),
    entitlementVersion: integer('entitlement_version').notNull(),
    state: text().default('ACTIVE').notNull(),
    quotaLimit: bigint('quota_limit', { mode: 'number' }),
    usageValue: bigint('usage_value', { mode: 'number' }).default(0).notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true, mode: 'string' }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true, mode: 'string' }),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'tenant_entitlements_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
      name: 'tenant_entitlements_creator_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('tenant_entitlements_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('tenant_entitlements_module_version_unique').on(
      table.tenantId,
      table.moduleCode,
      table.entitlementVersion
    ),
    tenantPolicy('tenant_entitlements_tenant_isolation'),
    check('tenant_entitlements_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check('tenant_entitlements_module_check', sql`module_code ~ '^[A-Z][A-Z0-9_]{1,63}$'`),
    check('tenant_entitlements_version_check', sql`entitlement_version >= 1`),
    check('tenant_entitlements_state_check', sql`state IN ('ACTIVE', 'RETIRED')`),
    check(
      'tenant_entitlements_usage_check',
      sql`usage_value >= 0 AND (quota_limit IS NULL OR (quota_limit >= 0 AND usage_value <= quota_limit))`
    ),
    check(
      'tenant_entitlements_validity_check',
      sql`valid_until IS NULL OR valid_until > valid_from`
    ),
  ]
).enableRLS();

export const impersonationSessions = pgTable(
  'impersonation_sessions',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    actorSubjectId: text('actor_subject_id').notNull(),
    reason: text().notNull(),
    status: text().default('ACTIVE').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'string' }),
    endedReason: text('ended_reason'),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('impersonation_sessions_one_active_actor_tenant_idx')
      .on(table.tenantId, table.actorSubjectId)
      .where(sql`status = 'ACTIVE'`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'impersonation_sessions_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('impersonation_sessions_tenant_id_id_unique').on(table.tenantId, table.id),
    tenantPolicy('impersonation_sessions_tenant_isolation'),
    check('impersonation_sessions_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check('impersonation_sessions_actor_check', sql`length(btrim(actor_subject_id)) >= 1`),
    check('impersonation_sessions_reason_check', sql`length(btrim(reason)) >= 10`),
    check('impersonation_sessions_status_check', sql`status IN ('ACTIVE', 'ENDED', 'EXPIRED')`),
    check(
      'impersonation_sessions_duration_check',
      sql`expires_at >= started_at + interval '5 minutes' AND expires_at <= started_at + interval '60 minutes'`
    ),
    check(
      'impersonation_sessions_end_check',
      sql`(status = 'ACTIVE' AND ended_at IS NULL AND ended_reason IS NULL) OR (status IN ('ENDED', 'EXPIRED') AND ended_at IS NOT NULL AND length(btrim(ended_reason)) >= 1)`
    ),
    check('impersonation_sessions_version_check', sql`version >= 1`),
    check('impersonation_sessions_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const oauthIdentities = pgTable(
  'oauth_identities',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    provider: text().notNull(),
    providerSubjectHash: text('provider_subject_hash').notNull(),
    status: text().default('ACTIVE').notNull(),
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
      name: 'oauth_identities_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id],
      name: 'oauth_identities_user_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('oauth_identities_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('oauth_identities_provider_subject_unique').on(
      table.provider,
      table.providerSubjectHash
    ),
    unique('oauth_identities_user_provider_unique').on(
      table.tenantId,
      table.userId,
      table.provider
    ),
    tenantPolicy('oauth_identities_tenant_isolation'),
    check('oauth_identities_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check('oauth_identities_provider_check', sql`provider IN ('WECHAT', 'OIDC')`),
    check('oauth_identities_subject_hash_check', sql`provider_subject_hash ~ '^[0-9a-f]{64}$'`),
    check('oauth_identities_status_check', sql`status IN ('ACTIVE', 'REVOKED')`),
    check('oauth_identities_version_check', sql`version >= 1`),
    check('oauth_identities_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const partners = pgTable(
  'partners',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    partnerCode: text('partner_code').notNull(),
    displayName: text('display_name').notNull(),
    partnerType: text('partner_type').notNull(),
    status: text().default('ACTIVE').notNull(),
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
      name: 'partners_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('partners_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('partners_tenant_code_unique').on(table.tenantId, table.partnerCode),
    tenantPolicy('partners_tenant_isolation'),
    check('partners_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check('partners_code_check', sql`length(btrim(partner_code)) BETWEEN 1 AND 64`),
    check('partners_name_check', sql`length(btrim(display_name)) BETWEEN 1 AND 200`),
    check(
      'partners_type_check',
      sql`partner_type IN ('CARRIER', 'AGENT', 'SUPPLIER', 'LAST_MILE', 'CUSTOMS_BROKER')`
    ),
    check('partners_status_check', sql`status IN ('ACTIVE', 'INACTIVE')`),
    check('partners_version_check', sql`version >= 1`),
    check('partners_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const referenceDataSets = pgTable(
  'reference_data_sets',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    setCode: text('set_code').notNull(),
    displayName: text('display_name').notNull(),
    currentVersionId: text('current_version_id'),
    status: text().default('ACTIVE').notNull(),
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
      name: 'reference_data_sets_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('reference_data_sets_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('reference_data_sets_tenant_code_unique').on(table.tenantId, table.setCode),
    tenantPolicy('reference_data_sets_tenant_isolation'),
    check('reference_data_sets_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check('reference_data_sets_code_check', sql`set_code ~ '^[A-Z][A-Z0-9_]{1,63}$'`),
    check('reference_data_sets_name_check', sql`length(btrim(display_name)) BETWEEN 1 AND 200`),
    check('reference_data_sets_status_check', sql`status IN ('ACTIVE', 'INACTIVE')`),
    check('reference_data_sets_version_check', sql`version >= 1`),
    check('reference_data_sets_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const referenceDataVersions = pgTable(
  'reference_data_versions',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    referenceDataSetId: text('reference_data_set_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    state: text().default('DRAFT').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    createdByUserId: text('created_by_user_id').notNull(),
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
      name: 'reference_data_versions_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.referenceDataSetId],
      foreignColumns: [referenceDataSets.tenantId, referenceDataSets.id],
      name: 'reference_data_versions_set_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
      name: 'reference_data_versions_creator_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('reference_data_versions_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('reference_data_versions_set_version_unique').on(
      table.tenantId,
      table.referenceDataSetId,
      table.versionNumber
    ),
    unique('reference_data_versions_head_key_unique').on(
      table.tenantId,
      table.id,
      table.referenceDataSetId
    ),
    tenantPolicy('reference_data_versions_tenant_isolation'),
    check('reference_data_versions_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check('reference_data_versions_number_check', sql`version_number >= 1`),
    check('reference_data_versions_state_check', sql`state IN ('DRAFT', 'PUBLISHED', 'RETIRED')`),
    check(
      'reference_data_versions_publish_check',
      sql`(state = 'DRAFT' AND published_at IS NULL) OR (state IN ('PUBLISHED', 'RETIRED') AND published_at IS NOT NULL)`
    ),
    check('reference_data_versions_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

// The compound current-head FK is installed in raw SQL. Keeping it out of this module avoids a
// circular TypeScript table declaration while the typed column remains available to services.
export const referenceDataItems = pgTable(
  'reference_data_items',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    referenceDataVersionId: text('reference_data_version_id').notNull(),
    itemKey: text('item_key').notNull(),
    itemPayload: jsonb('item_payload').notNull(),
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
      name: 'reference_data_items_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.referenceDataVersionId],
      foreignColumns: [referenceDataVersions.tenantId, referenceDataVersions.id],
      name: 'reference_data_items_version_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('reference_data_items_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('reference_data_items_version_key_unique').on(
      table.tenantId,
      table.referenceDataVersionId,
      table.itemKey
    ),
    tenantPolicy('reference_data_items_tenant_isolation'),
    check('reference_data_items_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check('reference_data_items_key_check', sql`length(btrim(item_key)) BETWEEN 1 AND 160`),
    check('reference_data_items_payload_check', sql`jsonb_typeof(item_payload) = 'object'`),
    check('reference_data_items_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const customerCreditPolicies = pgTable(
  'customer_credit_policies',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    customerId: text('customer_id').notNull(),
    policyVersion: integer('policy_version').notNull(),
    currency: text().notNull(),
    creditLimitMinor: bigint('credit_limit_minor', { mode: 'number' }).notNull(),
    paymentCycle: text('payment_cycle').notNull(),
    holdPolicy: text('hold_policy').notNull(),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'customer_credit_policies_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
      name: 'customer_credit_policies_customer_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.createdByUserId],
      foreignColumns: [users.tenantId, users.id],
      name: 'customer_credit_policies_creator_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('customer_credit_policies_tenant_id_id_unique').on(table.tenantId, table.id),
    unique('customer_credit_policies_customer_version_unique').on(
      table.tenantId,
      table.customerId,
      table.policyVersion
    ),
    tenantPolicy('customer_credit_policies_tenant_isolation'),
    check('customer_credit_policies_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check('customer_credit_policies_version_check', sql`policy_version >= 1`),
    check(
      'customer_credit_policies_money_check',
      sql`currency ~ '^[A-Z]{3}$' AND credit_limit_minor >= 0`
    ),
    check(
      'customer_credit_policies_cycle_check',
      sql`payment_cycle IN ('PREPAID', 'WEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'NET_30', 'NET_60')`
    ),
    check(
      'customer_credit_policies_hold_check',
      sql`hold_policy IN ('AUTO_HOLD', 'REVIEW', 'ALLOW')`
    ),
  ]
).enableRLS();

export const permissionSimulations = pgTable(
  'permission_simulations',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    actorUserId: text('actor_user_id').notNull(),
    subjectUserId: text('subject_user_id').notNull(),
    proposedPolicy: jsonb('proposed_policy').notNull(),
    status: text().default('ACTIVE').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'string' }),
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
      name: 'permission_simulations_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.actorUserId],
      foreignColumns: [users.tenantId, users.id],
      name: 'permission_simulations_actor_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.subjectUserId],
      foreignColumns: [users.tenantId, users.id],
      name: 'permission_simulations_subject_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('permission_simulations_tenant_id_id_unique').on(table.tenantId, table.id),
    tenantPolicy('permission_simulations_tenant_isolation'),
    check('permission_simulations_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'`),
    check('permission_simulations_policy_check', sql`jsonb_typeof(proposed_policy) = 'object'`),
    check('permission_simulations_status_check', sql`status IN ('ACTIVE', 'ENDED', 'EXPIRED')`),
    check(
      'permission_simulations_expiry_check',
      sql`expires_at >= created_at + interval '5 minutes' AND expires_at <= created_at + interval '60 minutes'`
    ),
    check(
      'permission_simulations_end_check',
      sql`(status = 'ACTIVE' AND ended_at IS NULL) OR (status IN ('ENDED', 'EXPIRED') AND ended_at IS NOT NULL)`
    ),
    check('permission_simulations_version_check', sql`version >= 1`),
    check('permission_simulations_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();
