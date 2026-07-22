import {
  type AnyPgColumn,
  type ForeignKeyBuilder,
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { customerAddresses, customers, devices, tenants, warehouses } from './identity';
import { waybillPackages, waybills } from './rates-waybills';

function receiptActiveMeasurementForeignKey(table: {
  activeMeasurementId: AnyPgColumn;
  tenantId: AnyPgColumn;
}): ForeignKeyBuilder {
  return foreignKey({
    columns: [table.tenantId, table.activeMeasurementId],
    foreignColumns: [warehouseMeasurements.tenantId, warehouseMeasurements.id],
    name: 'warehouse_receipts_active_measurement_fk',
  }).onDelete('restrict');
}

function podCurrentVersionForeignKey(table: {
  currentVersion: AnyPgColumn;
  id: AnyPgColumn;
  tenantId: AnyPgColumn;
}): ForeignKeyBuilder {
  return foreignKey({
    columns: [table.tenantId, table.id, table.currentVersion],
    foreignColumns: [podVersions.tenantId, podVersions.podRecordId, podVersions.podVersion],
    name: 'pod_records_current_version_fk',
  }).onDelete('restrict');
}

function deviceEventConflictForeignKey(table: {
  conflictId: AnyPgColumn;
  tenantId: AnyPgColumn;
}): ForeignKeyBuilder {
  return foreignKey({
    columns: [table.tenantId, table.conflictId],
    foreignColumns: [deviceSyncConflicts.tenantId, deviceSyncConflicts.id],
    name: 'device_event_receipts_conflict_fk',
  }).onDelete('restrict');
}

export const warehouseScans = pgTable(
  'warehouse_scans',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    warehouseId: text('warehouse_id').notNull(),
    deviceId: text('device_id').notNull(),
    clientEventId: text('client_event_id').notNull(),
    scanCode: text('scan_code').notNull(),
    scanKind: text('scan_kind').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('warehouse_scans_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'warehouse_scans_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.warehouseId],
      foreignColumns: [warehouses.tenantId, warehouses.id],
      name: 'warehouse_scans_warehouse_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.deviceId],
      foreignColumns: [devices.tenantId, devices.id],
      name: 'warehouse_scans_device_fk',
    }).onDelete('restrict'),
    unique('warehouse_scans_identity_unique').on(table.tenantId, table.id),
    unique('warehouse_scans_device_event_unique').on(
      table.tenantId,
      table.deviceId,
      table.clientEventId
    ),
    pgPolicy('warehouse_scans_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check(
      'warehouse_scans_kind_check',
      sql`scan_kind = ANY (ARRAY['RECEIVE'::text, 'SORT'::text, 'LOAD'::text, 'DELIVER'::text, 'EXCEPTION'::text])`
    ),
    check('warehouse_scans_code_check', sql`length(btrim(scan_code)) > 0`),
  ]
).enableRLS();

export const warehouseReceipts = pgTable(
  'warehouse_receipts',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    receiptNo: text('receipt_no').notNull(),
    warehouseId: text('warehouse_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    scanId: text('scan_id').notNull(),
    activeMeasurementId: text('active_measurement_id'),
    status: text().default('SCANNED').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    undoUntil: timestamp('undo_until', { withTimezone: true, mode: 'string' }).notNull(),
    undoneAt: timestamp('undone_at', { withTimezone: true, mode: 'string' }),
    undoReason: text('undo_reason'),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'string' })
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
    receiptActiveMeasurementForeignKey(table),
    index('warehouse_receipts_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'warehouse_receipts_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.warehouseId],
      foreignColumns: [warehouses.tenantId, warehouses.id],
      name: 'warehouse_receipts_warehouse_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'warehouse_receipts_waybill_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.scanId],
      foreignColumns: [warehouseScans.tenantId, warehouseScans.id],
      name: 'warehouse_receipts_scan_fk',
    }).onDelete('restrict'),
    unique('warehouse_receipts_identity_unique').on(table.tenantId, table.id),
    unique('warehouse_receipts_number_unique').on(table.tenantId, table.receiptNo),
    unique('warehouse_receipts_scan_unique').on(table.tenantId, table.scanId),
    pgPolicy('warehouse_receipts_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check(
      'warehouse_receipts_status_check',
      sql`status = ANY (ARRAY['SCANNED'::text, 'CONFIRMED'::text, 'UNDONE'::text])`
    ),
    check('warehouse_receipts_version_check', sql`version >= 1`),
    check('warehouse_receipts_undo_window_check', sql`undo_until >= received_at`),
    check(
      'warehouse_receipts_undo_shape_check',
      sql`((status = ANY (ARRAY['SCANNED'::text, 'CONFIRMED'::text])) AND (undone_at IS NULL) AND (undo_reason IS NULL)) OR ((status = 'UNDONE'::text) AND (undone_at IS NOT NULL) AND (length(btrim(undo_reason)) > 0))`
    ),
  ]
).enableRLS();

