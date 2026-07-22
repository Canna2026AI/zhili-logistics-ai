-- Reverse only the B1 domain migration. Foundation tables, functions, roles, policies, and the
-- Drizzle journal remain intact; the runner removes the 0001 journal row after this succeeds.

DROP TABLE IF EXISTS
  print_jobs,
  device_sync_conflicts,
  device_event_media_claims,
  device_event_receipts,
  device_sync_sessions,
  pod_versions,
  pod_records,
  delivery_task_events,
  delivery_tasks,
  fba_deliveries,
  bills_of_lading,
  linehaul_bookings,
  load_unit_items,
  load_units,
  route_decisions,
  inventory_ledger_entries,
  inventory_balances,
  warehouse_media,
  warehouse_measurements,
  warehouse_receipts,
  warehouse_scans,
  attachments,
  import_rows,
  import_jobs,
  declaration_items,
  customs_declarations,
  waybill_packages,
  waybills,
  order_batch_items,
  order_batch_jobs,
  orders,
  quote_acceptances,
  quote_explanations,
  quote_charge_lines,
  quote_options,
  quote_parcels,
  quote_versions,
  quotes,
  rate_rules,
  rate_card_versions,
  rate_cards,
  shipping_channels,
  permission_simulations,
  customer_credit_policies,
  reference_data_items,
  reference_data_versions,
  reference_data_sets,
  partners,
  oauth_identities,
  impersonation_sessions,
  tenant_entitlements,
  device_tasks,
  device_bindings,
  devices,
  oauth_states,
  refresh_tokens,
  refresh_token_families,
  sessions,
  user_role_assignments,
  role_grant_field_policies,
  role_grant_warehouse_scopes,
  role_grant_customer_scopes,
  role_grant_organization_scopes,
  role_grants,
  roles,
  permission_actions,
  customer_addresses,
  customers,
  users,
  warehouses,
  organizations,
  tenants;

DROP FUNCTION IF EXISTS control_plane_set_entitlement(
  text, text, text, text, text, integer, text, bigint,
  timestamptz, timestamptz, bigint, text, text, text
);
DROP FUNCTION IF EXISTS control_plane_set_tenant_status(
  text, text, text, bigint, text, text, text, text
);
DROP FUNCTION IF EXISTS control_plane_create_tenant(
  text, text, text, text, text, text, text, text
);
DROP FUNCTION IF EXISTS auth_lookup_password(text, text);
DROP FUNCTION IF EXISTS guard_device_sync_conflict_resolution();
DROP FUNCTION IF EXISTS guard_reference_data_set_head();
DROP FUNCTION IF EXISTS guard_reference_data_item_mutation();
DROP FUNCTION IF EXISTS guard_reference_data_version_update();
DROP FUNCTION IF EXISTS reject_identity_history_mutation();
DROP FUNCTION IF EXISTS reject_rate_rule_semantic_priority_tie();
DROP FUNCTION IF EXISTS validate_import_rollback_job();
DROP FUNCTION IF EXISTS prevent_quote_snapshot_mutation();
DROP FUNCTION IF EXISTS validate_quote_acceptance();
DROP FUNCTION IF EXISTS prevent_accepted_quote_mutation();
DROP FUNCTION IF EXISTS guard_warehouse_receipt_update();
DROP FUNCTION IF EXISTS guard_load_unit_insert();
DROP FUNCTION IF EXISTS guard_load_unit_update();
DROP FUNCTION IF EXISTS guard_load_unit_item_mutation();
DROP FUNCTION IF EXISTS guard_package_waybill_pair();
DROP FUNCTION IF EXISTS guard_delivery_customer_address_pair();
DROP FUNCTION IF EXISTS reject_immutable_fulfillment_row();
DROP FUNCTION IF EXISTS apply_inventory_ledger_entry();
DROP FUNCTION IF EXISTS guard_pod_record_update();
DROP FUNCTION IF EXISTS guard_device_event_session();

DO $roles$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zhili_control_plane') THEN
    DROP OWNED BY zhili_control_plane;
    DROP ROLE zhili_control_plane;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zhili_auth') THEN
    DROP OWNED BY zhili_auth;
    DROP ROLE zhili_auth;
  END IF;
END
$roles$;

DROP EXTENSION IF EXISTS btree_gist RESTRICT;
