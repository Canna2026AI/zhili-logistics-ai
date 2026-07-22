-- B1 proposal phase A: warehouse, linehaul, last-mile and device sync.
-- Depends on: packages/db/migrations/0000_foundation.sql
-- Depends on proposal: backend-identity-masterdata.sql
--   tenants(id), customers(tenant_id,id), customer_addresses(tenant_id,id),
--   devices(tenant_id,id), warehouses(tenant_id,id)
-- Depends on proposal: backend-rates-waybills.sql
--   waybills(tenant_id,id), waybill_packages(tenant_id,id)
-- This file intentionally does not redefine upstream tables or form a migration.

-- Publish the authoritative relationship facts as candidate keys so downstream
-- composite foreign keys also prevent later parent-side reassignment.
ALTER TABLE waybill_packages
  ADD CONSTRAINT waybill_packages_warehouse_pair_unique
  UNIQUE (tenant_id, id, waybill_id);

ALTER TABLE customer_addresses
  ADD CONSTRAINT customer_addresses_delivery_pair_unique
  UNIQUE (tenant_id, id, customer_id);

CREATE TABLE warehouse_scans (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  warehouse_id text NOT NULL,
  device_id text NOT NULL,
  client_event_id text NOT NULL,
  scan_code text NOT NULL,
  scan_kind text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_scans_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT warehouse_scans_device_event_unique UNIQUE (tenant_id, device_id, client_event_id),
  CONSTRAINT warehouse_scans_kind_check CHECK (scan_kind IN ('RECEIVE', 'SORT', 'LOAD', 'DELIVER', 'EXCEPTION')),
  CONSTRAINT warehouse_scans_code_check CHECK (length(btrim(scan_code)) > 0),
  CONSTRAINT warehouse_scans_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_scans_warehouse_fk FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_scans_device_fk FOREIGN KEY (tenant_id, device_id) REFERENCES devices (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE warehouse_receipts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  receipt_no text NOT NULL,
  warehouse_id text NOT NULL,
  waybill_id text NOT NULL,
  scan_id text NOT NULL,
  active_measurement_id text,
  status text NOT NULL DEFAULT 'RECEIVED',
  version bigint NOT NULL DEFAULT 0,
  undo_until timestamptz NOT NULL,
  undone_at timestamptz,
  undo_reason text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_receipts_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT warehouse_receipts_number_unique UNIQUE (tenant_id, receipt_no),
  CONSTRAINT warehouse_receipts_scan_unique UNIQUE (tenant_id, scan_id),
  CONSTRAINT warehouse_receipts_status_check CHECK (status IN ('RECEIVED', 'UNDONE')),
  CONSTRAINT warehouse_receipts_version_check CHECK (version >= 0),
  CONSTRAINT warehouse_receipts_undo_window_check CHECK (undo_until >= received_at),
  CONSTRAINT warehouse_receipts_undo_shape_check CHECK (
    (status = 'RECEIVED' AND undone_at IS NULL AND undo_reason IS NULL)
    OR (status = 'UNDONE' AND undone_at IS NOT NULL AND length(btrim(undo_reason)) > 0)
  ),
  CONSTRAINT warehouse_receipts_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_receipts_warehouse_fk FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_receipts_waybill_fk FOREIGN KEY (tenant_id, waybill_id) REFERENCES waybills (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_receipts_scan_fk FOREIGN KEY (tenant_id, scan_id) REFERENCES warehouse_scans (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE warehouse_measurements (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  receipt_id text NOT NULL,
  measurement_version bigint NOT NULL,
  actual_weight_grams bigint NOT NULL,
  length_mm integer NOT NULL,
  width_mm integer NOT NULL,
  height_mm integer NOT NULL,
  source text NOT NULL,
  device_id text,
  supersedes_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_measurements_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT warehouse_measurements_receipt_version_unique UNIQUE (tenant_id, receipt_id, measurement_version),
  CONSTRAINT warehouse_measurements_version_check CHECK (measurement_version > 0),
  CONSTRAINT warehouse_measurements_weight_check CHECK (actual_weight_grams > 0),
  CONSTRAINT warehouse_measurements_length_check CHECK (length_mm > 0),
  CONSTRAINT warehouse_measurements_width_check CHECK (width_mm > 0),
  CONSTRAINT warehouse_measurements_height_check CHECK (height_mm > 0),
  CONSTRAINT warehouse_measurements_source_check CHECK (source IN ('DEVICE', 'MANUAL', 'IMPORT', 'AMENDMENT')),
  CONSTRAINT warehouse_measurements_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_measurements_receipt_fk FOREIGN KEY (tenant_id, receipt_id) REFERENCES warehouse_receipts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_measurements_device_fk FOREIGN KEY (tenant_id, device_id) REFERENCES devices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_measurements_supersedes_fk FOREIGN KEY (tenant_id, supersedes_id) REFERENCES warehouse_measurements (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE warehouse_receipts
  ADD CONSTRAINT warehouse_receipts_active_measurement_fk
  FOREIGN KEY (tenant_id, active_measurement_id) REFERENCES warehouse_measurements (tenant_id, id) ON DELETE RESTRICT;

CREATE TABLE warehouse_media (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  receipt_id text,
  media_kind text NOT NULL,
  object_key text NOT NULL,
  sha256_hex text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  capture_device_id text,
  captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_media_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT warehouse_media_object_key_unique UNIQUE (tenant_id, object_key),
  CONSTRAINT warehouse_media_hash_check CHECK (sha256_hex ~ '^[0-9a-f]{64}$'),
  CONSTRAINT warehouse_media_size_check CHECK (size_bytes > 0),
  CONSTRAINT warehouse_media_kind_check CHECK (media_kind IN ('PHOTO', 'SIGNATURE', 'VIDEO', 'DOCUMENT')),
  CONSTRAINT warehouse_media_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_media_receipt_fk FOREIGN KEY (tenant_id, receipt_id) REFERENCES warehouse_receipts (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_media_device_fk FOREIGN KEY (tenant_id, capture_device_id) REFERENCES devices (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE inventory_balances (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  warehouse_id text NOT NULL,
  waybill_id text NOT NULL,
  package_id text NOT NULL,
  stock_state text NOT NULL,
  quantity_base bigint NOT NULL DEFAULT 0,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_balances_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT inventory_balances_bucket_unique UNIQUE (tenant_id, warehouse_id, package_id, stock_state),
  CONSTRAINT inventory_balances_quantity_check CHECK (quantity_base >= 0),
  CONSTRAINT inventory_balances_version_check CHECK (version >= 0),
  CONSTRAINT inventory_balances_state_check CHECK (stock_state IN ('RECEIVED', 'SORTED', 'STAGED', 'LOADED', 'EXCEPTION')),
  CONSTRAINT inventory_balances_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT inventory_balances_warehouse_fk FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_balances_waybill_fk FOREIGN KEY (tenant_id, waybill_id) REFERENCES waybills (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_balances_package_waybill_fk FOREIGN KEY (tenant_id, package_id, waybill_id)
    REFERENCES waybill_packages (tenant_id, id, waybill_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE inventory_ledger_entries (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  inventory_balance_id text NOT NULL,
  receipt_id text,
  quantity_delta_base bigint NOT NULL,
  reason text NOT NULL,
  source_type text NOT NULL,
  source_id text NOT NULL,
  idempotency_key text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_ledger_entries_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT inventory_ledger_entries_idempotency_unique UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT inventory_ledger_entries_delta_check CHECK (quantity_delta_base <> 0),
  CONSTRAINT inventory_ledger_entries_reason_check CHECK (length(btrim(reason)) > 0),
  CONSTRAINT inventory_ledger_entries_source_check CHECK (source_type IN ('RECEIPT', 'SORT', 'LOAD', 'UNDO', 'ADJUSTMENT', 'DELIVERY')),
  CONSTRAINT inventory_ledger_entries_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT inventory_ledger_entries_balance_fk FOREIGN KEY (tenant_id, inventory_balance_id) REFERENCES inventory_balances (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT inventory_ledger_entries_receipt_fk FOREIGN KEY (tenant_id, receipt_id) REFERENCES warehouse_receipts (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE route_decisions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  waybill_id text NOT NULL,
  receipt_id text,
  decision_version bigint NOT NULL,
  route_code text NOT NULL,
  decision_status text NOT NULL,
  explanation jsonb NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_decisions_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT route_decisions_waybill_version_unique UNIQUE (tenant_id, waybill_id, decision_version),
  CONSTRAINT route_decisions_version_check CHECK (decision_version > 0),
  CONSTRAINT route_decisions_status_check CHECK (decision_status IN ('PROPOSED', 'CONFIRMED', 'OVERRIDDEN', 'REJECTED')),
  CONSTRAINT route_decisions_route_check CHECK (length(btrim(route_code)) > 0),
  CONSTRAINT route_decisions_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT route_decisions_waybill_fk FOREIGN KEY (tenant_id, waybill_id) REFERENCES waybills (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT route_decisions_receipt_fk FOREIGN KEY (tenant_id, receipt_id) REFERENCES warehouse_receipts (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE load_units (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  load_unit_no text NOT NULL,
  origin_warehouse_id text NOT NULL,
  destination_warehouse_id text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  version bigint NOT NULL DEFAULT 0,
  sealed_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT load_units_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT load_units_number_unique UNIQUE (tenant_id, load_unit_no),
  CONSTRAINT load_units_version_check CHECK (version >= 0),
  CONSTRAINT load_units_status_check CHECK (status IN ('DRAFT', 'SEALED', 'DISPATCHED')),
  CONSTRAINT load_units_state_shape_check CHECK (
    (status = 'DRAFT' AND sealed_at IS NULL AND dispatched_at IS NULL)
    OR (status = 'SEALED' AND sealed_at IS NOT NULL AND dispatched_at IS NULL)
    OR (status = 'DISPATCHED' AND sealed_at IS NOT NULL AND dispatched_at IS NOT NULL)
  ),
  CONSTRAINT load_units_distinct_warehouses_check CHECK (origin_warehouse_id <> destination_warehouse_id),
  CONSTRAINT load_units_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT load_units_origin_warehouse_fk FOREIGN KEY (tenant_id, origin_warehouse_id) REFERENCES warehouses (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT load_units_destination_warehouse_fk FOREIGN KEY (tenant_id, destination_warehouse_id) REFERENCES warehouses (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE load_unit_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  load_unit_id text NOT NULL,
  waybill_id text NOT NULL,
  package_id text NOT NULL,
  item_sequence integer NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT load_unit_items_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT load_unit_items_package_unique UNIQUE (tenant_id, load_unit_id, package_id),
  CONSTRAINT load_unit_items_sequence_unique UNIQUE (tenant_id, load_unit_id, item_sequence),
  CONSTRAINT load_unit_items_sequence_check CHECK (item_sequence > 0),
  CONSTRAINT load_unit_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT load_unit_items_load_unit_fk FOREIGN KEY (tenant_id, load_unit_id) REFERENCES load_units (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT load_unit_items_waybill_fk FOREIGN KEY (tenant_id, waybill_id) REFERENCES waybills (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT load_unit_items_package_waybill_fk FOREIGN KEY (tenant_id, package_id, waybill_id)
    REFERENCES waybill_packages (tenant_id, id, waybill_id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE linehaul_bookings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  booking_no text NOT NULL,
  load_unit_id text NOT NULL,
  carrier_code text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  version bigint NOT NULL DEFAULT 0,
  departure_at timestamptz,
  arrival_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT linehaul_bookings_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT linehaul_bookings_number_unique UNIQUE (tenant_id, booking_no),
  CONSTRAINT linehaul_bookings_version_check CHECK (version >= 0),
  CONSTRAINT linehaul_bookings_status_check CHECK (status IN ('DRAFT', 'CONFIRMED', 'DEPARTED', 'ARRIVED', 'CANCELLED')),
  CONSTRAINT linehaul_bookings_schedule_check CHECK (arrival_at IS NULL OR departure_at IS NULL OR arrival_at > departure_at),
  CONSTRAINT linehaul_bookings_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT linehaul_bookings_load_unit_fk FOREIGN KEY (tenant_id, load_unit_id) REFERENCES load_units (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE bills_of_lading (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  bol_no text NOT NULL,
  booking_id text NOT NULL,
  document_media_id text,
  status text NOT NULL DEFAULT 'DRAFT',
  version bigint NOT NULL DEFAULT 0,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bills_of_lading_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT bills_of_lading_number_unique UNIQUE (tenant_id, bol_no),
  CONSTRAINT bills_of_lading_version_check CHECK (version >= 0),
  CONSTRAINT bills_of_lading_status_check CHECK (status IN ('DRAFT', 'ISSUED', 'VOID')),
  CONSTRAINT bills_of_lading_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT bills_of_lading_booking_fk FOREIGN KEY (tenant_id, booking_id) REFERENCES linehaul_bookings (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT bills_of_lading_media_fk FOREIGN KEY (tenant_id, document_media_id) REFERENCES warehouse_media (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE fba_deliveries (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  fba_delivery_no text NOT NULL,
  booking_id text NOT NULL,
  destination_address_id text NOT NULL,
  appointment_reference text,
  status text NOT NULL DEFAULT 'PLANNED',
  version bigint NOT NULL DEFAULT 0,
  appointment_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fba_deliveries_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT fba_deliveries_number_unique UNIQUE (tenant_id, fba_delivery_no),
  CONSTRAINT fba_deliveries_appointment_unique UNIQUE (tenant_id, appointment_reference),
  CONSTRAINT fba_deliveries_version_check CHECK (version >= 0),
  CONSTRAINT fba_deliveries_status_check CHECK (status IN ('PLANNED', 'APPOINTED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION', 'CANCELLED')),
  CONSTRAINT fba_deliveries_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fba_deliveries_booking_fk FOREIGN KEY (tenant_id, booking_id) REFERENCES linehaul_bookings (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fba_deliveries_address_fk FOREIGN KEY (tenant_id, destination_address_id) REFERENCES customer_addresses (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE delivery_tasks (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  task_no text NOT NULL,
  waybill_id text NOT NULL,
  fba_delivery_id text,
  customer_id text NOT NULL,
  destination_address_id text NOT NULL,
  assigned_device_id text,
  partner_code text,
  status text NOT NULL DEFAULT 'PENDING',
  version bigint NOT NULL DEFAULT 0,
  planned_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_tasks_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT delivery_tasks_number_unique UNIQUE (tenant_id, task_no),
  CONSTRAINT delivery_tasks_version_check CHECK (version >= 0),
  CONSTRAINT delivery_tasks_status_check CHECK (status IN ('PENDING', 'ASSIGNED', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED')),
  CONSTRAINT delivery_tasks_completion_check CHECK ((status = 'DELIVERED' AND completed_at IS NOT NULL) OR status <> 'DELIVERED'),
  CONSTRAINT delivery_tasks_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT delivery_tasks_waybill_fk FOREIGN KEY (tenant_id, waybill_id) REFERENCES waybills (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT delivery_tasks_fba_fk FOREIGN KEY (tenant_id, fba_delivery_id) REFERENCES fba_deliveries (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT delivery_tasks_customer_fk FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT delivery_tasks_address_customer_fk FOREIGN KEY (tenant_id, destination_address_id, customer_id)
    REFERENCES customer_addresses (tenant_id, id, customer_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT delivery_tasks_device_fk FOREIGN KEY (tenant_id, assigned_device_id) REFERENCES devices (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE delivery_task_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  delivery_task_id text NOT NULL,
  event_sequence bigint NOT NULL,
  event_type text NOT NULL,
  source text NOT NULL,
  source_event_id text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_task_events_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT delivery_task_events_sequence_unique UNIQUE (tenant_id, delivery_task_id, event_sequence),
  CONSTRAINT delivery_task_events_source_unique UNIQUE (tenant_id, source, source_event_id),
  CONSTRAINT delivery_task_events_sequence_check CHECK (event_sequence > 0),
  CONSTRAINT delivery_task_events_type_check CHECK (event_type IN ('INTAKE', 'DISCREPANCY', 'ASSIGNED', 'ACCEPTED', 'DEPARTED', 'ARRIVED', 'DELIVERED', 'FAILED', 'CANCELLED', 'PARTNER_REPLAY')),
  CONSTRAINT delivery_task_events_source_check CHECK (source IN ('SYSTEM', 'DEVICE', 'PARTNER', 'OPERATOR')),
  CONSTRAINT delivery_task_events_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT delivery_task_events_task_fk FOREIGN KEY (tenant_id, delivery_task_id) REFERENCES delivery_tasks (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE pod_records (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  pod_no text NOT NULL,
  delivery_task_id text NOT NULL,
  current_version bigint NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'CAPTURED',
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pod_records_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT pod_records_number_unique UNIQUE (tenant_id, pod_no),
  CONSTRAINT pod_records_task_unique UNIQUE (tenant_id, delivery_task_id),
  CONSTRAINT pod_records_version_check CHECK (current_version > 0),
  CONSTRAINT pod_records_status_check CHECK (status IN ('CAPTURED', 'AMENDED')),
  CONSTRAINT pod_records_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT pod_records_task_fk FOREIGN KEY (tenant_id, delivery_task_id) REFERENCES delivery_tasks (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE pod_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  pod_record_id text NOT NULL,
  pod_version bigint NOT NULL,
  recipient_name text NOT NULL,
  signature_media_id text,
  photo_media_id text,
  latitude_e6 integer,
  longitude_e6 integer,
  amendment_reason text,
  supersedes_version_id text,
  supersedes_pod_version bigint GENERATED ALWAYS AS (pod_version - 1) STORED,
  payload jsonb NOT NULL,
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pod_versions_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT pod_versions_number_unique UNIQUE (tenant_id, pod_record_id, pod_version),
  CONSTRAINT pod_versions_chain_target_unique UNIQUE (tenant_id, id, pod_record_id, pod_version),
  CONSTRAINT pod_versions_version_check CHECK (pod_version > 0),
  CONSTRAINT pod_versions_recipient_check CHECK (length(btrim(recipient_name)) > 0),
  CONSTRAINT pod_versions_latitude_check CHECK (latitude_e6 IS NULL OR latitude_e6 BETWEEN -90000000 AND 90000000),
  CONSTRAINT pod_versions_longitude_check CHECK (longitude_e6 IS NULL OR longitude_e6 BETWEEN -180000000 AND 180000000),
  CONSTRAINT pod_versions_amendment_check CHECK (
    (pod_version = 1 AND supersedes_version_id IS NULL AND amendment_reason IS NULL)
    OR (pod_version > 1 AND supersedes_version_id IS NOT NULL AND length(btrim(amendment_reason)) > 0)
  ),
  CONSTRAINT pod_versions_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT pod_versions_record_fk FOREIGN KEY (tenant_id, pod_record_id) REFERENCES pod_records (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT pod_versions_signature_fk FOREIGN KEY (tenant_id, signature_media_id) REFERENCES warehouse_media (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT pod_versions_photo_fk FOREIGN KEY (tenant_id, photo_media_id) REFERENCES warehouse_media (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT pod_versions_supersedes_fk FOREIGN KEY (
    tenant_id, supersedes_version_id, pod_record_id, supersedes_pod_version
  ) REFERENCES pod_versions (tenant_id, id, pod_record_id, pod_version) ON DELETE RESTRICT
);

ALTER TABLE pod_records
  ADD CONSTRAINT pod_records_current_version_fk
  FOREIGN KEY (tenant_id, id, current_version)
  REFERENCES pod_versions (tenant_id, pod_record_id, pod_version) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE device_sync_sessions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  device_id text NOT NULL,
  warehouse_id text NOT NULL,
  binding_version bigint NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  last_local_sequence bigint NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_sync_sessions_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT device_sync_sessions_scope_unique UNIQUE (tenant_id, id, device_id, warehouse_id),
  CONSTRAINT device_sync_sessions_binding_check CHECK (binding_version >= 0),
  CONSTRAINT device_sync_sessions_sequence_check CHECK (last_local_sequence >= 0),
  CONSTRAINT device_sync_sessions_status_check CHECK (status IN ('OPEN', 'CLOSED', 'EXPIRED')),
  CONSTRAINT device_sync_sessions_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT device_sync_sessions_close_check CHECK ((status = 'OPEN' AND closed_at IS NULL) OR (status <> 'OPEN' AND closed_at IS NOT NULL)),
  CONSTRAINT device_sync_sessions_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT device_sync_sessions_device_fk FOREIGN KEY (tenant_id, device_id) REFERENCES devices (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT device_sync_sessions_warehouse_fk FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE device_event_receipts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  session_id text NOT NULL,
  device_id text NOT NULL,
  warehouse_id text NOT NULL,
  event_id text NOT NULL,
  local_sequence bigint NOT NULL,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text,
  expected_version bigint,
  disposition text NOT NULL,
  server_version bigint,
  duplicate_of_id text,
  conflict_id text,
  error_envelope jsonb,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_event_receipts_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT device_event_receipts_event_unique UNIQUE (tenant_id, device_id, event_id),
  CONSTRAINT device_event_receipts_sequence_unique UNIQUE (tenant_id, session_id, local_sequence),
  CONSTRAINT device_event_receipts_sequence_check CHECK (local_sequence > 0),
  CONSTRAINT device_event_receipts_expected_version_check CHECK (expected_version IS NULL OR expected_version >= 0),
  CONSTRAINT device_event_receipts_server_version_check CHECK (server_version IS NULL OR server_version >= 0),
  CONSTRAINT device_event_receipts_disposition_check CHECK (disposition IN ('APPLIED', 'DUPLICATE', 'CONFLICT', 'REJECTED')),
  CONSTRAINT device_event_receipts_result_shape_check CHECK (
    (disposition = 'APPLIED' AND server_version IS NOT NULL AND duplicate_of_id IS NULL AND conflict_id IS NULL AND error_envelope IS NULL)
    OR (disposition = 'DUPLICATE' AND server_version IS NOT NULL AND duplicate_of_id IS NOT NULL AND conflict_id IS NULL AND error_envelope IS NULL)
    OR (disposition = 'CONFLICT' AND server_version IS NOT NULL AND duplicate_of_id IS NULL AND conflict_id IS NOT NULL AND error_envelope IS NULL)
    OR (disposition = 'REJECTED' AND server_version IS NULL AND duplicate_of_id IS NULL AND conflict_id IS NULL AND error_envelope IS NOT NULL)
  ),
  CONSTRAINT device_event_receipts_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT device_event_receipts_session_scope_fk FOREIGN KEY (tenant_id, session_id, device_id, warehouse_id) REFERENCES device_sync_sessions (tenant_id, id, device_id, warehouse_id) ON DELETE RESTRICT,
  CONSTRAINT device_event_receipts_duplicate_fk FOREIGN KEY (tenant_id, duplicate_of_id) REFERENCES device_event_receipts (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE device_event_media_claims (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  device_event_receipt_id text NOT NULL,
  media_id text NOT NULL,
  claim_key text NOT NULL,
  claim_status text NOT NULL DEFAULT 'CLAIMED',
  claimed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_event_media_claims_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT device_event_media_claims_key_unique UNIQUE (tenant_id, device_event_receipt_id, claim_key),
  CONSTRAINT device_event_media_claims_media_unique UNIQUE (tenant_id, media_id),
  CONSTRAINT device_event_media_claims_status_check CHECK (claim_status IN ('CLAIMED', 'ATTACHED', 'REJECTED')),
  CONSTRAINT device_event_media_claims_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT device_event_media_claims_receipt_fk FOREIGN KEY (tenant_id, device_event_receipt_id) REFERENCES device_event_receipts (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT device_event_media_claims_media_fk FOREIGN KEY (tenant_id, media_id) REFERENCES warehouse_media (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE device_sync_conflicts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  device_event_receipt_id text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  expected_version bigint NOT NULL,
  server_version bigint NOT NULL,
  server_snapshot jsonb NOT NULL,
  client_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  resolution text,
  resolution_payload jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_sync_conflicts_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT device_sync_conflicts_event_unique UNIQUE (tenant_id, device_event_receipt_id),
  CONSTRAINT device_sync_conflicts_version_check CHECK (expected_version >= 0 AND server_version >= 0),
  CONSTRAINT device_sync_conflicts_status_check CHECK (status IN ('OPEN', 'RESOLVED')),
  CONSTRAINT device_sync_conflicts_resolution_check CHECK (resolution IS NULL OR resolution IN ('SERVER_WINS', 'CLIENT_RETRY', 'MANUAL_MERGE')),
  CONSTRAINT device_sync_conflicts_resolution_shape_check CHECK (
    (status = 'OPEN' AND resolution IS NULL AND resolution_payload IS NULL AND resolved_at IS NULL)
    OR (status = 'RESOLVED' AND resolution IS NOT NULL AND resolved_at IS NOT NULL)
  ),
  CONSTRAINT device_sync_conflicts_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT device_sync_conflicts_event_fk FOREIGN KEY (tenant_id, device_event_receipt_id) REFERENCES device_event_receipts (tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE device_event_receipts
  ADD CONSTRAINT device_event_receipts_conflict_fk
  FOREIGN KEY (tenant_id, conflict_id) REFERENCES device_sync_conflicts (tenant_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE print_jobs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  job_no text NOT NULL,
  warehouse_id text NOT NULL,
  device_id text,
  template_code text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  version bigint NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL,
  printed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT print_jobs_identity_unique UNIQUE (tenant_id, id),
  CONSTRAINT print_jobs_number_unique UNIQUE (tenant_id, job_no),
  CONSTRAINT print_jobs_dedupe_unique UNIQUE (tenant_id, dedupe_key),
  CONSTRAINT print_jobs_version_check CHECK (version >= 0),
  CONSTRAINT print_jobs_attempts_check CHECK (attempts >= 0),
  CONSTRAINT print_jobs_status_check CHECK (status IN ('QUEUED', 'CLAIMED', 'PRINTED', 'FAILED', 'CANCELLED')),
  CONSTRAINT print_jobs_printed_check CHECK ((status = 'PRINTED' AND printed_at IS NOT NULL) OR status <> 'PRINTED'),
  CONSTRAINT print_jobs_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT print_jobs_warehouse_fk FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouses (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT print_jobs_device_fk FOREIGN KEY (tenant_id, device_id) REFERENCES devices (tenant_id, id) ON DELETE RESTRICT
);

CREATE FUNCTION guard_warehouse_receipt_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'warehouse receipt version must advance exactly once' USING ERRCODE = '40001';
  END IF;
  IF OLD.status = 'UNDONE' THEN
    RAISE EXCEPTION 'undone warehouse receipt is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.status = 'UNDONE' THEN
    IF OLD.status <> 'RECEIVED' OR statement_timestamp() > OLD.undo_until THEN
      RAISE EXCEPTION 'warehouse receipt undo is stale or invalid' USING ERRCODE = '40001';
    END IF;
  ELSIF NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'invalid warehouse receipt state transition' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER warehouse_receipts_state_guard
BEFORE UPDATE ON warehouse_receipts
FOR EACH ROW EXECUTE FUNCTION guard_warehouse_receipt_update();

CREATE FUNCTION guard_load_unit_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'DRAFT'
     OR NEW.version <> 0
     OR NEW.sealed_at IS NOT NULL
     OR NEW.dispatched_at IS NOT NULL THEN
    RAISE EXCEPTION 'load units must be inserted as DRAFT at version zero'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER load_units_insert_guard
BEFORE INSERT ON load_units
FOR EACH ROW EXECUTE FUNCTION guard_load_unit_insert();

CREATE FUNCTION guard_load_unit_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'load unit version must advance exactly once' USING ERRCODE = '40001';
  END IF;
  IF OLD.status = 'DISPATCHED' THEN
    RAISE EXCEPTION 'dispatched load unit is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'DRAFT' AND NEW.status = 'SEALED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM load_unit_items
      WHERE tenant_id = OLD.tenant_id AND load_unit_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'empty load unit cannot be sealed' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'SEALED' AND NEW.status = 'DISPATCHED' THEN
    NULL;
  ELSIF OLD.status = 'DRAFT' AND NEW.status = 'DRAFT' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'invalid load unit state transition' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER load_units_state_guard
BEFORE UPDATE ON load_units
FOR EACH ROW EXECUTE FUNCTION guard_load_unit_update();

CREATE FUNCTION guard_load_unit_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_row record;
  locked_parent_count integer := 0;
  expected_parent_count integer := 1;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.tenant_id <> OLD.tenant_id THEN
      RAISE EXCEPTION 'load item tenant cannot change' USING ERRCODE = '23514';
    END IF;
    IF NEW.load_unit_id <> OLD.load_unit_id THEN
      expected_parent_count := 2;
    END IF;
  END IF;

  FOR parent_row IN
    SELECT tenant_id, id, status
    FROM load_units
    WHERE
      (TG_OP <> 'INSERT' AND tenant_id = OLD.tenant_id AND id = OLD.load_unit_id)
      OR (TG_OP <> 'DELETE' AND tenant_id = NEW.tenant_id AND id = NEW.load_unit_id)
    ORDER BY tenant_id, id
    FOR UPDATE
  LOOP
    locked_parent_count := locked_parent_count + 1;
    IF parent_row.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'sealed or dispatched load unit items are immutable' USING ERRCODE = '55000';
    END IF;
  END LOOP;

  IF locked_parent_count <> expected_parent_count THEN
    RAISE EXCEPTION 'load unit not found' USING ERRCODE = '23503';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER load_unit_items_state_guard
BEFORE INSERT OR UPDATE OR DELETE ON load_unit_items
FOR EACH ROW EXECUTE FUNCTION guard_load_unit_item_mutation();

CREATE FUNCTION guard_package_waybill_pair()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM waybill_packages
    WHERE tenant_id = NEW.tenant_id
      AND id = NEW.package_id
      AND waybill_id = NEW.waybill_id
  ) THEN
    RAISE EXCEPTION 'package does not belong to waybill' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_balances_package_waybill_guard
BEFORE INSERT OR UPDATE OF tenant_id, waybill_id, package_id ON inventory_balances
FOR EACH ROW EXECUTE FUNCTION guard_package_waybill_pair();

CREATE TRIGGER load_unit_items_package_waybill_guard
BEFORE INSERT OR UPDATE OF tenant_id, waybill_id, package_id ON load_unit_items
FOR EACH ROW EXECUTE FUNCTION guard_package_waybill_pair();

CREATE FUNCTION guard_delivery_customer_address_pair()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM customer_addresses
    WHERE tenant_id = NEW.tenant_id
      AND id = NEW.destination_address_id
      AND customer_id = NEW.customer_id
  ) THEN
    RAISE EXCEPTION 'address does not belong to customer' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delivery_tasks_customer_address_guard
BEFORE INSERT OR UPDATE OF tenant_id, customer_id, destination_address_id ON delivery_tasks
FOR EACH ROW EXECUTE FUNCTION guard_delivery_customer_address_pair();

CREATE FUNCTION reject_immutable_fulfillment_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION apply_inventory_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_quantity bigint;
BEGIN
  UPDATE inventory_balances
  SET quantity_base = quantity_base + NEW.quantity_delta_base,
      version = version + 1,
      updated_at = now()
  WHERE tenant_id = NEW.tenant_id AND id = NEW.inventory_balance_id
  RETURNING quantity_base INTO next_quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory balance not found' USING ERRCODE = '23503';
  END IF;
  IF next_quantity < 0 THEN
    RAISE EXCEPTION 'inventory cannot go negative' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_ledger_entries_apply
BEFORE INSERT ON inventory_ledger_entries
FOR EACH ROW EXECUTE FUNCTION apply_inventory_ledger_entry();

CREATE TRIGGER inventory_ledger_entries_immutable_update
BEFORE UPDATE ON inventory_ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_immutable_fulfillment_row();

CREATE TRIGGER inventory_ledger_entries_immutable_delete
BEFORE DELETE ON inventory_ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_immutable_fulfillment_row();

CREATE FUNCTION guard_pod_record_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_version <> OLD.current_version + 1 THEN
    RAISE EXCEPTION 'POD version must advance exactly once' USING ERRCODE = '40001';
  END IF;
  IF NEW.status <> 'AMENDED' THEN
    RAISE EXCEPTION 'POD head may only transition to AMENDED' USING ERRCODE = '55000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pod_versions
    WHERE tenant_id = NEW.tenant_id
      AND pod_record_id = NEW.id
      AND pod_version = NEW.current_version
  ) THEN
    RAISE EXCEPTION 'POD amendment version must exist before head update' USING ERRCODE = '23503';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pod_records_version_guard
BEFORE UPDATE ON pod_records
FOR EACH ROW EXECUTE FUNCTION guard_pod_record_update();

CREATE TRIGGER pod_versions_immutable_update
BEFORE UPDATE ON pod_versions
FOR EACH ROW EXECUTE FUNCTION reject_immutable_fulfillment_row();

CREATE TRIGGER pod_versions_immutable_delete
BEFORE DELETE ON pod_versions
FOR EACH ROW EXECUTE FUNCTION reject_immutable_fulfillment_row();

CREATE FUNCTION guard_device_event_session()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  session_status text;
  session_expires_at timestamptz;
  session_last_local_sequence bigint;
BEGIN
  SELECT status, expires_at, last_local_sequence
  INTO session_status, session_expires_at, session_last_local_sequence
  FROM device_sync_sessions
  WHERE tenant_id = NEW.tenant_id
    AND id = NEW.session_id
    AND device_id = NEW.device_id
    AND warehouse_id = NEW.warehouse_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'device sync session is absent' USING ERRCODE = '28000';
  END IF;
  IF NEW.local_sequence > session_last_local_sequence + 1 THEN
    RAISE EXCEPTION 'device events must use the next ordered local sequence' USING ERRCODE = '40001';
  END IF;
  IF NEW.local_sequence <= session_last_local_sequence THEN
    -- A replay is allowed to reach the tenant/device/event unique constraint so
    -- INSERT ... ON CONFLICT can return the original durable receipt.
    RETURN NEW;
  END IF;
  IF (session_status <> 'OPEN' OR session_expires_at <= statement_timestamp())
     AND NEW.disposition <> 'REJECTED' THEN
    RAISE EXCEPTION 'closed or expired session events must be rejected' USING ERRCODE = '28000';
  END IF;
  UPDATE device_sync_sessions
  SET last_local_sequence = NEW.local_sequence
  WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER device_event_receipts_session_guard
BEFORE INSERT ON device_event_receipts
FOR EACH ROW EXECUTE FUNCTION guard_device_event_session();

CREATE INDEX warehouse_scans_cursor_idx ON warehouse_scans (tenant_id, created_at, id);
CREATE INDEX warehouse_receipts_cursor_idx ON warehouse_receipts (tenant_id, created_at, id);
CREATE INDEX warehouse_measurements_cursor_idx ON warehouse_measurements (tenant_id, created_at, id);
CREATE INDEX warehouse_media_cursor_idx ON warehouse_media (tenant_id, created_at, id);
CREATE INDEX inventory_balances_cursor_idx ON inventory_balances (tenant_id, created_at, id);
CREATE INDEX inventory_ledger_entries_cursor_idx ON inventory_ledger_entries (tenant_id, created_at, id);
CREATE INDEX route_decisions_cursor_idx ON route_decisions (tenant_id, created_at, id);
CREATE INDEX load_units_cursor_idx ON load_units (tenant_id, created_at, id);
CREATE INDEX load_unit_items_cursor_idx ON load_unit_items (tenant_id, created_at, id);
CREATE INDEX linehaul_bookings_cursor_idx ON linehaul_bookings (tenant_id, created_at, id);
CREATE INDEX bills_of_lading_cursor_idx ON bills_of_lading (tenant_id, created_at, id);
CREATE INDEX fba_deliveries_cursor_idx ON fba_deliveries (tenant_id, created_at, id);
CREATE INDEX delivery_tasks_cursor_idx ON delivery_tasks (tenant_id, created_at, id);
CREATE INDEX delivery_task_events_cursor_idx ON delivery_task_events (tenant_id, created_at, id);
CREATE INDEX pod_records_cursor_idx ON pod_records (tenant_id, created_at, id);
CREATE INDEX pod_versions_cursor_idx ON pod_versions (tenant_id, created_at, id);
CREATE INDEX device_sync_sessions_cursor_idx ON device_sync_sessions (tenant_id, created_at, id);
CREATE INDEX device_event_receipts_cursor_idx ON device_event_receipts (tenant_id, created_at, id);
CREATE INDEX device_event_media_claims_cursor_idx ON device_event_media_claims (tenant_id, created_at, id);
CREATE INDEX device_sync_conflicts_cursor_idx ON device_sync_conflicts (tenant_id, created_at, id);
CREATE INDEX print_jobs_cursor_idx ON print_jobs (tenant_id, created_at, id);

ALTER TABLE warehouse_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_scans FORCE ROW LEVEL SECURITY;
CREATE POLICY warehouse_scans_tenant_isolation ON warehouse_scans FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE warehouse_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY warehouse_receipts_tenant_isolation ON warehouse_receipts FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE warehouse_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_measurements FORCE ROW LEVEL SECURITY;
CREATE POLICY warehouse_measurements_tenant_isolation ON warehouse_measurements FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE warehouse_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_media FORCE ROW LEVEL SECURITY;
CREATE POLICY warehouse_media_tenant_isolation ON warehouse_media FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_balances_tenant_isolation ON inventory_balances FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE inventory_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_ledger_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY inventory_ledger_entries_tenant_isolation ON inventory_ledger_entries FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE route_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY route_decisions_tenant_isolation ON route_decisions FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE load_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE load_units FORCE ROW LEVEL SECURITY;
CREATE POLICY load_units_tenant_isolation ON load_units FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE load_unit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE load_unit_items FORCE ROW LEVEL SECURITY;
CREATE POLICY load_unit_items_tenant_isolation ON load_unit_items FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE linehaul_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE linehaul_bookings FORCE ROW LEVEL SECURITY;
CREATE POLICY linehaul_bookings_tenant_isolation ON linehaul_bookings FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE bills_of_lading ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills_of_lading FORCE ROW LEVEL SECURITY;
CREATE POLICY bills_of_lading_tenant_isolation ON bills_of_lading FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE fba_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE fba_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY fba_deliveries_tenant_isolation ON fba_deliveries FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE delivery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY delivery_tasks_tenant_isolation ON delivery_tasks FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE delivery_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_task_events FORCE ROW LEVEL SECURITY;
CREATE POLICY delivery_task_events_tenant_isolation ON delivery_task_events FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE pod_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_records FORCE ROW LEVEL SECURITY;
CREATE POLICY pod_records_tenant_isolation ON pod_records FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE pod_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY pod_versions_tenant_isolation ON pod_versions FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE device_sync_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_sync_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY device_sync_sessions_tenant_isolation ON device_sync_sessions FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE device_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_event_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY device_event_receipts_tenant_isolation ON device_event_receipts FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE device_event_media_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_event_media_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY device_event_media_claims_tenant_isolation ON device_event_media_claims FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE device_sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_sync_conflicts FORCE ROW LEVEL SECURITY;
CREATE POLICY device_sync_conflicts_tenant_isolation ON device_sync_conflicts FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY print_jobs_tenant_isolation ON print_jobs FOR ALL TO zhili_app USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  warehouse_scans,
  warehouse_receipts,
  warehouse_measurements,
  warehouse_media,
  inventory_balances,
  inventory_ledger_entries,
  route_decisions,
  load_units,
  load_unit_items,
  linehaul_bookings,
  bills_of_lading,
  fba_deliveries,
  delivery_tasks,
  delivery_task_events,
  pod_records,
  pod_versions,
  device_sync_sessions,
  device_event_receipts,
  device_event_media_claims,
  device_sync_conflicts,
  print_jobs
TO zhili_app;