export const warehouseMeasurements = pgTable(
  'warehouse_measurements',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    receiptId: text('receipt_id').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    measurementVersion: bigint('measurement_version', { mode: 'number' }).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    actualWeightGrams: bigint('actual_weight_grams', { mode: 'number' }).notNull(),
    lengthMm: integer('length_mm').notNull(),
    widthMm: integer('width_mm').notNull(),
    heightMm: integer('height_mm').notNull(),
    source: text().notNull(),
    deviceId: text('device_id'),
    supersedesId: text('supersedes_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('warehouse_measurements_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'warehouse_measurements_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.receiptId],
      foreignColumns: [warehouseReceipts.tenantId, warehouseReceipts.id],
      name: 'warehouse_measurements_receipt_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.deviceId],
      foreignColumns: [devices.tenantId, devices.id],
      name: 'warehouse_measurements_device_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.supersedesId],
      foreignColumns: [table.tenantId, table.id],
      name: 'warehouse_measurements_supersedes_fk',
    }).onDelete('restrict'),
    unique('warehouse_measurements_identity_unique').on(table.tenantId, table.id),
    unique('warehouse_measurements_receipt_version_unique').on(
      table.tenantId,
      table.receiptId,
      table.measurementVersion
    ),
    pgPolicy('warehouse_measurements_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('warehouse_measurements_version_check', sql`measurement_version > 0`),
    check('warehouse_measurements_weight_check', sql`actual_weight_grams > 0`),
    check('warehouse_measurements_length_check', sql`length_mm > 0`),
    check('warehouse_measurements_width_check', sql`width_mm > 0`),
    check('warehouse_measurements_height_check', sql`height_mm > 0`),
    check(
      'warehouse_measurements_source_check',
      sql`source = ANY (ARRAY['DEVICE'::text, 'MANUAL'::text, 'IMPORT'::text, 'AMENDMENT'::text])`
    ),
  ]
).enableRLS();

export const warehouseMedia = pgTable(
  'warehouse_media',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    receiptId: text('receipt_id'),
    mediaKind: text('media_kind').notNull(),
    objectKey: text('object_key').notNull(),
    sha256Hex: text('sha256_hex').notNull(),
    contentType: text('content_type').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    captureDeviceId: text('capture_device_id'),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('warehouse_media_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'warehouse_media_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.receiptId],
      foreignColumns: [warehouseReceipts.tenantId, warehouseReceipts.id],
      name: 'warehouse_media_receipt_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.captureDeviceId],
      foreignColumns: [devices.tenantId, devices.id],
      name: 'warehouse_media_device_fk',
    }).onDelete('restrict'),
    unique('warehouse_media_identity_unique').on(table.tenantId, table.id),
    unique('warehouse_media_object_key_unique').on(table.tenantId, table.objectKey),
    pgPolicy('warehouse_media_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('warehouse_media_hash_check', sql`sha256_hex ~ '^[0-9a-f]{64}$'::text`),
    check('warehouse_media_size_check', sql`size_bytes > 0`),
    check(
      'warehouse_media_kind_check',
      sql`media_kind = ANY (ARRAY['PHOTO'::text, 'SIGNATURE'::text, 'VIDEO'::text, 'DOCUMENT'::text])`
    ),
  ]
).enableRLS();

export const inventoryBalances = pgTable(
  'inventory_balances',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    warehouseId: text('warehouse_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    packageId: text('package_id').notNull(),
    stockState: text('stock_state').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    quantityBase: bigint('quantity_base', { mode: 'number' }).default(0).notNull(),
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
    index('inventory_balances_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'inventory_balances_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.warehouseId],
      foreignColumns: [warehouses.tenantId, warehouses.id],
      name: 'inventory_balances_warehouse_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'inventory_balances_waybill_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.packageId, table.waybillId],
      foreignColumns: [waybillPackages.tenantId, waybillPackages.id, waybillPackages.waybillId],
      name: 'inventory_balances_package_waybill_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('inventory_balances_identity_unique').on(table.tenantId, table.id),
    unique('inventory_balances_bucket_unique').on(
      table.tenantId,
      table.warehouseId,
      table.packageId,
      table.stockState
    ),
    pgPolicy('inventory_balances_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('inventory_balances_quantity_check', sql`quantity_base >= 0`),
    check('inventory_balances_version_check', sql`version >= 1`),
    check(
      'inventory_balances_state_check',
      sql`stock_state = ANY (ARRAY['RECEIVED'::text, 'SORTED'::text, 'STAGED'::text, 'LOADED'::text, 'EXCEPTION'::text])`
    ),
  ]
).enableRLS();

