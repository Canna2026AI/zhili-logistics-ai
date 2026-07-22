import {
  bigint,
  check,
  customType,
  foreignKey,
  index,
  inet,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const tenants = pgTable(
  'tenants',
  {
    id: text().primaryKey().notNull(),
    slug: text().notNull(),
    displayName: text('display_name').notNull(),
    status: text().default('ACTIVE').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('tenants_slug_unique').on(table.slug),
    pgPolicy('tenants_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('tenants_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('tenants_slug_check', sql`slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'::text`),
    check(
      'tenants_display_name_check',
      sql`(length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 160)`
    ),
    check(
      'tenants_status_check',
      sql`status = ANY (ARRAY['ACTIVE'::text, 'SUSPENDED'::text, 'EXPIRED'::text])`
    ),
    check('tenants_version_check', sql`version >= 1`),
    check('tenants_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const permissionActions = pgTable(
  'permission_actions',
  {
    actionCode: text('action_code').primaryKey().notNull(),
    resourceType: text('resource_type').notNull(),
    description: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  () => [
    check(
      'permission_actions_code_check',
      sql`action_code ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'::text`
    ),
    check(
      'permission_actions_resource_check',
      sql`resource_type ~ '^[a-z][a-z0-9_-]{1,63}$'::text`
    ),
    check(
      'permission_actions_description_check',
      sql`(length(btrim(description)) >= 1) AND (length(btrim(description)) <= 240)`
    ),
  ]
);

export const organizations = pgTable(
  'organizations',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    parentOrganizationId: text('parent_organization_id'),
    code: text().notNull(),
    displayName: text('display_name').notNull(),
    organizationType: text('organization_type').notNull(),
    status: text().default('ACTIVE').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('organizations_parent_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.parentOrganizationId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'organizations_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.parentOrganizationId],
      foreignColumns: [table.id, table.tenantId],
      name: 'organizations_parent_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('organizations_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('organizations_tenant_code_unique').on(table.tenantId, table.code),
    pgPolicy('organizations_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('organizations_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'organizations_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'organizations_code_check',
      sql`(length(btrim(code)) >= 1) AND (length(btrim(code)) <= 64)`
    ),
    check(
      'organizations_display_name_check',
      sql`(length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 160)`
    ),
    check(
      'organizations_type_check',
      sql`organization_type = ANY (ARRAY['TENANT_ROOT'::text, 'BUSINESS_UNIT'::text, 'BRANCH'::text, 'PARTNER'::text])`
    ),
    check(
      'organizations_status_check',
      sql`status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text])`
    ),
    check('organizations_version_check', sql`version >= 0`),
    check('organizations_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const warehouses = pgTable(
  'warehouses',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    organizationId: text('organization_id').notNull(),
    code: text().notNull(),
    displayName: text('display_name').notNull(),
    timezone: text().default('Asia/Shanghai').notNull(),
    status: text().default('ACTIVE').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('warehouses_organization_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.organizationId.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'warehouses_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizations.id, organizations.tenantId],
      name: 'warehouses_organization_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('warehouses_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('warehouses_tenant_code_unique').on(table.tenantId, table.code),
    pgPolicy('warehouses_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('warehouses_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'warehouses_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check('warehouses_code_check', sql`(length(btrim(code)) >= 1) AND (length(btrim(code)) <= 64)`),
    check(
      'warehouses_display_name_check',
      sql`(length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 160)`
    ),
    check(
      'warehouses_timezone_check',
      sql`(length(btrim(timezone)) >= 1) AND (length(btrim(timezone)) <= 64)`
    ),
    check('warehouses_status_check', sql`status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text])`),
    check('warehouses_version_check', sql`version >= 0`),
    check('warehouses_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const users = pgTable(
  'users',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    organizationId: text('organization_id'),
    loginNameNormalized: text('login_name_normalized').notNull(),
    emailNormalized: text('email_normalized'),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash'),
    status: text().default('INVITED').notNull(),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true, mode: 'string' }),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
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
      name: 'users_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizations.id, organizations.tenantId],
      name: 'users_organization_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('users_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('users_tenant_login_unique').on(table.tenantId, table.loginNameNormalized),
    unique('users_tenant_email_unique').on(table.tenantId, table.emailNormalized),
    pgPolicy('users_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('users_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('users_tenant_id_ulid_check', sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'users_login_name_check',
      sql`(login_name_normalized = lower(btrim(login_name_normalized))) AND ((length(login_name_normalized) >= 3) AND (length(login_name_normalized) <= 128))`
    ),
    check(
      'users_email_check',
      sql`(email_normalized IS NULL) OR ((email_normalized = lower(btrim(email_normalized))) AND (POSITION(('@'::text) IN (email_normalized)) > 1))`
    ),
    check(
      'users_display_name_check',
      sql`(length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 160)`
    ),
    check(
      'users_password_hash_check',
      sql`(password_hash IS NULL) OR (password_hash ~~ '$argon2id$%'::text)`
    ),
    check(
      'users_status_check',
      sql`status = ANY (ARRAY['INVITED'::text, 'ACTIVE'::text, 'LOCKED'::text, 'DISABLED'::text])`
    ),
    check('users_version_check', sql`version >= 0`),
    check('users_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const customers = pgTable(
  'customers',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    organizationId: text('organization_id'),
    customerNumber: text('customer_number').notNull(),
    displayName: text('display_name').notNull(),
    status: text().default('ACTIVE').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
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
      name: 'customers_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizations.id, organizations.tenantId],
      name: 'customers_organization_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('customers_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('customers_tenant_number_unique').on(table.tenantId, table.customerNumber),
    pgPolicy('customers_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('customers_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('customers_tenant_id_ulid_check', sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'customers_number_check',
      sql`(length(btrim(customer_number)) >= 1) AND (length(btrim(customer_number)) <= 64)`
    ),
    check(
      'customers_display_name_check',
      sql`(length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 200)`
    ),
    check(
      'customers_status_check',
      sql`status = ANY (ARRAY['ACTIVE'::text, 'ON_HOLD'::text, 'INACTIVE'::text])`
    ),
    check('customers_version_check', sql`version >= 0`),
    check('customers_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const customerAddresses = pgTable(
  'customer_addresses',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    customerId: text('customer_id').notNull(),
    addressCode: text('address_code').notNull(),
    addressType: text('address_type').notNull(),
    contactName: text('contact_name').notNull(),
    contactPhone: text('contact_phone'),
    countryCode: text('country_code').notNull(),
    region: text(),
    city: text().notNull(),
    postalCode: text('postal_code'),
    line1: text().notNull(),
    line2: text(),
    status: text().default('ACTIVE').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('customer_addresses_customer_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.customerId.asc().nullsLast().op('text_ops'),
      table.status.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'customer_addresses_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.id, customers.tenantId],
      name: 'customer_addresses_customer_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('customer_addresses_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('customer_addresses_delivery_pair_unique').on(
      table.id,
      table.tenantId,
      table.customerId
    ),
    unique('customer_addresses_customer_code_unique').on(
      table.tenantId,
      table.customerId,
      table.addressCode
    ),
    pgPolicy('customer_addresses_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('customer_addresses_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'customer_addresses_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'customer_addresses_code_check',
      sql`(length(btrim(address_code)) >= 1) AND (length(btrim(address_code)) <= 64)`
    ),
    check(
      'customer_addresses_type_check',
      sql`address_type = ANY (ARRAY['BILLING'::text, 'PICKUP'::text, 'DELIVERY'::text, 'RETURN'::text])`
    ),
    check(
      'customer_addresses_contact_check',
      sql`(length(btrim(contact_name)) >= 1) AND (length(btrim(contact_name)) <= 160)`
    ),
    check('customer_addresses_country_check', sql`country_code ~ '^[A-Z]{2}$'::text`),
    check(
      'customer_addresses_city_check',
      sql`(length(btrim(city)) >= 1) AND (length(btrim(city)) <= 120)`
    ),
    check(
      'customer_addresses_line1_check',
      sql`(length(btrim(line1)) >= 1) AND (length(btrim(line1)) <= 240)`
    ),
    check(
      'customer_addresses_status_check',
      sql`status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text])`
    ),
    check('customer_addresses_version_check', sql`version >= 0`),
    check('customer_addresses_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const roles = pgTable(
  'roles',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    roleCode: text('role_code').notNull(),
    displayName: text('display_name').notNull(),
    status: text().default('ACTIVE').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
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
      name: 'roles_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('roles_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('roles_tenant_code_unique').on(table.tenantId, table.roleCode),
    pgPolicy('roles_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('roles_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('roles_tenant_id_ulid_check', sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'roles_code_check',
      sql`(length(btrim(role_code)) >= 1) AND (length(btrim(role_code)) <= 64)`
    ),
    check(
      'roles_display_name_check',
      sql`(length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 160)`
    ),
    check('roles_status_check', sql`status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text])`),
    check('roles_version_check', sql`version >= 0`),
    check('roles_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const roleGrants = pgTable(
  'role_grants',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    roleId: text('role_id').notNull(),
    actionCode: text('action_code').notNull(),
    effect: text().default('ALLOW').notNull(),
    dataScopeKind: text('data_scope_kind').notNull(),
    status: text().default('ACTIVE').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('role_grants_role_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.roleId.asc().nullsLast().op('text_ops'),
      table.status.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'role_grants_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.roleId],
      foreignColumns: [roles.id, roles.tenantId],
      name: 'role_grants_role_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.actionCode],
      foreignColumns: [permissionActions.actionCode],
      name: 'role_grants_action_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('role_grants_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('role_grants_role_action_scope_unique').on(
      table.tenantId,
      table.roleId,
      table.actionCode,
      table.effect,
      table.dataScopeKind
    ),
    pgPolicy('role_grants_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('role_grants_effect_check', sql`effect = ANY (ARRAY['ALLOW'::text, 'DENY'::text])`),
    check('role_grants_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'role_grants_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'role_grants_data_scope_check',
      sql`data_scope_kind = ANY (ARRAY['TENANT'::text, 'ORGANIZATION'::text, 'CUSTOMER'::text, 'WAREHOUSE'::text, 'SELF'::text])`
    ),
    check('role_grants_status_check', sql`status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text])`),
    check('role_grants_version_check', sql`version >= 0`),
    check('role_grants_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const roleGrantOrganizationScopes = pgTable(
  'role_grant_organization_scopes',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    grantId: text('grant_id').notNull(),
    organizationId: text('organization_id').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId, table.grantId],
      foreignColumns: [roleGrants.id, roleGrants.tenantId],
      name: 'role_grant_organization_scopes_grant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.organizationId],
      foreignColumns: [organizations.id, organizations.tenantId],
      name: 'role_grant_organization_scopes_organization_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'role_grant_organization_scopes_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('role_grant_organization_scopes_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('role_grant_organization_scopes_unique').on(
      table.tenantId,
      table.grantId,
      table.organizationId
    ),
    pgPolicy('role_grant_organization_scopes_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check(
      'role_grant_organization_scopes_id_ulid_check',
      sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'role_grant_organization_scopes_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check('role_grant_organization_scopes_version_check', sql`version >= 0`),
    check('role_grant_organization_scopes_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const roleGrantCustomerScopes = pgTable(
  'role_grant_customer_scopes',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    grantId: text('grant_id').notNull(),
    customerId: text('customer_id').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
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
      name: 'role_grant_customer_scopes_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.grantId],
      foreignColumns: [roleGrants.id, roleGrants.tenantId],
      name: 'role_grant_customer_scopes_grant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.id, customers.tenantId],
      name: 'role_grant_customer_scopes_customer_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('role_grant_customer_scopes_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('role_grant_customer_scopes_unique').on(table.tenantId, table.grantId, table.customerId),
    pgPolicy('role_grant_customer_scopes_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check(
      'role_grant_customer_scopes_id_ulid_check',
      sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'role_grant_customer_scopes_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check('role_grant_customer_scopes_version_check', sql`version >= 0`),
    check('role_grant_customer_scopes_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const roleGrantWarehouseScopes = pgTable(
  'role_grant_warehouse_scopes',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    grantId: text('grant_id').notNull(),
    warehouseId: text('warehouse_id').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
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
      name: 'role_grant_warehouse_scopes_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.grantId],
      foreignColumns: [roleGrants.id, roleGrants.tenantId],
      name: 'role_grant_warehouse_scopes_grant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.warehouseId],
      foreignColumns: [warehouses.id, warehouses.tenantId],
      name: 'role_grant_warehouse_scopes_warehouse_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('role_grant_warehouse_scopes_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('role_grant_warehouse_scopes_unique').on(
      table.tenantId,
      table.grantId,
      table.warehouseId
    ),
    pgPolicy('role_grant_warehouse_scopes_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check(
      'role_grant_warehouse_scopes_id_ulid_check',
      sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'role_grant_warehouse_scopes_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check('role_grant_warehouse_scopes_version_check', sql`version >= 0`),
    check('role_grant_warehouse_scopes_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const roleGrantFieldPolicies = pgTable(
  'role_grant_field_policies',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    grantId: text('grant_id').notNull(),
    fieldPath: text('field_path').notNull(),
    accessLevel: text('access_level').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
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
      name: 'role_grant_field_policies_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.grantId],
      foreignColumns: [roleGrants.id, roleGrants.tenantId],
      name: 'role_grant_field_policies_grant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('role_grant_field_policies_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('role_grant_field_policies_unique').on(table.tenantId, table.grantId, table.fieldPath),
    pgPolicy('role_grant_field_policies_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check(
      'role_grant_field_policies_id_ulid_check',
      sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'role_grant_field_policies_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'role_grant_field_policies_field_path_check',
      sql`field_path ~ '^[A-Za-z][A-Za-z0-9_.]{0,159}$'::text`
    ),
    check(
      'role_grant_field_policies_access_check',
      sql`access_level = ANY (ARRAY['READ'::text, 'MASK'::text, 'DENY'::text])`
    ),
    check('role_grant_field_policies_version_check', sql`version >= 0`),
    check('role_grant_field_policies_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const userRoleAssignments = pgTable(
  'user_role_assignments',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    roleId: text('role_id').notNull(),
    assignedByUserId: text('assigned_by_user_id'),
    status: text().default('ACTIVE').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true, mode: 'string' }),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('user_role_assignments_active_idx')
      .using(
        'btree',
        table.tenantId.asc().nullsLast().op('text_ops'),
        table.userId.asc().nullsLast().op('text_ops'),
        table.roleId.asc().nullsLast().op('text_ops')
      )
      .where(sql`(status = 'ACTIVE'::text)`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'user_role_assignments_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.id, users.tenantId],
      name: 'user_role_assignments_user_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.roleId],
      foreignColumns: [roles.id, roles.tenantId],
      name: 'user_role_assignments_role_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.assignedByUserId],
      foreignColumns: [users.id, users.tenantId],
      name: 'user_role_assignments_assigner_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('user_role_assignments_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('user_role_assignments_user_role_unique').on(
      table.tenantId,
      table.userId,
      table.roleId,
      table.validFrom
    ),
    pgPolicy('user_role_assignments_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('user_role_assignments_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'user_role_assignments_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'user_role_assignments_status_check',
      sql`status = ANY (ARRAY['ACTIVE'::text, 'REVOKED'::text, 'EXPIRED'::text])`
    ),
    check(
      'user_role_assignments_validity_check',
      sql`(valid_until IS NULL) OR (valid_until > valid_from)`
    ),
    check('user_role_assignments_version_check', sql`version >= 0`),
    check('user_role_assignments_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    authenticationMethod: text('authentication_method').notNull(),
    status: text().default('ACTIVE').notNull(),
    ipAddress: inet('ip_address'),
    userAgent: text('user_agent'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    revokedReason: text('revoked_reason'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('sessions_active_user_idx')
      .using(
        'btree',
        table.tenantId.asc().nullsLast().op('timestamptz_ops'),
        table.userId.asc().nullsLast().op('timestamptz_ops'),
        table.expiresAt.asc().nullsLast().op('timestamptz_ops')
      )
      .where(sql`(status = 'ACTIVE'::text)`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'sessions_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.id, users.tenantId],
      name: 'sessions_user_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('sessions_tenant_id_id_unique').on(table.id, table.tenantId),
    pgPolicy('sessions_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('sessions_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('sessions_tenant_id_ulid_check', sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'sessions_auth_method_check',
      sql`authentication_method = ANY (ARRAY['PASSWORD'::text, 'WECHAT'::text, 'OIDC'::text, 'DEVICE'::text])`
    ),
    check(
      'sessions_status_check',
      sql`status = ANY (ARRAY['ACTIVE'::text, 'REVOKED'::text, 'EXPIRED'::text])`
    ),
    check('sessions_expiry_check', sql`expires_at > created_at`),
    check(
      'sessions_revocation_check',
      sql`((status = 'REVOKED'::text) AND (revoked_at IS NOT NULL)) OR (status <> 'REVOKED'::text)`
    ),
    check('sessions_version_check', sql`version >= 0`),
    check(
      'sessions_timestamps_check',
      sql`(updated_at >= created_at) AND (last_seen_at >= created_at)`
    ),
  ]
).enableRLS();

export const refreshTokenFamilies = pgTable(
  'refresh_token_families',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    sessionId: text('session_id').notNull(),
    status: text().default('ACTIVE').notNull(),
    reuseDetectedAt: timestamp('reuse_detected_at', { withTimezone: true, mode: 'string' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    revokedReason: text('revoked_reason'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
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
      name: 'refresh_token_families_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.sessionId],
      foreignColumns: [sessions.id, sessions.tenantId],
      name: 'refresh_token_families_session_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('refresh_token_families_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('refresh_token_families_session_unique').on(table.tenantId, table.sessionId),
    pgPolicy('refresh_token_families_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('refresh_token_families_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'refresh_token_families_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'refresh_token_families_status_check',
      sql`status = ANY (ARRAY['ACTIVE'::text, 'REVOKED'::text, 'COMPROMISED'::text])`
    ),
    check(
      'refresh_token_families_reuse_check',
      sql`((status = 'COMPROMISED'::text) AND (reuse_detected_at IS NOT NULL) AND (revoked_at IS NOT NULL)) OR (status <> 'COMPROMISED'::text)`
    ),
    check(
      'refresh_token_families_revocation_check',
      sql`((status = 'REVOKED'::text) AND (revoked_at IS NOT NULL)) OR (status <> 'REVOKED'::text)`
    ),
    check('refresh_token_families_version_check', sql`version >= 0`),
    check('refresh_token_families_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    familyId: text('family_id').notNull(),
    parentTokenId: text('parent_token_id'),
    tokenHash: text('token_hash').notNull(),
    status: text().default('ACTIVE').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'string' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('refresh_tokens_family_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.familyId.asc().nullsLast().op('timestamptz_ops'),
      table.issuedAt.asc().nullsLast().op('timestamptz_ops')
    ),
    uniqueIndex('refresh_tokens_one_successor_idx')
      .using(
        'btree',
        table.tenantId.asc().nullsLast().op('text_ops'),
        table.parentTokenId.asc().nullsLast().op('text_ops')
      )
      .where(sql`(parent_token_id IS NOT NULL)`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'refresh_tokens_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.familyId],
      foreignColumns: [refreshTokenFamilies.id, refreshTokenFamilies.tenantId],
      name: 'refresh_tokens_family_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.familyId, table.parentTokenId],
      foreignColumns: [table.familyId, table.id, table.tenantId],
      name: 'refresh_tokens_parent_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('refresh_tokens_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('refresh_tokens_family_id_id_unique').on(table.id, table.tenantId, table.familyId),
    unique('refresh_tokens_hash_unique').on(table.tokenHash),
    pgPolicy('refresh_tokens_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('refresh_tokens_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'refresh_tokens_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check('refresh_tokens_hash_check', sql`token_hash ~ '^[0-9a-f]{64}$'::text`),
    check(
      'refresh_tokens_status_check',
      sql`status = ANY (ARRAY['ACTIVE'::text, 'ROTATED'::text, 'REVOKED'::text, 'EXPIRED'::text])`
    ),
    check('refresh_tokens_expiry_check', sql`expires_at > issued_at`),
    check(
      'refresh_tokens_consumed_check',
      sql`((status = 'ROTATED'::text) AND (consumed_at IS NOT NULL)) OR (status <> 'ROTATED'::text)`
    ),
    check(
      'refresh_tokens_revoked_check',
      sql`((status = 'REVOKED'::text) AND (revoked_at IS NOT NULL)) OR (status <> 'REVOKED'::text)`
    ),
    check(
      'refresh_tokens_no_self_parent_check',
      sql`(parent_token_id IS NULL) OR (parent_token_id <> id)`
    ),
    check('refresh_tokens_version_check', sql`version >= 0`),
    check('refresh_tokens_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const oauthStates = pgTable(
  'oauth_states',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    provider: text().notNull(),
    stateHash: text('state_hash').notNull(),
    // TODO: failed to parse database type 'bytea'
    pkceVerifierCiphertext: bytea('pkce_verifier_ciphertext').notNull(),
    encryptionKeyVersion: text('encryption_key_version').notNull(),
    // TODO: failed to parse database type 'bytea'
    encryptionNonce: bytea('encryption_nonce').notNull(),
    redirectUri: text('redirect_uri').notNull(),
    status: text().default('PENDING').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'string' }),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('oauth_states_pending_idx')
      .using(
        'btree',
        table.tenantId.asc().nullsLast().op('text_ops'),
        table.provider.asc().nullsLast().op('timestamptz_ops'),
        table.expiresAt.asc().nullsLast().op('timestamptz_ops')
      )
      .where(sql`(status = 'PENDING'::text)`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'oauth_states_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('oauth_states_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('oauth_states_state_hash_unique').on(table.stateHash),
    pgPolicy('oauth_states_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('oauth_states_provider_check', sql`provider = ANY (ARRAY['WECHAT'::text, 'OIDC'::text])`),
    check('oauth_states_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'oauth_states_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check('oauth_states_state_hash_check', sql`state_hash ~ '^[0-9a-f]{64}$'::text`),
    check('oauth_states_ciphertext_check', sql`octet_length(pkce_verifier_ciphertext) >= 32`),
    check(
      'oauth_states_key_version_check',
      sql`(length(btrim(encryption_key_version)) >= 1) AND (length(btrim(encryption_key_version)) <= 64)`
    ),
    check('oauth_states_nonce_check', sql`octet_length(encryption_nonce) >= 12`),
    check('oauth_states_redirect_check', sql`redirect_uri ~ '^https://'::text`),
    check(
      'oauth_states_status_check',
      sql`status = ANY (ARRAY['PENDING'::text, 'CONSUMED'::text, 'EXPIRED'::text])`
    ),
    check('oauth_states_expiry_check', sql`expires_at > created_at`),
    check(
      'oauth_states_consumed_check',
      sql`((status = 'CONSUMED'::text) AND (consumed_at IS NOT NULL)) OR (status <> 'CONSUMED'::text)`
    ),
    check('oauth_states_version_check', sql`version >= 0`),
    check('oauth_states_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const devices = pgTable(
  'devices',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    deviceCode: text('device_code').notNull(),
    displayName: text('display_name').notNull(),
    platform: text().notNull(),
    credentialHash: text('credential_hash').notNull(),
    status: text().default('PENDING').notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'string' }),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
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
      name: 'devices_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('devices_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('devices_tenant_code_unique').on(table.tenantId, table.deviceCode),
    unique('devices_credential_hash_unique').on(table.credentialHash),
    pgPolicy('devices_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('devices_version_check', sql`version >= 0`),
    check('devices_timestamps_check', sql`updated_at >= created_at`),
    check('devices_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('devices_tenant_id_ulid_check', sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'devices_code_check',
      sql`(length(btrim(device_code)) >= 1) AND (length(btrim(device_code)) <= 96)`
    ),
    check(
      'devices_display_name_check',
      sql`(length(btrim(display_name)) >= 1) AND (length(btrim(display_name)) <= 160)`
    ),
    check(
      'devices_platform_check',
      sql`platform = ANY (ARRAY['PDA_ANDROID'::text, 'PDA_IOS'::text, 'KIOSK'::text, 'SCANNER'::text])`
    ),
    check('devices_credential_hash_check', sql`credential_hash ~ '^[0-9a-f]{64}$'::text`),
    check(
      'devices_status_check',
      sql`status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'SUSPENDED'::text, 'REVOKED'::text])`
    ),
  ]
).enableRLS();

export const deviceBindings = pgTable(
  'device_bindings',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    deviceId: text('device_id').notNull(),
    warehouseId: text('warehouse_id').notNull(),
    boundByUserId: text('bound_by_user_id').notNull(),
    boundSubjectUserId: text('bound_subject_user_id').notNull(),
    status: text().default('ACTIVE').notNull(),
    boundAt: timestamp('bound_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
    revokedByUserId: text('revoked_by_user_id'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('device_bindings_one_active_device_idx')
      .using(
        'btree',
        table.tenantId.asc().nullsLast().op('text_ops'),
        table.deviceId.asc().nullsLast().op('text_ops')
      )
      .where(sql`(status = 'ACTIVE'::text)`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'device_bindings_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.deviceId],
      foreignColumns: [devices.id, devices.tenantId],
      name: 'device_bindings_device_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.warehouseId],
      foreignColumns: [warehouses.id, warehouses.tenantId],
      name: 'device_bindings_warehouse_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.boundByUserId],
      foreignColumns: [users.id, users.tenantId],
      name: 'device_bindings_bound_by_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.boundSubjectUserId],
      foreignColumns: [users.id, users.tenantId],
      name: 'device_bindings_bound_subject_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.revokedByUserId],
      foreignColumns: [users.id, users.tenantId],
      name: 'device_bindings_revoked_by_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('device_bindings_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('device_bindings_history_unique').on(
      table.tenantId,
      table.deviceId,
      table.warehouseId,
      table.boundAt
    ),
    pgPolicy('device_bindings_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('device_bindings_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'device_bindings_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'device_bindings_status_check',
      sql`status = ANY (ARRAY['ACTIVE'::text, 'REVOKED'::text])`
    ),
    check(
      'device_bindings_revocation_check',
      sql`((status = 'REVOKED'::text) AND (revoked_at IS NOT NULL) AND (revoked_by_user_id IS NOT NULL)) OR (status = 'ACTIVE'::text)`
    ),
    check('device_bindings_version_check', sql`version >= 0`),
    check(
      'device_bindings_timestamps_check',
      sql`(updated_at >= created_at) AND (bound_at >= created_at)`
    ),
  ]
).enableRLS();

export const deviceTasks = pgTable(
  'device_tasks',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    warehouseId: text('warehouse_id').notNull(),
    assignedDeviceId: text('assigned_device_id'),
    assignedUserId: text('assigned_user_id'),
    taskType: text('task_type').notNull(),
    taskNumber: text('task_number').notNull(),
    status: text().default('READY').notNull(),
    priority: text().default('NORMAL').notNull(),
    taskPayload: jsonb('task_payload').default({}).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'string' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('device_tasks_queue_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.assignedDeviceId.asc().nullsLast().op('text_ops'),
      table.status.asc().nullsLast().op('text_ops'),
      sql`(CASE priority WHEN 'URGENT' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'NORMAL' THEN 2 ELSE 1 END) DESC`,
      table.availableAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'device_tasks_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.warehouseId],
      foreignColumns: [warehouses.id, warehouses.tenantId],
      name: 'device_tasks_warehouse_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.assignedDeviceId],
      foreignColumns: [devices.id, devices.tenantId],
      name: 'device_tasks_device_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.assignedUserId],
      foreignColumns: [users.id, users.tenantId],
      name: 'device_tasks_user_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('device_tasks_tenant_id_id_unique').on(table.id, table.tenantId),
    unique('device_tasks_tenant_number_unique').on(table.tenantId, table.taskNumber),
    pgPolicy('device_tasks_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('device_tasks_id_ulid_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'device_tasks_tenant_id_ulid_check',
      sql`tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`
    ),
    check(
      'device_tasks_type_check',
      sql`task_type = ANY (ARRAY['RECEIVE'::text, 'MOVE'::text, 'PICK'::text, 'LOAD'::text, 'DISPATCH'::text, 'LAST_MILE_DELIVERY'::text, 'STOCKTAKE'::text])`
    ),
    check(
      'device_tasks_number_check',
      sql`(length(btrim(task_number)) >= 1) AND (length(btrim(task_number)) <= 96)`
    ),
    check(
      'device_tasks_status_check',
      sql`status = ANY (ARRAY['READY'::text, 'CLAIMED'::text, 'IN_PROGRESS'::text, 'COMPLETED'::text, 'CANCELLED'::text])`
    ),
    check(
      'device_tasks_priority_check',
      sql`priority = ANY (ARRAY['LOW'::text, 'NORMAL'::text, 'HIGH'::text, 'URGENT'::text])`
    ),
    check('device_tasks_payload_check', sql`jsonb_typeof(task_payload) = 'object'::text`),
    check('device_tasks_due_check', sql`(due_at IS NULL) OR (due_at >= available_at)`),
    check(
      'device_tasks_completion_check',
      sql`((status = 'COMPLETED'::text) AND (completed_at IS NOT NULL)) OR (status <> 'COMPLETED'::text)`
    ),
    check('device_tasks_version_check', sql`version >= 1`),
    check('device_tasks_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();
