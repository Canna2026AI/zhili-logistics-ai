import {
  type AnyPgColumn,
  type ForeignKeyBuilder,
  bigint,
  boolean,
  check,
  customType,
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
import { sql } from 'drizzle-orm';

import { customerAddresses, customers, tenants } from './identity';

function acceptedQuoteForeignKeys(table: {
  acceptedQuoteOptionId: AnyPgColumn;
  acceptedQuoteVersionId: AnyPgColumn;
  id: AnyPgColumn;
  tenantId: AnyPgColumn;
}): readonly [ForeignKeyBuilder, ForeignKeyBuilder] {
  return [
    foreignKey({
      columns: [
        table.tenantId,
        table.acceptedQuoteOptionId,
        table.acceptedQuoteVersionId,
        table.id,
      ],
      foreignColumns: [
        quoteOptions.tenantId,
        quoteOptions.id,
        quoteOptions.quoteVersionId,
        quoteOptions.quoteId,
      ],
      name: 'quotes_accepted_option_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.acceptedQuoteVersionId, table.id],
      foreignColumns: [quoteVersions.tenantId, quoteVersions.id, quoteVersions.quoteId],
      name: 'quotes_accepted_version_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
  ] as const;
}

const int8Range = customType<{ data: string; driverData: string }>({
  dataType: () => 'int8range',
});

export const shippingChannels = pgTable(
  'shipping_channels',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    code: text().notNull(),
    name: text().notNull(),
    transportMode: text('transport_mode'),
    state: text().default('ACTIVE').notNull(),
    capabilities: jsonb().default({}).notNull(),
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
    index('shipping_channels_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'shipping_channels_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('shipping_channels_tenant_id_unique').on(table.tenantId, table.id),
    unique('shipping_channels_tenant_code_unique').on(table.tenantId, table.code),
    pgPolicy('shipping_channels_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('shipping_channels_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('shipping_channels_code_check', sql`code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'::text`),
    check(
      'shipping_channels_name_check',
      sql`(length(btrim(name)) >= 1) AND (length(btrim(name)) <= 200)`
    ),
    check(
      'shipping_channels_state_check',
      sql`state = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'INACTIVE'::text])`
    ),
    check(
      'shipping_channels_transport_mode_check',
      sql`transport_mode IS NULL OR transport_mode IN ('AIR', 'SEA', 'ROAD', 'RAIL', 'EXPRESS')`
    ),
    check('shipping_channels_version_check', sql`version >= 1`),
    check('shipping_channels_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const rateCards = pgTable(
  'rate_cards',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    code: text().notNull(),
    name: text().notNull(),
    channelId: text('channel_id'),
    customerId: text('customer_id'),
    state: text().default('DRAFT').notNull(),
    currency: text().notNull(),
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
    index('rate_cards_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'rate_cards_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.channelId],
      foreignColumns: [shippingChannels.tenantId, shippingChannels.id],
      name: 'rate_cards_channel_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
      name: 'rate_cards_customer_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('rate_cards_tenant_id_unique').on(table.tenantId, table.id),
    unique('rate_cards_tenant_code_unique').on(table.tenantId, table.code),
    pgPolicy('rate_cards_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('rate_cards_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('rate_cards_code_check', sql`code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'::text`),
    check(
      'rate_cards_name_check',
      sql`(length(btrim(name)) >= 1) AND (length(btrim(name)) <= 200)`
    ),
    check(
      'rate_cards_state_check',
      sql`state = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'RETIRED'::text])`
    ),
    check('rate_cards_currency_check', sql`currency ~ '^[A-Z]{3}$'::text`),
    check('rate_cards_version_check', sql`version >= 1`),
    check('rate_cards_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const rateCardVersions = pgTable(
  'rate_card_versions',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    rateCardId: text('rate_card_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    state: text().default('DRAFT').notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true, mode: 'string' }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true, mode: 'string' }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('rate_card_versions_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'rate_card_versions_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.rateCardId],
      foreignColumns: [rateCards.tenantId, rateCards.id],
      name: 'rate_card_versions_card_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('rate_card_versions_tenant_id_unique').on(table.tenantId, table.id),
    unique('rate_card_versions_number_unique').on(
      table.tenantId,
      table.rateCardId,
      table.versionNumber
    ),
    pgPolicy('rate_card_versions_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('rate_card_versions_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('rate_card_versions_number_check', sql`version_number >= 1`),
    check(
      'rate_card_versions_state_check',
      sql`state = ANY (ARRAY['DRAFT'::text, 'PUBLISHED'::text, 'RETIRED'::text])`
    ),
    check('rate_card_versions_validity_check', sql`valid_until > valid_from`),
    check(
      'rate_card_versions_publish_check',
      sql`((state = 'DRAFT'::text) AND (published_at IS NULL)) OR ((state = ANY (ARRAY['PUBLISHED'::text, 'RETIRED'::text])) AND (published_at IS NOT NULL))`
    ),
    check('rate_card_versions_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const rateRules = pgTable(
  'rate_rules',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    rateCardVersionId: text('rate_card_version_id').notNull(),
    ruleType: text('rule_type').notNull(),
    ruleCode: text('rule_code'),
    chargeCode: text('charge_code'),
    priceType: text('price_type'),
    zoneCode: text('zone_code'),
    priority: integer().notNull(),
    channelId: text('channel_id'),
    serviceCode: text('service_code').notNull(),
    originCountryCode: text('origin_country_code').notNull(),
    destinationCountryCode: text('destination_country_code').notNull(),
    packageType: text('package_type').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    minWeightGrams: bigint('min_weight_grams', { mode: 'number' }).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    maxWeightGrams: bigint('max_weight_grams', { mode: 'number' }).notNull(),
    calculationMethod: text('calculation_method').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    amountMinor: bigint('amount_minor', { mode: 'number' }),
    currency: text(),
    percentageBps: integer('percentage_bps'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    dimensionalDivisor: bigint('dimensional_divisor', { mode: 'number' }),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    roundingStepGrams: bigint('rounding_step_grams', { mode: 'number' }),
    roundingMode: text('rounding_mode'),
    minimumChargeMinor: bigint('minimum_charge_minor', { mode: 'number' }),
    effectiveFrom: timestamp('effective_from', { withTimezone: true, mode: 'string' }),
    effectiveUntil: timestamp('effective_until', { withTimezone: true, mode: 'string' }),
    state: text().default('ACTIVE').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    scopeKey: text('scope_key').generatedAlwaysAs(
      sql`((((((((COALESCE(channel_id, '*'::text) || '|'::text) || service_code) || '|'::text) || origin_country_code) || '|'::text) || destination_country_code) || '|'::text) || package_type)`
    ),
    weightRange: int8Range('weight_range').generatedAlwaysAs(
      sql`int8range(min_weight_grams, max_weight_grams, '[]'::text)`
    ),
  },
  (table) => [
    index('rate_rules_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'rate_rules_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.rateCardVersionId],
      foreignColumns: [rateCardVersions.tenantId, rateCardVersions.id],
      name: 'rate_rules_version_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.channelId],
      foreignColumns: [shippingChannels.tenantId, shippingChannels.id],
      name: 'rate_rules_channel_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('rate_rules_tenant_id_unique').on(table.tenantId, table.id),
    pgPolicy('rate_rules_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('rate_rules_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'rate_rules_type_check',
      sql`rule_type = ANY (ARRAY['BASE'::text, 'WEIGHT_STEP'::text, 'FUEL'::text, 'MINIMUM'::text, 'SURCHARGE'::text, 'DISCOUNT'::text])`
    ),
    check('rate_rules_priority_check', sql`priority >= 0`),
    check(
      'rate_rules_service_check',
      sql`(length(btrim(service_code)) >= 1) AND (length(btrim(service_code)) <= 64)`
    ),
    check('rate_rules_origin_check', sql`origin_country_code ~ '^([A-Z]{2}|[*])$'::text`),
    check('rate_rules_destination_check', sql`destination_country_code ~ '^([A-Z]{2}|[*])$'::text`),
    check(
      'rate_rules_package_type_check',
      sql`(length(btrim(package_type)) >= 1) AND (length(btrim(package_type)) <= 32)`
    ),
    check(
      'rate_rules_weight_check',
      sql`(min_weight_grams > 0) AND (max_weight_grams >= min_weight_grams)`
    ),
    check(
      'rate_rules_method_check',
      sql`calculation_method = ANY (ARRAY['FLAT'::text, 'PER_KG'::text, 'PERCENT'::text, 'PERCENTAGE'::text, 'MINIMUM'::text])`
    ),
    check(
      'rate_rules_money_check',
      sql`((calculation_method = ANY (ARRAY['FLAT'::text, 'PER_KG'::text, 'MINIMUM'::text])) AND (amount_minor IS NOT NULL) AND (amount_minor >= 0) AND (currency ~ '^[A-Z]{3}$'::text) AND (percentage_bps IS NULL)) OR ((calculation_method IN ('PERCENT', 'PERCENTAGE')) AND (amount_minor IS NULL) AND (currency IS NULL) AND ((percentage_bps >= '-10000'::integer) AND (percentage_bps <= 100000)))`
    ),
    check(
      'rate_rules_measurement_check',
      sql`((dimensional_divisor IS NULL) OR (dimensional_divisor > 0)) AND ((rounding_step_grams IS NULL) OR (rounding_step_grams > 0)) AND (rounding_mode IS NULL OR rounding_mode IN ('UP', 'NEAREST', 'DOWN')) AND (minimum_charge_minor IS NULL OR minimum_charge_minor >= 0)`
    ),
    check(
      'rate_rules_semantic_metadata_check',
      sql`(rule_code IS NULL OR length(btrim(rule_code)) BETWEEN 1 AND 64) AND (charge_code IS NULL OR length(btrim(charge_code)) BETWEEN 1 AND 64) AND (price_type IS NULL OR price_type IN ('COST', 'AGENT', 'CUSTOMER', 'SPECIAL')) AND (zone_code IS NULL OR length(btrim(zone_code)) BETWEEN 1 AND 64) AND (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from)`
    ),
    check('rate_rules_state_check', sql`state = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'INACTIVE'::text])`),
    check('rate_rules_version_check', sql`version >= 1`),
    check('rate_rules_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const quotes = pgTable(
  'quotes',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    quoteNumber: text('quote_number').notNull(),
    customerId: text('customer_id').notNull(),
    pickupAddressId: text('pickup_address_id'),
    deliveryAddressId: text('delivery_address_id'),
    state: text().default('OPEN').notNull(),
    requestedCurrency: text('requested_currency').notNull(),
    idempotencyKey: text('idempotency_key'),
    acceptedQuoteVersionId: text('accepted_quote_version_id'),
    acceptedQuoteOptionId: text('accepted_quote_option_id'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    ...acceptedQuoteForeignKeys(table),
    index('quotes_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId, table.deliveryAddressId],
      foreignColumns: [customerAddresses.tenantId, customerAddresses.id],
      name: 'quotes_delivery_address_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'quotes_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
      name: 'quotes_customer_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.pickupAddressId],
      foreignColumns: [customerAddresses.tenantId, customerAddresses.id],
      name: 'quotes_pickup_address_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('quotes_tenant_id_unique').on(table.tenantId, table.id),
    unique('quotes_tenant_number_unique').on(table.tenantId, table.quoteNumber),
    unique('quotes_tenant_idempotency_unique').on(table.tenantId, table.idempotencyKey),
    pgPolicy('quotes_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('quotes_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'quotes_number_check',
      sql`(length(btrim(quote_number)) >= 1) AND (length(btrim(quote_number)) <= 100)`
    ),
    check(
      'quotes_state_check',
      sql`state = ANY (ARRAY['OPEN'::text, 'ACCEPTED'::text, 'EXPIRED'::text, 'CANCELLED'::text])`
    ),
    check('quotes_currency_check', sql`requested_currency ~ '^[A-Z]{3}$'::text`),
    check(
      'quotes_acceptance_pointer_check',
      sql`((state = 'ACCEPTED'::text) AND (accepted_quote_version_id IS NOT NULL) AND (accepted_quote_option_id IS NOT NULL)) OR ((state <> 'ACCEPTED'::text) AND (accepted_quote_version_id IS NULL) AND (accepted_quote_option_id IS NULL))`
    ),
    check('quotes_version_check', sql`version >= 1`),
    check('quotes_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const quoteVersions = pgTable(
  'quote_versions',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    quoteId: text('quote_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    inputSnapshot: jsonb('input_snapshot').notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true, mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('quote_versions_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'quote_versions_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.quoteId],
      foreignColumns: [quotes.tenantId, quotes.id],
      name: 'quote_versions_quote_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('quote_versions_tenant_id_unique').on(table.tenantId, table.id),
    unique('quote_versions_ownership_key_unique').on(table.tenantId, table.id, table.quoteId),
    unique('quote_versions_quote_version_unique').on(
      table.tenantId,
      table.quoteId,
      table.versionNumber
    ),
    pgPolicy('quote_versions_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('quote_versions_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('quote_versions_number_check', sql`version_number >= 1`),
    check('quote_versions_input_check', sql`jsonb_typeof(input_snapshot) = 'object'::text`),
    check('quote_versions_validity_check', sql`valid_until > created_at`),
  ]
).enableRLS();

export const quoteParcels = pgTable(
  'quote_parcels',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    quoteVersionId: text('quote_version_id').notNull(),
    parcelNumber: integer('parcel_number').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    actualWeightGrams: bigint('actual_weight_grams', { mode: 'number' }).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    lengthMm: bigint('length_mm', { mode: 'number' }).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    widthMm: bigint('width_mm', { mode: 'number' }).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    heightMm: bigint('height_mm', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('quote_parcels_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'quote_parcels_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.quoteVersionId],
      foreignColumns: [quoteVersions.tenantId, quoteVersions.id],
      name: 'quote_parcels_version_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('quote_parcels_tenant_id_unique').on(table.tenantId, table.id),
    unique('quote_parcels_number_unique').on(
      table.tenantId,
      table.quoteVersionId,
      table.parcelNumber
    ),
    pgPolicy('quote_parcels_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('quote_parcels_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('quote_parcels_number_check', sql`parcel_number >= 1`),
    check(
      'quote_parcels_measurements_check',
      sql`(actual_weight_grams > 0) AND (length_mm > 0) AND (width_mm > 0) AND (height_mm > 0)`
    ),
  ]
).enableRLS();

export const quoteOptions = pgTable(
  'quote_options',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    quoteVersionId: text('quote_version_id').notNull(),
    quoteId: text('quote_id').notNull(),
    optionCode: text('option_code').notNull(),
    channelId: text('channel_id').notNull(),
    serviceCode: text('service_code').notNull(),
    currency: text().notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    totalAmountMinor: bigint('total_amount_minor', { mode: 'number' }).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    chargeableWeightGrams: bigint('chargeable_weight_grams', { mode: 'number' }).notNull(),
    estimatedTransitDays: integer('estimated_transit_days'),
    state: text().default('OFFERED').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('quote_options_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'quote_options_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.quoteVersionId, table.quoteId],
      foreignColumns: [quoteVersions.tenantId, quoteVersions.id, quoteVersions.quoteId],
      name: 'quote_options_version_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.channelId],
      foreignColumns: [shippingChannels.tenantId, shippingChannels.id],
      name: 'quote_options_channel_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('quote_options_tenant_id_unique').on(table.tenantId, table.id),
    unique('quote_options_version_key_unique').on(table.tenantId, table.id, table.quoteVersionId),
    unique('quote_options_ownership_key_unique').on(
      table.tenantId,
      table.id,
      table.quoteVersionId,
      table.quoteId
    ),
    unique('quote_options_acceptance_key_unique').on(
      table.tenantId,
      table.id,
      table.quoteVersionId,
      table.quoteId,
      table.currency,
      table.totalAmountMinor
    ),
    unique('quote_options_money_key_unique').on(table.tenantId, table.id, table.currency),
    unique('quote_options_code_unique').on(table.tenantId, table.quoteVersionId, table.optionCode),
    pgPolicy('quote_options_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('quote_options_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'quote_options_code_check',
      sql`(length(btrim(option_code)) >= 1) AND (length(btrim(option_code)) <= 64)`
    ),
    check(
      'quote_options_service_check',
      sql`(length(btrim(service_code)) >= 1) AND (length(btrim(service_code)) <= 64)`
    ),
    check(
      'quote_options_money_check',
      sql`(currency ~ '^[A-Z]{3}$'::text) AND (total_amount_minor >= 0)`
    ),
    check('quote_options_measurement_check', sql`chargeable_weight_grams > 0`),
    check(
      'quote_options_transit_check',
      sql`(estimated_transit_days IS NULL) OR (estimated_transit_days >= 0)`
    ),
    check(
      'quote_options_state_check',
      sql`state = ANY (ARRAY['OFFERED'::text, 'SELECTED'::text, 'UNAVAILABLE'::text])`
    ),
  ]
).enableRLS();

export const quoteChargeLines = pgTable(
  'quote_charge_lines',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    quoteOptionId: text('quote_option_id').notNull(),
    lineNumber: integer('line_number').notNull(),
    chargeCode: text('charge_code').notNull(),
    description: text().notNull(),
    currency: text().notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    rateRuleId: text('rate_rule_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('quote_charge_lines_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'quote_charge_lines_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.quoteOptionId, table.currency],
      foreignColumns: [quoteOptions.tenantId, quoteOptions.id, quoteOptions.currency],
      name: 'quote_charge_lines_option_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.rateRuleId],
      foreignColumns: [rateRules.tenantId, rateRules.id],
      name: 'quote_charge_lines_rule_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('quote_charge_lines_tenant_id_unique').on(table.tenantId, table.id),
    unique('quote_charge_lines_number_unique').on(
      table.tenantId,
      table.quoteOptionId,
      table.lineNumber
    ),
    pgPolicy('quote_charge_lines_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('quote_charge_lines_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('quote_charge_lines_number_check', sql`line_number >= 1`),
    check(
      'quote_charge_lines_code_check',
      sql`(length(btrim(charge_code)) >= 1) AND (length(btrim(charge_code)) <= 64)`
    ),
    check(
      'quote_charge_lines_description_check',
      sql`(length(btrim(description)) >= 1) AND (length(btrim(description)) <= 500)`
    ),
    check(
      'quote_charge_lines_money_check',
      sql`(currency ~ '^[A-Z]{3}$'::text) AND ((amount_minor >= '-9000000000000000'::bigint) AND (amount_minor <= '9000000000000000'::bigint))`
    ),
  ]
).enableRLS();

export const quoteExplanations = pgTable(
  'quote_explanations',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    quoteOptionId: text('quote_option_id').notNull(),
    sequenceNumber: integer('sequence_number').notNull(),
    explanationCode: text('explanation_code').notNull(),
    message: text().notNull(),
    factsSnapshot: jsonb('facts_snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('quote_explanations_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'quote_explanations_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.quoteOptionId],
      foreignColumns: [quoteOptions.tenantId, quoteOptions.id],
      name: 'quote_explanations_option_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('quote_explanations_tenant_id_unique').on(table.tenantId, table.id),
    unique('quote_explanations_sequence_unique').on(
      table.tenantId,
      table.quoteOptionId,
      table.sequenceNumber
    ),
    pgPolicy('quote_explanations_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('quote_explanations_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('quote_explanations_sequence_check', sql`sequence_number >= 1`),
    check(
      'quote_explanations_code_check',
      sql`(length(btrim(explanation_code)) >= 1) AND (length(btrim(explanation_code)) <= 64)`
    ),
    check(
      'quote_explanations_message_check',
      sql`(length(btrim(message)) >= 1) AND (length(btrim(message)) <= 2000)`
    ),
    check('quote_explanations_facts_check', sql`jsonb_typeof(facts_snapshot) = 'object'::text`),
  ]
).enableRLS();

export const quoteAcceptances = pgTable(
  'quote_acceptances',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    quoteId: text('quote_id').notNull(),
    quoteVersionId: text('quote_version_id').notNull(),
    quoteOptionId: text('quote_option_id').notNull(),
    currency: text().notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    totalAmountMinor: bigint('total_amount_minor', { mode: 'number' }).notNull(),
    explanationSnapshot: jsonb('explanation_snapshot').notNull(),
    acceptedBySubjectId: text('accepted_by_subject_id').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('quote_acceptances_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'quote_acceptances_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.quoteId],
      foreignColumns: [quotes.tenantId, quotes.id],
      name: 'quote_acceptances_quote_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.quoteVersionId, table.quoteId],
      foreignColumns: [quoteVersions.tenantId, quoteVersions.id, quoteVersions.quoteId],
      name: 'quote_acceptances_version_ownership_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [
        table.tenantId,
        table.quoteOptionId,
        table.quoteVersionId,
        table.quoteId,
        table.currency,
        table.totalAmountMinor,
      ],
      foreignColumns: [
        quoteOptions.tenantId,
        quoteOptions.id,
        quoteOptions.quoteVersionId,
        quoteOptions.quoteId,
        quoteOptions.currency,
        quoteOptions.totalAmountMinor,
      ],
      name: 'quote_acceptances_option_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('quote_acceptances_tenant_id_unique').on(table.tenantId, table.id),
    unique('quote_acceptances_ownership_unique').on(
      table.tenantId,
      table.id,
      table.quoteId,
      table.quoteVersionId,
      table.quoteOptionId
    ),
    unique('quote_acceptances_quote_unique').on(table.tenantId, table.quoteId),
    pgPolicy('quote_acceptances_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('quote_acceptances_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'quote_acceptances_money_check',
      sql`(currency ~ '^[A-Z]{3}$'::text) AND (total_amount_minor >= 0)`
    ),
    check(
      'quote_acceptances_explanation_check',
      sql`(jsonb_typeof(explanation_snapshot) = 'array'::text) AND (jsonb_array_length(explanation_snapshot) > 0)`
    ),
    check('quote_acceptances_subject_check', sql`length(btrim(accepted_by_subject_id)) >= 1`),
    check('quote_acceptances_time_check', sql`created_at >= accepted_at`),
  ]
).enableRLS();

export const orders = pgTable(
  'orders',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    orderNumber: text('order_number').notNull(),
    customerId: text('customer_id').notNull(),
    pickupAddressId: text('pickup_address_id').notNull(),
    deliveryAddressId: text('delivery_address_id').notNull(),
    quoteAcceptanceId: text('quote_acceptance_id'),
    orderType: text('order_type').default('STANDARD').notNull(),
    state: text().default('DRAFT').notNull(),
    idempotencyKey: text('idempotency_key'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('orders_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'orders_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
      name: 'orders_customer_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.pickupAddressId],
      foreignColumns: [customerAddresses.tenantId, customerAddresses.id],
      name: 'orders_pickup_address_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.deliveryAddressId],
      foreignColumns: [customerAddresses.tenantId, customerAddresses.id],
      name: 'orders_delivery_address_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.quoteAcceptanceId],
      foreignColumns: [quoteAcceptances.tenantId, quoteAcceptances.id],
      name: 'orders_quote_acceptance_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('orders_tenant_id_unique').on(table.tenantId, table.id),
    unique('orders_tenant_number_unique').on(table.tenantId, table.orderNumber),
    unique('orders_tenant_idempotency_unique').on(table.tenantId, table.idempotencyKey),
    pgPolicy('orders_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('orders_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'orders_number_check',
      sql`(length(btrim(order_number)) >= 1) AND (length(btrim(order_number)) <= 100)`
    ),
    check(
      'orders_state_check',
      sql`state = ANY (ARRAY['DRAFT'::text, 'VALIDATED'::text, 'SUBMITTED'::text, 'CANCELLED'::text])`
    ),
    check('orders_type_check', sql`order_type IN ('STANDARD', 'FBA')`),
    check(
      'orders_submission_check',
      sql`((state = ANY (ARRAY['SUBMITTED'::text, 'CANCELLED'::text])) AND (submitted_at IS NOT NULL)) OR ((state = ANY (ARRAY['DRAFT'::text, 'VALIDATED'::text])) AND (submitted_at IS NULL))`
    ),
    check('orders_version_check', sql`version >= 1`),
    check('orders_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const orderBatchJobs = pgTable(
  'order_batch_jobs',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    batchNumber: text('batch_number').notNull(),
    operation: text().notNull(),
    state: text().default('PENDING').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    totalItems: integer('total_items').default(0).notNull(),
    succeededItems: integer('succeeded_items').default(0).notNull(),
    failedItems: integer('failed_items').default(0).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('order_batch_jobs_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'order_batch_jobs_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('order_batch_jobs_tenant_id_unique').on(table.tenantId, table.id),
    unique('order_batch_jobs_number_unique').on(table.tenantId, table.batchNumber),
    unique('order_batch_jobs_idempotency_unique').on(table.tenantId, table.idempotencyKey),
    pgPolicy('order_batch_jobs_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('order_batch_jobs_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'order_batch_jobs_number_check',
      sql`(length(btrim(batch_number)) >= 1) AND (length(btrim(batch_number)) <= 100)`
    ),
    check(
      'order_batch_jobs_operation_check',
      sql`operation = ANY (ARRAY['COPY'::text, 'RENUMBER'::text, 'SPLIT'::text, 'MERGE'::text, 'VALIDATE'::text, 'SUBMIT'::text, 'CANCEL'::text])`
    ),
    check(
      'order_batch_jobs_state_check',
      sql`state = ANY (ARRAY['PENDING'::text, 'RUNNING'::text, 'COMPLETED'::text, 'COMPLETED_WITH_ERRORS'::text, 'FAILED'::text])`
    ),
    check(
      'order_batch_jobs_counts_check',
      sql`(total_items >= 0) AND (succeeded_items >= 0) AND (failed_items >= 0) AND ((succeeded_items + failed_items) <= total_items)`
    ),
    check(
      'order_batch_jobs_completion_check',
      sql`((state = ANY (ARRAY['COMPLETED'::text, 'COMPLETED_WITH_ERRORS'::text, 'FAILED'::text])) AND (completed_at IS NOT NULL)) OR ((state = ANY (ARRAY['PENDING'::text, 'RUNNING'::text])) AND (completed_at IS NULL))`
    ),
    check('order_batch_jobs_version_check', sql`version >= 1`),
    check('order_batch_jobs_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const orderBatchItems = pgTable(
  'order_batch_items',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    batchJobId: text('batch_job_id').notNull(),
    itemNumber: integer('item_number').notNull(),
    itemKey: text('item_key').notNull(),
    sourceOrderId: text('source_order_id').notNull(),
    outcome: text().default('PENDING').notNull(),
    resultOrderId: text('result_order_id'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('order_batch_items_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'order_batch_items_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.batchJobId],
      foreignColumns: [orderBatchJobs.tenantId, orderBatchJobs.id],
      name: 'order_batch_items_job_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.sourceOrderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'order_batch_items_source_order_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.resultOrderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'order_batch_items_result_order_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('order_batch_items_tenant_id_unique').on(table.tenantId, table.id),
    unique('order_batch_items_number_unique').on(
      table.tenantId,
      table.batchJobId,
      table.itemNumber
    ),
    unique('order_batch_items_key_unique').on(table.tenantId, table.batchJobId, table.itemKey),
    pgPolicy('order_batch_items_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('order_batch_items_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('order_batch_items_number_check', sql`item_number >= 1`),
    check(
      'order_batch_items_key_check',
      sql`(length(btrim(item_key)) >= 1) AND (length(btrim(item_key)) <= 200)`
    ),
    check(
      'order_batch_items_outcome_check',
      sql`outcome = ANY (ARRAY['PENDING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'SKIPPED'::text])`
    ),
    check(
      'order_batch_items_result_check',
      sql`((outcome = 'PENDING'::text) AND (result_order_id IS NULL) AND (error_code IS NULL)) OR ((outcome = 'SUCCEEDED'::text) AND (result_order_id IS NOT NULL) AND (error_code IS NULL)) OR ((outcome = ANY (ARRAY['FAILED'::text, 'SKIPPED'::text])) AND (result_order_id IS NULL) AND (error_code IS NOT NULL))`
    ),
    check('order_batch_items_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const waybills = pgTable(
  'waybills',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    waybillNumber: text('waybill_number').notNull(),
    trackingNumber: text('tracking_number').notNull(),
    orderId: text('order_id').notNull(),
    state: text().default('DRAFT').notNull(),
    idempotencyKey: text('idempotency_key'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('waybills_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'waybills_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'waybills_order_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('waybills_tenant_id_unique').on(table.tenantId, table.id),
    unique('waybills_tenant_number_unique').on(table.tenantId, table.waybillNumber),
    unique('waybills_tenant_tracking_unique').on(table.tenantId, table.trackingNumber),
    unique('waybills_tenant_idempotency_unique').on(table.tenantId, table.idempotencyKey),
    pgPolicy('waybills_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('waybills_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'waybills_number_check',
      sql`(length(btrim(waybill_number)) >= 1) AND (length(btrim(waybill_number)) <= 100)`
    ),
    check(
      'waybills_tracking_check',
      sql`(length(btrim(tracking_number)) >= 1) AND (length(btrim(tracking_number)) <= 100)`
    ),
    check(
      'waybills_state_check',
      sql`state = ANY (ARRAY['DRAFT'::text, 'FORECASTED'::text, 'AWAITING_RECEIPT'::text, 'RECEIVED'::text, 'AWAITING_ROUTING'::text, 'AWAITING_TRANSIT'::text, 'IN_TRANSIT'::text, 'OUT_FOR_DELIVERY'::text, 'DELIVERED'::text, 'AWAITING_RETURN'::text, 'RETURNED'::text, 'CANCELLED'::text])`
    ),
    check(
      'waybills_issue_check',
      sql`((state = ANY (ARRAY['DRAFT'::text, 'FORECASTED'::text])) AND (issued_at IS NULL)) OR ((state <> ALL (ARRAY['DRAFT'::text, 'FORECASTED'::text])) AND (issued_at IS NOT NULL))`
    ),
    check('waybills_version_check', sql`version >= 1`),
    check('waybills_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const waybillPackages = pgTable(
  'waybill_packages',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    packageNumber: integer('package_number').notNull(),
    trackingNumber: text('tracking_number'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    actualWeightGrams: bigint('actual_weight_grams', { mode: 'number' }).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    lengthMm: bigint('length_mm', { mode: 'number' }).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    widthMm: bigint('width_mm', { mode: 'number' }).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    heightMm: bigint('height_mm', { mode: 'number' }).notNull(),
    state: text().default('PLANNED').notNull(),
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
    index('waybill_packages_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    uniqueIndex('waybill_packages_tenant_tracking_unique')
      .using('btree', table.tenantId.asc().nullsLast(), table.trackingNumber.asc().nullsLast())
      .where(sql`(tracking_number IS NOT NULL)`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'waybill_packages_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'waybill_packages_waybill_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('waybill_packages_tenant_id_unique').on(table.tenantId, table.id),
    unique('waybill_packages_warehouse_pair_unique').on(table.tenantId, table.id, table.waybillId),
    unique('waybill_packages_number_unique').on(
      table.tenantId,
      table.waybillId,
      table.packageNumber
    ),
    pgPolicy('waybill_packages_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('waybill_packages_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('waybill_packages_number_check', sql`package_number >= 1`),
    check(
      'waybill_packages_tracking_check',
      sql`(tracking_number IS NULL) OR ((length(btrim(tracking_number)) >= 1) AND (length(btrim(tracking_number)) <= 100))`
    ),
    check(
      'waybill_packages_measurements_check',
      sql`(actual_weight_grams > 0) AND (length_mm > 0) AND (width_mm > 0) AND (height_mm > 0)`
    ),
    check(
      'waybill_packages_state_check',
      sql`state = ANY (ARRAY['PLANNED'::text, 'LABELLED'::text, 'VOID'::text])`
    ),
    check('waybill_packages_version_check', sql`version >= 1`),
    check('waybill_packages_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const customsDeclarations = pgTable(
  'customs_declarations',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    declarationNumber: text('declaration_number'),
    incoterm: text(),
    currency: text().notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    totalValueMinor: bigint('total_value_minor', { mode: 'number' }).notNull(),
    insured: boolean().default(false).notNull(),
    insuredValueAmount: numeric('insured_value_amount', { precision: 20, scale: 6 }),
    insuredValueMinor: bigint('insured_value_minor', { mode: 'number' }),
    insuredCurrency: text('insured_currency'),
    state: text().default('DRAFT').notNull(),
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
    index('customs_declarations_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'customs_declarations_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'customs_declarations_waybill_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('customs_declarations_tenant_id_unique').on(table.tenantId, table.id),
    unique('customs_declarations_number_unique').on(table.tenantId, table.declarationNumber),
    pgPolicy('customs_declarations_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('customs_declarations_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'customs_declarations_number_check',
      sql`declaration_number IS NULL OR length(btrim(declaration_number)) BETWEEN 1 AND 100`
    ),
    check('customs_declarations_incoterm_check', sql`incoterm IS NULL OR incoterm ~ '^[A-Z]{3}$'::text`),
    check(
      'customs_declarations_money_check',
      sql`(currency ~ '^[A-Z]{3}$'::text) AND (total_value_minor >= 0)`
    ),
    check(
      'customs_declarations_state_check',
      sql`state = ANY (ARRAY['DRAFT'::text, 'SUBMITTED'::text, 'ACCEPTED'::text, 'REJECTED'::text, 'VOID'::text])`
    ),
    check(
      'customs_declarations_insurance_check',
      sql`(NOT insured AND insured_value_amount IS NULL AND insured_value_minor IS NULL AND insured_currency IS NULL) OR (insured AND (insured_value_amount IS NOT NULL OR insured_value_minor IS NOT NULL) AND insured_currency ~ '^[A-Z]{3}$'::text)`
    ),
    check('customs_declarations_version_check', sql`version >= 1`),
    check('customs_declarations_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const declarationItems = pgTable(
  'declaration_items',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    declarationId: text('declaration_id').notNull(),
    lineNumber: integer('line_number').notNull(),
    description: text().notNull(),
    hsCode: text('hs_code'),
    originCountryCode: text('origin_country_code'),
    quantity: integer().notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    unitValueMinor: bigint('unit_value_minor', { mode: 'number' }).notNull(),
    currency: text().notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    netWeightGrams: bigint('net_weight_grams', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('declaration_items_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'declaration_items_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.declarationId],
      foreignColumns: [customsDeclarations.tenantId, customsDeclarations.id],
      name: 'declaration_items_declaration_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('declaration_items_tenant_id_unique').on(table.tenantId, table.id),
    unique('declaration_items_line_unique').on(
      table.tenantId,
      table.declarationId,
      table.lineNumber
    ),
    pgPolicy('declaration_items_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('declaration_items_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('declaration_items_line_check', sql`line_number >= 1`),
    check(
      'declaration_items_description_check',
      sql`(length(btrim(description)) >= 1) AND (length(btrim(description)) <= 500)`
    ),
    check('declaration_items_hs_code_check', sql`hs_code IS NULL OR hs_code ~ '^[0-9]{6,12}$'::text`),
    check('declaration_items_origin_check', sql`origin_country_code IS NULL OR origin_country_code ~ '^[A-Z]{2}$'::text`),
    check('declaration_items_quantity_check', sql`quantity > 0`),
    check(
      'declaration_items_money_check',
      sql`(currency ~ '^[A-Z]{3}$'::text) AND (unit_value_minor >= 0)`
    ),
    check('declaration_items_weight_check', sql`net_weight_grams IS NULL OR net_weight_grams > 0`),
  ]
).enableRLS();

export const attachments = pgTable(
  'attachments',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    objectKey: text('object_key').notNull(),
    fileName: text('file_name').notNull(),
    mediaType: text('media_type').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: text().notNull(),
    category: text().notNull(),
    orderId: text('order_id'),
    waybillId: text('waybill_id'),
    importJobId: text('import_job_id'),
    state: text().default('ACTIVE').notNull(),
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
    index('attachments_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'attachments_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.orderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'attachments_order_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'attachments_waybill_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.importJobId],
      foreignColumns: [importJobs.tenantId, importJobs.id],
      name: 'attachments_import_job_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    unique('attachments_tenant_id_unique').on(table.tenantId, table.id),
    unique('attachments_object_key_unique').on(table.tenantId, table.objectKey),
    pgPolicy('attachments_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('attachments_size_check', sql`size_bytes > 0`),
    check('attachments_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('attachments_object_key_check', sql`length(btrim(object_key)) >= 1`),
    check(
      'attachments_file_name_check',
      sql`(length(btrim(file_name)) >= 1) AND (length(btrim(file_name)) <= 255)`
    ),
    check('attachments_media_type_check', sql`media_type ~ '^[^/]+/[^/]+$'::text`),
    check('attachments_sha256_check', sql`sha256 ~ '^[0-9a-f]{64}$'::text`),
    check(
      'attachments_category_check',
      sql`category = ANY (ARRAY['LABEL'::text, 'COMMERCIAL_INVOICE'::text, 'CUSTOMS_DOCUMENT'::text, 'IMPORT_SOURCE'::text, 'OTHER'::text])`
    ),
    check('attachments_owner_check', sql`num_nonnulls(order_id, waybill_id, import_job_id) = 1`),
    check('attachments_state_check', sql`state = ANY (ARRAY['ACTIVE'::text, 'DELETED'::text])`),
    check('attachments_version_check', sql`version >= 1`),
    check('attachments_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();

export const importJobs = pgTable(
  'import_jobs',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    importNumber: text('import_number').notNull(),
    importType: text('import_type').notNull(),
    sourceObjectKey: text('source_object_key'),
    sourceSha256: text('source_sha256'),
    sourceFileRef: text('source_file_ref'),
    sourceMetadata: jsonb('source_metadata'),
    atomicity: text(),
    mappingVersion: integer('mapping_version'),
    validationVersion: integer('validation_version'),
    state: text().default('UPLOADED').notNull(),
    idempotencyKey: text('idempotency_key'),
    rollbackOfJobId: text('rollback_of_job_id'),
    totalRows: integer('total_rows').default(0).notNull(),
    succeededRows: integer('succeeded_rows').default(0).notNull(),
    failedRows: integer('failed_rows').default(0).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    committedAt: timestamp('committed_at', { withTimezone: true, mode: 'string' }),
    rolledBackAt: timestamp('rolled_back_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('import_jobs_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    uniqueIndex('import_jobs_single_rollback_unique')
      .using('btree', table.tenantId.asc().nullsLast(), table.rollbackOfJobId.asc().nullsLast())
      .where(sql`(rollback_of_job_id IS NOT NULL)`),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'import_jobs_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.rollbackOfJobId],
      foreignColumns: [table.tenantId, table.id],
      name: 'import_jobs_rollback_job_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('import_jobs_tenant_id_unique').on(table.tenantId, table.id),
    unique('import_jobs_number_unique').on(table.tenantId, table.importNumber),
    unique('import_jobs_idempotency_unique').on(table.tenantId, table.idempotencyKey),
    pgPolicy('import_jobs_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('import_jobs_timestamps_check', sql`updated_at >= created_at`),
    check(
      'import_jobs_not_self_rollback_check',
      sql`(rollback_of_job_id IS NULL) OR (rollback_of_job_id <> id)`
    ),
    check('import_jobs_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check(
      'import_jobs_number_check',
      sql`(length(btrim(import_number)) >= 1) AND (length(btrim(import_number)) <= 100)`
    ),
    check(
      'import_jobs_type_check',
      sql`import_type = ANY (ARRAY['ORDERS'::text, 'PAYABLES'::text, 'MASTER_DATA'::text, 'MIGRATION'::text, 'WAYBILLS'::text])`
    ),
    check(
      'import_jobs_source_check',
      sql`(source_file_ref IS NULL OR length(btrim(source_file_ref)) >= 1) AND (source_metadata IS NULL OR jsonb_typeof(source_metadata) = 'object') AND (source_object_key IS NULL OR length(btrim(source_object_key)) >= 1) AND (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'::text)`
    ),
    check(
      'import_jobs_atomicity_check',
      sql`atomicity IS NULL OR atomicity IN ('ALL_OR_NOTHING', 'ALLOW_PARTIAL')`
    ),
    check(
      'import_jobs_versions_check',
      sql`(mapping_version IS NULL OR mapping_version >= 1) AND (validation_version IS NULL OR validation_version >= 1)`
    ),
    check(
      'import_jobs_state_check',
      sql`state = ANY (ARRAY['UPLOADED'::text, 'MAPPING'::text, 'VALIDATING'::text, 'READY'::text, 'COMMITTING'::text, 'COMPLETED'::text, 'FAILED'::text, 'ROLLED_BACK'::text])`
    ),
    check(
      'import_jobs_counts_check',
      sql`(total_rows >= 0) AND (succeeded_rows >= 0) AND (failed_rows >= 0) AND ((succeeded_rows + failed_rows) <= total_rows)`
    ),
    check(
      'import_jobs_commit_check',
      sql`((state = ANY (ARRAY['COMPLETED'::text, 'ROLLED_BACK'::text])) AND (committed_at IS NOT NULL)) OR ((state <> ALL (ARRAY['COMPLETED'::text, 'ROLLED_BACK'::text])) AND (committed_at IS NULL))`
    ),
    check(
      'import_jobs_rollback_check',
      sql`((state = 'ROLLED_BACK'::text) AND (rolled_back_at IS NOT NULL)) OR ((state <> 'ROLLED_BACK'::text) AND (rolled_back_at IS NULL))`
    ),
    check('import_jobs_version_check', sql`version >= 1`),
  ]
).enableRLS();

export const importRows = pgTable(
  'import_rows',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    importJobId: text('import_job_id').notNull(),
    rowNumber: integer('row_number').notNull(),
    sourceFingerprint: text('source_fingerprint').notNull(),
    inputPayload: jsonb('input_payload').notNull(),
    validationStatus: text('validation_status').default('PENDING').notNull(),
    commitStatus: text('commit_status').default('NOT_ATTEMPTED').notNull(),
    rollbackStatus: text('rollback_status').default('NOT_REQUIRED').notNull(),
    resultCode: text('result_code'),
    resultMessage: text('result_message'),
    createdOrderId: text('created_order_id'),
    createdWaybillId: text('created_waybill_id'),
    appliedAt: timestamp('applied_at', { withTimezone: true, mode: 'string' }),
    rolledBackAt: timestamp('rolled_back_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('import_rows_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast(),
      table.createdAt.asc().nullsLast(),
      table.id.asc().nullsLast()
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'import_rows_tenant_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.importJobId],
      foreignColumns: [importJobs.tenantId, importJobs.id],
      name: 'import_rows_job_fk',
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.createdOrderId],
      foreignColumns: [orders.tenantId, orders.id],
      name: 'import_rows_order_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.createdWaybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'import_rows_waybill_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('import_rows_tenant_id_unique').on(table.tenantId, table.id),
    unique('import_rows_number_unique').on(table.tenantId, table.importJobId, table.rowNumber),
    unique('import_rows_fingerprint_unique').on(
      table.tenantId,
      table.importJobId,
      table.sourceFingerprint
    ),
    pgPolicy('import_rows_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('import_rows_id_check', sql`id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'::text`),
    check('import_rows_number_check', sql`row_number >= 1`),
    check('import_rows_fingerprint_check', sql`source_fingerprint ~ '^[0-9a-f]{64}$'::text`),
    check('import_rows_payload_check', sql`jsonb_typeof(input_payload) = 'object'::text`),
    check(
      'import_rows_validation_status_check',
      sql`validation_status = ANY (ARRAY['PENDING'::text, 'VALID'::text, 'INVALID'::text])`
    ),
    check(
      'import_rows_commit_status_check',
      sql`commit_status = ANY (ARRAY['NOT_ATTEMPTED'::text, 'APPLIED'::text, 'FAILED'::text, 'SKIPPED'::text])`
    ),
    check(
      'import_rows_rollback_status_check',
      sql`rollback_status = ANY (ARRAY['NOT_REQUIRED'::text, 'PENDING'::text, 'ROLLED_BACK'::text, 'FAILED'::text])`
    ),
    check(
      'import_rows_result_check',
      sql`((commit_status = ANY (ARRAY['APPLIED'::text, 'FAILED'::text, 'SKIPPED'::text])) AND (result_code IS NOT NULL)) OR ((commit_status = 'NOT_ATTEMPTED'::text) AND (result_code IS NULL))`
    ),
    check(
      'import_rows_applied_check',
      sql`((commit_status = 'APPLIED'::text) AND (applied_at IS NOT NULL) AND (num_nonnulls(created_order_id, created_waybill_id) = 1)) OR ((commit_status <> 'APPLIED'::text) AND (applied_at IS NULL) AND (created_order_id IS NULL) AND (created_waybill_id IS NULL))`
    ),
    check(
      'import_rows_rollback_shape_check',
      sql`((commit_status = 'APPLIED'::text) AND (((rollback_status = 'ROLLED_BACK'::text) AND (rolled_back_at IS NOT NULL)) OR ((rollback_status = ANY (ARRAY['NOT_REQUIRED'::text, 'PENDING'::text, 'FAILED'::text])) AND (rolled_back_at IS NULL)))) OR ((commit_status <> 'APPLIED'::text) AND (rollback_status = 'NOT_REQUIRED'::text) AND (rolled_back_at IS NULL))`
    ),
    check('import_rows_timestamps_check', sql`updated_at >= created_at`),
  ]
).enableRLS();