export const inventoryLedgerEntries = pgTable(
  'inventory_ledger_entries',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    inventoryBalanceId: text('inventory_balance_id').notNull(),
    receiptId: text('receipt_id'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    quantityDeltaBase: bigint('quantity_delta_base', { mode: 'number' }).notNull(),
    reason: text().notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('inventory_ledger_entries_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId, table.receiptId],
      foreignColumns: [warehouseReceipts.tenantId, warehouseReceipts.id],
      name: 'inventory_ledger_entries_receipt_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'inventory_ledger_entries_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.inventoryBalanceId],
      foreignColumns: [inventoryBalances.tenantId, inventoryBalances.id],
      name: 'inventory_ledger_entries_balance_fk',
    }).onDelete('restrict'),
    unique('inventory_ledger_entries_identity_unique').on(table.tenantId, table.id),
    unique('inventory_ledger_entries_idempotency_unique').on(table.tenantId, table.idempotencyKey),
    pgPolicy('inventory_ledger_entries_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('inventory_ledger_entries_delta_check', sql`quantity_delta_base <> 0`),
    check('inventory_ledger_entries_reason_check', sql`length(btrim(reason)) > 0`),
    check(
      'inventory_ledger_entries_source_check',
      sql`source_type = ANY (ARRAY['RECEIPT'::text, 'SORT'::text, 'LOAD'::text, 'UNDO'::text, 'ADJUSTMENT'::text, 'DELIVERY'::text])`
    ),
  ]
).enableRLS();

export const routeDecisions = pgTable(
  'route_decisions',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    receiptId: text('receipt_id'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    decisionVersion: bigint('decision_version', { mode: 'number' }).notNull(),
    routeCode: text('route_code').notNull(),
    decisionStatus: text('decision_status').notNull(),
    explanation: jsonb().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('route_decisions_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'route_decisions_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'route_decisions_waybill_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.receiptId],
      foreignColumns: [warehouseReceipts.tenantId, warehouseReceipts.id],
      name: 'route_decisions_receipt_fk',
    }).onDelete('restrict'),
    unique('route_decisions_identity_unique').on(table.tenantId, table.id),
    unique('route_decisions_waybill_version_unique').on(
      table.tenantId,
      table.waybillId,
      table.decisionVersion
    ),
    pgPolicy('route_decisions_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('route_decisions_version_check', sql`decision_version > 0`),
    check(
      'route_decisions_status_check',
      sql`decision_status = ANY (ARRAY['PROPOSED'::text, 'CONFIRMED'::text, 'OVERRIDDEN'::text, 'REJECTED'::text])`
    ),
    check('route_decisions_route_check', sql`length(btrim(route_code)) > 0`),
  ]
).enableRLS();

export const loadUnits = pgTable(
  'load_units',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    loadUnitNo: text('load_unit_no').notNull(),
    originWarehouseId: text('origin_warehouse_id').notNull(),
    destinationWarehouseId: text('destination_warehouse_id').notNull(),
    status: text().default('OPEN').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    sealedAt: timestamp('sealed_at', { withTimezone: true, mode: 'string' }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('load_units_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'load_units_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.originWarehouseId],
      foreignColumns: [warehouses.tenantId, warehouses.id],
      name: 'load_units_origin_warehouse_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.destinationWarehouseId],
      foreignColumns: [warehouses.tenantId, warehouses.id],
      name: 'load_units_destination_warehouse_fk',
    }).onDelete('restrict'),
    unique('load_units_identity_unique').on(table.tenantId, table.id),
    unique('load_units_number_unique').on(table.tenantId, table.loadUnitNo),
    pgPolicy('load_units_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('load_units_version_check', sql`version >= 1`),
    check(
      'load_units_status_check',
      sql`status = ANY (ARRAY['OPEN'::text, 'SEALED'::text, 'DISPATCHED'::text])`
    ),
    check(
      'load_units_state_shape_check',
      sql`((status = 'OPEN'::text) AND (sealed_at IS NULL) AND (dispatched_at IS NULL)) OR ((status = 'SEALED'::text) AND (sealed_at IS NOT NULL) AND (dispatched_at IS NULL)) OR ((status = 'DISPATCHED'::text) AND (sealed_at IS NOT NULL) AND (dispatched_at IS NOT NULL))`
    ),
    check(
      'load_units_distinct_warehouses_check',
      sql`origin_warehouse_id <> destination_warehouse_id`
    ),
  ]
).enableRLS();

export const loadUnitItems = pgTable(
  'load_unit_items',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    loadUnitId: text('load_unit_id').notNull(),
    waybillId: text('waybill_id').notNull(),
    packageId: text('package_id').notNull(),
    itemSequence: integer('item_sequence').notNull(),
    loadedAt: timestamp('loaded_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('load_unit_items_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('text_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'load_unit_items_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.loadUnitId],
      foreignColumns: [loadUnits.tenantId, loadUnits.id],
      name: 'load_unit_items_load_unit_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'load_unit_items_waybill_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.packageId, table.waybillId],
      foreignColumns: [waybillPackages.tenantId, waybillPackages.id, waybillPackages.waybillId],
      name: 'load_unit_items_package_waybill_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    unique('load_unit_items_identity_unique').on(table.tenantId, table.id),
    unique('load_unit_items_package_unique').on(table.tenantId, table.loadUnitId, table.packageId),
    unique('load_unit_items_sequence_unique').on(
      table.tenantId,
      table.loadUnitId,
      table.itemSequence
    ),
    pgPolicy('load_unit_items_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('load_unit_items_sequence_check', sql`item_sequence > 0`),
  ]
).enableRLS();

export const linehaulBookings = pgTable(
  'linehaul_bookings',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    bookingNo: text('booking_no').notNull(),
    loadUnitId: text('load_unit_id').notNull(),
    carrierCode: text('carrier_code').notNull(),
    status: text().default('DRAFT').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    departureAt: timestamp('departure_at', { withTimezone: true, mode: 'string' }),
    arrivalAt: timestamp('arrival_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('linehaul_bookings_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'linehaul_bookings_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.loadUnitId],
      foreignColumns: [loadUnits.tenantId, loadUnits.id],
      name: 'linehaul_bookings_load_unit_fk',
    }).onDelete('restrict'),
    unique('linehaul_bookings_identity_unique').on(table.tenantId, table.id),
    unique('linehaul_bookings_number_unique').on(table.tenantId, table.bookingNo),
    pgPolicy('linehaul_bookings_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('linehaul_bookings_version_check', sql`version >= 1`),
    check(
      'linehaul_bookings_status_check',
      sql`status = ANY (ARRAY['DRAFT'::text, 'CONFIRMED'::text, 'DEPARTED'::text, 'CLOSED'::text, 'CANCELLED'::text])`
    ),
    check(
      'linehaul_bookings_schedule_check',
      sql`(arrival_at IS NULL) OR (departure_at IS NULL) OR (arrival_at > departure_at)`
    ),
  ]
).enableRLS();

export const billsOfLading = pgTable(
  'bills_of_lading',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    bolNo: text('bol_no').notNull(),
    bookingId: text('booking_id').notNull(),
    documentMediaId: text('document_media_id'),
    status: text().default('DRAFT').notNull(),
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
    index('bills_of_lading_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'bills_of_lading_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.bookingId],
      foreignColumns: [linehaulBookings.tenantId, linehaulBookings.id],
      name: 'bills_of_lading_booking_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.documentMediaId],
      foreignColumns: [warehouseMedia.tenantId, warehouseMedia.id],
      name: 'bills_of_lading_media_fk',
    }).onDelete('restrict'),
    unique('bills_of_lading_identity_unique').on(table.tenantId, table.id),
    unique('bills_of_lading_number_unique').on(table.tenantId, table.bolNo),
    pgPolicy('bills_of_lading_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('bills_of_lading_version_check', sql`version >= 1`),
    check(
      'bills_of_lading_status_check',
      sql`status = ANY (ARRAY['DRAFT'::text, 'ISSUED'::text, 'VOID'::text])`
    ),
  ]
).enableRLS();

export const fbaDeliveries = pgTable(
  'fba_deliveries',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    fbaDeliveryNo: text('fba_delivery_no').notNull(),
    bookingId: text('booking_id').notNull(),
    destinationAddressId: text('destination_address_id').notNull(),
    appointmentReference: text('appointment_reference'),
    status: text().default('PLANNED').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    appointmentAt: timestamp('appointment_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('fba_deliveries_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'fba_deliveries_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.bookingId],
      foreignColumns: [linehaulBookings.tenantId, linehaulBookings.id],
      name: 'fba_deliveries_booking_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.destinationAddressId],
      foreignColumns: [customerAddresses.tenantId, customerAddresses.id],
      name: 'fba_deliveries_address_fk',
    }).onDelete('restrict'),
    unique('fba_deliveries_identity_unique').on(table.tenantId, table.id),
    unique('fba_deliveries_number_unique').on(table.tenantId, table.fbaDeliveryNo),
    unique('fba_deliveries_appointment_unique').on(table.tenantId, table.appointmentReference),
    pgPolicy('fba_deliveries_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('fba_deliveries_version_check', sql`version >= 1`),
    check(
      'fba_deliveries_status_check',
      sql`status = ANY (ARRAY['PLANNED'::text, 'APPOINTED'::text, 'IN_TRANSIT'::text, 'DELIVERED'::text, 'EXCEPTION'::text, 'CANCELLED'::text])`
    ),
  ]
).enableRLS();

export const deliveryTasks = pgTable(
  'delivery_tasks',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    taskNo: text('task_no').notNull(),
    waybillId: text('waybill_id').notNull(),
    fbaDeliveryId: text('fba_delivery_id'),
    customerId: text('customer_id').notNull(),
    destinationAddressId: text('destination_address_id').notNull(),
    assignedDeviceId: text('assigned_device_id'),
    partnerCode: text('partner_code'),
    status: text().default('PLANNED').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    plannedAt: timestamp('planned_at', { withTimezone: true, mode: 'string' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('delivery_tasks_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId, table.waybillId],
      foreignColumns: [waybills.tenantId, waybills.id],
      name: 'delivery_tasks_waybill_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.fbaDeliveryId],
      foreignColumns: [fbaDeliveries.tenantId, fbaDeliveries.id],
      name: 'delivery_tasks_fba_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.customerId],
      foreignColumns: [customers.tenantId, customers.id],
      name: 'delivery_tasks_customer_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'delivery_tasks_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.destinationAddressId, table.customerId],
      foreignColumns: [
        customerAddresses.tenantId,
        customerAddresses.id,
        customerAddresses.customerId,
      ],
      name: 'delivery_tasks_address_customer_fk',
    })
      .onUpdate('restrict')
      .onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.assignedDeviceId],
      foreignColumns: [devices.tenantId, devices.id],
      name: 'delivery_tasks_device_fk',
    }).onDelete('restrict'),
    unique('delivery_tasks_identity_unique').on(table.tenantId, table.id),
    unique('delivery_tasks_number_unique').on(table.tenantId, table.taskNo),
    pgPolicy('delivery_tasks_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('delivery_tasks_version_check', sql`version >= 1`),
    check(
      'delivery_tasks_status_check',
      sql`status = ANY (ARRAY['PLANNED'::text, 'PALLETIZED'::text, 'LOADED'::text, 'OUT_FOR_DELIVERY'::text, 'COMPLETED'::text, 'EXCEPTION'::text])`
    ),
    check(
      'delivery_tasks_completion_check',
      sql`((status = 'COMPLETED'::text) AND (completed_at IS NOT NULL)) OR (status <> 'COMPLETED'::text)`
    ),
  ]
).enableRLS();

export const deliveryTaskEvents = pgTable(
  'delivery_task_events',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    deliveryTaskId: text('delivery_task_id').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    eventSequence: bigint('event_sequence', { mode: 'number' }).notNull(),
    eventType: text('event_type').notNull(),
    source: text().notNull(),
    sourceEventId: text('source_event_id').notNull(),
    payload: jsonb().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('delivery_task_events_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'delivery_task_events_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.deliveryTaskId],
      foreignColumns: [deliveryTasks.tenantId, deliveryTasks.id],
      name: 'delivery_task_events_task_fk',
    }).onDelete('cascade'),
    unique('delivery_task_events_identity_unique').on(table.tenantId, table.id),
    unique('delivery_task_events_sequence_unique').on(
      table.tenantId,
      table.deliveryTaskId,
      table.eventSequence
    ),
    unique('delivery_task_events_source_unique').on(
      table.tenantId,
      table.source,
      table.sourceEventId
    ),
    pgPolicy('delivery_task_events_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('delivery_task_events_sequence_check', sql`event_sequence > 0`),
    check(
      'delivery_task_events_type_check',
      sql`event_type = ANY (ARRAY['INTAKE'::text, 'DISCREPANCY'::text, 'ASSIGNED'::text, 'ACCEPTED'::text, 'DEPARTED'::text, 'ARRIVED'::text, 'DELIVERED'::text, 'FAILED'::text, 'CANCELLED'::text, 'PARTNER_REPLAY'::text])`
    ),
    check(
      'delivery_task_events_source_check',
      sql`source = ANY (ARRAY['SYSTEM'::text, 'DEVICE'::text, 'PARTNER'::text, 'OPERATOR'::text])`
    ),
  ]
).enableRLS();

export const podRecords = pgTable(
  'pod_records',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    podNo: text('pod_no').notNull(),
    deliveryTaskId: text('delivery_task_id').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    currentVersion: bigint('current_version', { mode: 'number' }).default(1).notNull(),
    status: text().default('CAPTURED').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    podCurrentVersionForeignKey(table),
    index('pod_records_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'pod_records_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.deliveryTaskId],
      foreignColumns: [deliveryTasks.tenantId, deliveryTasks.id],
      name: 'pod_records_task_fk',
    }).onDelete('restrict'),
    unique('pod_records_identity_unique').on(table.tenantId, table.id),
    unique('pod_records_number_unique').on(table.tenantId, table.podNo),
    unique('pod_records_task_unique').on(table.tenantId, table.deliveryTaskId),
    pgPolicy('pod_records_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('pod_records_version_check', sql`current_version > 0`),
    check('pod_records_status_check', sql`status = ANY (ARRAY['CAPTURED'::text, 'AMENDED'::text])`),
  ]
).enableRLS();

export const podVersions = pgTable(
  'pod_versions',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    podRecordId: text('pod_record_id').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    podVersion: bigint('pod_version', { mode: 'number' }).notNull(),
    recipientName: text('recipient_name').notNull(),
    signatureMediaId: text('signature_media_id'),
    photoMediaId: text('photo_media_id'),
    latitudeE6: integer('latitude_e6'),
    longitudeE6: integer('longitude_e6'),
    amendmentReason: text('amendment_reason'),
    supersedesVersionId: text('supersedes_version_id'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    supersedesPodVersion: bigint('supersedes_pod_version', { mode: 'number' }).generatedAlwaysAs(
      sql`(pod_version - 1)`
    ),
    payload: jsonb().notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('pod_versions_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'pod_versions_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.podRecordId],
      foreignColumns: [podRecords.tenantId, podRecords.id],
      name: 'pod_versions_record_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.signatureMediaId],
      foreignColumns: [warehouseMedia.tenantId, warehouseMedia.id],
      name: 'pod_versions_signature_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.photoMediaId],
      foreignColumns: [warehouseMedia.tenantId, warehouseMedia.id],
      name: 'pod_versions_photo_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [
        table.tenantId,
        table.supersedesVersionId,
        table.podRecordId,
        table.supersedesPodVersion,
      ],
      foreignColumns: [table.tenantId, table.id, table.podRecordId, table.podVersion],
      name: 'pod_versions_supersedes_fk',
    }).onDelete('restrict'),
    unique('pod_versions_identity_unique').on(table.tenantId, table.id),
    unique('pod_versions_chain_target_unique').on(
      table.tenantId,
      table.id,
      table.podRecordId,
      table.podVersion
    ),
    unique('pod_versions_number_unique').on(table.tenantId, table.podRecordId, table.podVersion),
    pgPolicy('pod_versions_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('pod_versions_version_check', sql`pod_version > 0`),
    check('pod_versions_recipient_check', sql`length(btrim(recipient_name)) > 0`),
    check(
      'pod_versions_latitude_check',
      sql`(latitude_e6 IS NULL) OR ((latitude_e6 >= '-90000000'::integer) AND (latitude_e6 <= 90000000))`
    ),
    check(
      'pod_versions_longitude_check',
      sql`(longitude_e6 IS NULL) OR ((longitude_e6 >= '-180000000'::integer) AND (longitude_e6 <= 180000000))`
    ),
    check(
      'pod_versions_amendment_check',
      sql`((pod_version = 1) AND (supersedes_version_id IS NULL) AND (amendment_reason IS NULL)) OR ((pod_version > 1) AND (supersedes_version_id IS NOT NULL) AND (length(btrim(amendment_reason)) > 0))`
    ),
  ]
).enableRLS();

export const deviceSyncSessions = pgTable(
  'device_sync_sessions',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    deviceId: text('device_id').notNull(),
    warehouseId: text('warehouse_id').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    bindingVersion: bigint('binding_version', { mode: 'number' }).notNull(),
    status: text().default('OPEN').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    lastLocalSequence: bigint('last_local_sequence', { mode: 'number' }).default(0).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('device_sync_sessions_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('timestamptz_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'device_sync_sessions_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.deviceId],
      foreignColumns: [devices.tenantId, devices.id],
      name: 'device_sync_sessions_device_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.warehouseId],
      foreignColumns: [warehouses.tenantId, warehouses.id],
      name: 'device_sync_sessions_warehouse_fk',
    }).onDelete('restrict'),
    unique('device_sync_sessions_identity_unique').on(table.tenantId, table.id),
    unique('device_sync_sessions_scope_unique').on(
      table.tenantId,
      table.id,
      table.deviceId,
      table.warehouseId
    ),
    pgPolicy('device_sync_sessions_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('device_sync_sessions_binding_check', sql`binding_version >= 0`),
    check('device_sync_sessions_sequence_check', sql`last_local_sequence >= 0`),
    check(
      'device_sync_sessions_status_check',
      sql`status = ANY (ARRAY['OPEN'::text, 'CLOSED'::text, 'EXPIRED'::text])`
    ),
    check('device_sync_sessions_expiry_check', sql`expires_at > created_at`),
    check(
      'device_sync_sessions_close_check',
      sql`((status = 'OPEN'::text) AND (closed_at IS NULL)) OR ((status <> 'OPEN'::text) AND (closed_at IS NOT NULL))`
    ),
  ]
).enableRLS();

export const deviceEventReceipts = pgTable(
  'device_event_receipts',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    sessionId: text('session_id').notNull(),
    deviceId: text('device_id').notNull(),
    warehouseId: text('warehouse_id').notNull(),
    eventId: text('event_id').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    localSequence: bigint('local_sequence', { mode: 'number' }).notNull(),
    eventType: text('event_type').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id'),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    expectedVersion: bigint('expected_version', { mode: 'number' }),
    disposition: text().notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    serverVersion: bigint('server_version', { mode: 'number' }),
    duplicateOfId: text('duplicate_of_id'),
    conflictId: text('conflict_id'),
    errorEnvelope: jsonb('error_envelope'),
    payload: jsonb().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    deviceEventConflictForeignKey(table),
    index('device_event_receipts_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'device_event_receipts_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.sessionId, table.deviceId, table.warehouseId],
      foreignColumns: [
        deviceSyncSessions.tenantId,
        deviceSyncSessions.id,
        deviceSyncSessions.deviceId,
        deviceSyncSessions.warehouseId,
      ],
      name: 'device_event_receipts_session_scope_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.duplicateOfId],
      foreignColumns: [table.tenantId, table.id],
      name: 'device_event_receipts_duplicate_fk',
    }).onDelete('restrict'),
    unique('device_event_receipts_identity_unique').on(table.tenantId, table.id),
    unique('device_event_receipts_event_unique').on(table.tenantId, table.deviceId, table.eventId),
    unique('device_event_receipts_sequence_unique').on(
      table.tenantId,
      table.sessionId,
      table.localSequence
    ),
    pgPolicy('device_event_receipts_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('device_event_receipts_sequence_check', sql`local_sequence > 0`),
    check(
      'device_event_receipts_expected_version_check',
      sql`(expected_version IS NULL) OR (expected_version >= 0)`
    ),
    check(
      'device_event_receipts_server_version_check',
      sql`(server_version IS NULL) OR (server_version >= 0)`
    ),
    check(
      'device_event_receipts_disposition_check',
      sql`disposition = ANY (ARRAY['APPLIED'::text, 'DUPLICATE'::text, 'CONFLICT'::text, 'REJECTED'::text])`
    ),
    check(
      'device_event_receipts_result_shape_check',
      sql`((disposition = 'APPLIED'::text) AND (server_version IS NOT NULL) AND (duplicate_of_id IS NULL) AND (conflict_id IS NULL) AND (error_envelope IS NULL)) OR ((disposition = 'DUPLICATE'::text) AND (server_version IS NOT NULL) AND (duplicate_of_id IS NOT NULL) AND (conflict_id IS NULL) AND (error_envelope IS NULL)) OR ((disposition = 'CONFLICT'::text) AND (server_version IS NOT NULL) AND (duplicate_of_id IS NULL) AND (conflict_id IS NOT NULL) AND (error_envelope IS NULL)) OR ((disposition = 'REJECTED'::text) AND (server_version IS NULL) AND (duplicate_of_id IS NULL) AND (conflict_id IS NULL) AND (error_envelope IS NOT NULL))`
    ),
  ]
).enableRLS();

export const deviceEventMediaClaims = pgTable(
  'device_event_media_claims',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    deviceEventReceiptId: text('device_event_receipt_id').notNull(),
    mediaId: text('media_id').notNull(),
    claimKey: text('claim_key').notNull(),
    claimStatus: text('claim_status').default('CLAIMED').notNull(),
    claimedAt: timestamp('claimed_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('device_event_media_claims_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('text_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'device_event_media_claims_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.deviceEventReceiptId],
      foreignColumns: [deviceEventReceipts.tenantId, deviceEventReceipts.id],
      name: 'device_event_media_claims_receipt_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.tenantId, table.mediaId],
      foreignColumns: [warehouseMedia.tenantId, warehouseMedia.id],
      name: 'device_event_media_claims_media_fk',
    }).onDelete('restrict'),
    unique('device_event_media_claims_identity_unique').on(table.tenantId, table.id),
    unique('device_event_media_claims_key_unique').on(
      table.tenantId,
      table.deviceEventReceiptId,
      table.claimKey
    ),
    unique('device_event_media_claims_media_unique').on(table.tenantId, table.mediaId),
    pgPolicy('device_event_media_claims_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check(
      'device_event_media_claims_status_check',
      sql`claim_status = ANY (ARRAY['CLAIMED'::text, 'ATTACHED'::text, 'REJECTED'::text])`
    ),
  ]
).enableRLS();

export const deviceSyncConflicts = pgTable(
  'device_sync_conflicts',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    deviceEventReceiptId: text('device_event_receipt_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    expectedVersion: bigint('expected_version', { mode: 'number' }).notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    serverVersion: bigint('server_version', { mode: 'number' }).notNull(),
    serverSnapshot: jsonb('server_snapshot').notNull(),
    clientSnapshot: jsonb('client_snapshot').notNull(),
    status: text().default('OPEN').notNull(),
    resolution: text(),
    resolutionPayload: jsonb('resolution_payload'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'string' }),
    version: bigint({ mode: 'number' }).default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('device_sync_conflicts_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'device_sync_conflicts_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.deviceEventReceiptId],
      foreignColumns: [deviceEventReceipts.tenantId, deviceEventReceipts.id],
      name: 'device_sync_conflicts_event_fk',
    }).onDelete('restrict'),
    unique('device_sync_conflicts_identity_unique').on(table.tenantId, table.id),
    unique('device_sync_conflicts_event_unique').on(table.tenantId, table.deviceEventReceiptId),
    pgPolicy('device_sync_conflicts_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check(
      'device_sync_conflicts_resolution_shape_check',
      sql`((status = 'OPEN'::text) AND (resolution IS NULL) AND (resolution_payload IS NULL) AND (resolved_at IS NULL)) OR ((status = 'RESOLVED'::text) AND (resolution IS NOT NULL) AND (resolved_at IS NOT NULL))`
    ),
    check(
      'device_sync_conflicts_resource_versions_check',
      sql`(expected_version >= 0) AND (server_version >= 0)`
    ),
    check('device_sync_conflicts_version_check', sql`version >= 1`),
    check(
      'device_sync_conflicts_status_check',
      sql`status = ANY (ARRAY['OPEN'::text, 'RESOLVED'::text])`
    ),
    check(
      'device_sync_conflicts_resolution_check',
      sql`(resolution IS NULL) OR (resolution = ANY (ARRAY['KEEP_SERVER'::text, 'REAPPLY_LOCAL'::text, 'SUBMIT_MANUAL'::text]))`
    ),
  ]
).enableRLS();

export const printJobs = pgTable(
  'print_jobs',
  {
    id: text().primaryKey().notNull(),
    tenantId: text('tenant_id').notNull(),
    jobNo: text('job_no').notNull(),
    warehouseId: text('warehouse_id').notNull(),
    deviceId: text('device_id'),
    templateCode: text('template_code').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    status: text().default('QUEUED').notNull(),
    // You can use { mode: 'number' } if numbers are exceeding js number limitations
    version: bigint({ mode: 'number' }).default(1).notNull(),
    attempts: integer().default(0).notNull(),
    payload: jsonb().notNull(),
    printedAt: timestamp('printed_at', { withTimezone: true, mode: 'string' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('print_jobs_cursor_idx').using(
      'btree',
      table.tenantId.asc().nullsLast().op('text_ops'),
      table.createdAt.asc().nullsLast().op('timestamptz_ops'),
      table.id.asc().nullsLast().op('timestamptz_ops')
    ),
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'print_jobs_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.warehouseId],
      foreignColumns: [warehouses.tenantId, warehouses.id],
      name: 'print_jobs_warehouse_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.tenantId, table.deviceId],
      foreignColumns: [devices.tenantId, devices.id],
      name: 'print_jobs_device_fk',
    }).onDelete('restrict'),
    unique('print_jobs_identity_unique').on(table.tenantId, table.id),
    unique('print_jobs_number_unique').on(table.tenantId, table.jobNo),
    unique('print_jobs_dedupe_unique').on(table.tenantId, table.dedupeKey),
    pgPolicy('print_jobs_tenant_isolation', {
      as: 'permissive',
      for: 'all',
      to: ['zhili_app'],
      using: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
      withCheck: sql`(tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))`,
    }),
    check('print_jobs_version_check', sql`version >= 1`),
    check('print_jobs_attempts_check', sql`attempts >= 0`),
    check(
      'print_jobs_status_check',
      sql`status = ANY (ARRAY['QUEUED'::text, 'CLAIMED'::text, 'PRINTED'::text, 'FAILED'::text, 'CANCELLED'::text])`
    ),
    check(
      'print_jobs_printed_check',
      sql`((status = 'PRINTED'::text) AND (printed_at IS NOT NULL)) OR (status <> 'PRINTED'::text)`
    ),
  ]
).enableRLS();
