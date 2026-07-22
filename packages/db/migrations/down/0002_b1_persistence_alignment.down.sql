-- Reverse only the B1 persistence-alignment migration. Foundation and 0001 domain objects remain.
-- The migration is intentionally explicit: no schema-, role-, extension-, or unrelated-table drops.

-- Runtime roles never belong to a capability owner. The retained offline deploy ADMIN membership
-- lets the same non-superuser schema owner return the named functions to the table owner so that
-- down/up remains repeatable without granting runtime identities direct table access.
DO $$
DECLARE
  deploy_is_superuser boolean;
  routine_signature text;
  schema_owner text;
BEGIN
  SELECT role_row.rolsuper INTO deploy_is_superuser
  FROM pg_catalog.pg_roles role_row WHERE role_row.rolname = current_user;
  SELECT owner_role.rolname
  INTO schema_owner
  FROM pg_catalog.pg_class table_row
  JOIN pg_catalog.pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
  JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = table_row.relowner
  WHERE namespace_row.nspname = 'public' AND table_row.relname = 'tenants';
  IF NOT deploy_is_superuser THEN
    IF schema_owner <> current_user THEN
      RAISE EXCEPTION 'non-superuser down must run as the schema owner'
        USING ERRCODE = '42501';
    END IF;
    EXECUTE pg_catalog.format(
      'GRANT zhili_auth_capability_owner TO %I WITH SET TRUE, INHERIT TRUE',
      current_user
    );
    EXECUTE pg_catalog.format(
      'GRANT zhili_control_capability_owner TO %I WITH SET TRUE, INHERIT TRUE',
      current_user
    );
  END IF;
  FOREACH routine_signature IN ARRAY ARRAY[
    'public.auth_lookup_password(text,text)',
    'public.auth_lookup_refresh_token(text)',
    'public.auth_consume_login_throttle(text,text,text,boolean,timestamptz)',
    'public.auth_resolve_tenant(text)',
    'public.auth_lookup_oauth_state(text)',
    'public.control_plane_create_tenant_legacy(text,text,text,text,text,text,text,text)',
    'public.control_plane_create_tenant(text,text,text,text,text,text,text,text,text,text)',
    'public.control_plane_set_tenant_status_legacy(text,text,text,bigint,text,text,text,text)',
    'public.control_plane_set_tenant_status(text,text,text,bigint,text,text,text,text)',
    'public.control_plane_set_entitlement(text,text,text,text,text,integer,text,bigint,timestamptz,timestamptz,bigint,text,text,text)',
    'public.control_plane_replace_entitlements(text,text,text,bigint,jsonb,text,text,text)',
    'public.control_plane_start_impersonation(text,text,text,text,text,integer,text,text,text)',
    'public.control_plane_end_impersonation(text,text,text,text,text,text)'
  ]
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER FUNCTION %s OWNER TO %I', routine_signature, schema_owner
    );
  END LOOP;
  IF NOT deploy_is_superuser THEN
    EXECUTE pg_catalog.format(
      'GRANT zhili_auth_capability_owner TO %I WITH SET TRUE, INHERIT FALSE',
      current_user
    );
    EXECUTE pg_catalog.format(
      'GRANT zhili_control_capability_owner TO %I WITH SET TRUE, INHERIT FALSE',
      current_user
    );
  END IF;
END
$$;

DROP POLICY capability_auth_tenants_select ON public.tenants;
DROP POLICY capability_auth_users_select ON public.users;
DROP POLICY capability_auth_refresh_tokens_select ON public.refresh_tokens;
DROP POLICY capability_auth_refresh_families_select ON public.refresh_token_families;
DROP POLICY capability_auth_oauth_states_select ON public.oauth_states;
DROP POLICY capability_control_tenants_select ON public.tenants;
DROP POLICY capability_control_tenants_insert ON public.tenants;
DROP POLICY capability_control_tenants_update ON public.tenants;
DROP POLICY capability_control_users_select ON public.users;
DROP POLICY capability_control_assignments_select ON public.user_role_assignments;
DROP POLICY capability_control_roles_select ON public.roles;
DROP POLICY capability_control_role_grants_select ON public.role_grants;
DROP POLICY capability_control_idempotency_select ON public.idempotency_records;
DROP POLICY capability_control_idempotency_insert ON public.idempotency_records;
DROP POLICY capability_control_idempotency_update ON public.idempotency_records;
DROP POLICY capability_control_entitlements_select ON public.tenant_entitlements;
DROP POLICY capability_control_entitlements_insert ON public.tenant_entitlements;
DROP POLICY capability_control_entitlements_update ON public.tenant_entitlements;
DROP POLICY capability_control_impersonation_select ON public.impersonation_sessions;
DROP POLICY capability_control_impersonation_insert ON public.impersonation_sessions;
DROP POLICY capability_control_impersonation_update ON public.impersonation_sessions;
DROP POLICY capability_control_audit_insert ON public.audit_events;
DROP POLICY capability_control_outbox_insert ON public.outbox_events;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM
  zhili_auth_capability_owner, zhili_control_capability_owner;
REVOKE USAGE ON SCHEMA public FROM
  zhili_auth_capability_owner, zhili_control_capability_owner;

DROP FUNCTION IF EXISTS public.control_plane_end_impersonation(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.control_plane_start_impersonation(
  text, text, text, text, text, integer, text, text, text
);
DROP FUNCTION IF EXISTS public.control_plane_set_tenant_status(
  text, text, text, bigint, text, text, text, text
);
ALTER FUNCTION public.control_plane_set_tenant_status_legacy(
  text, text, text, bigint, text, text, text, text
) RENAME TO control_plane_set_tenant_status;
GRANT EXECUTE ON FUNCTION public.control_plane_set_tenant_status(
  text, text, text, bigint, text, text, text, text
) TO zhili_control_plane;
ALTER FUNCTION public.control_plane_set_tenant_status(
  text, text, text, bigint, text, text, text, text
) SET search_path = pg_catalog, public;

DROP FUNCTION IF EXISTS public.control_plane_create_tenant(
  text, text, text, text, text, text, text, text, text, text
);
ALTER FUNCTION public.control_plane_create_tenant_legacy(
  text, text, text, text, text, text, text, text
) RENAME TO control_plane_create_tenant;
GRANT EXECUTE ON FUNCTION public.control_plane_create_tenant(
  text, text, text, text, text, text, text, text
) TO zhili_control_plane;
ALTER FUNCTION public.control_plane_create_tenant(
  text, text, text, text, text, text, text, text
) SET search_path = pg_catalog, public;
ALTER FUNCTION public.control_plane_set_entitlement(
  text, text, text, text, text, integer, text, bigint,
  timestamptz, timestamptz, bigint, text, text, text
) SET search_path = pg_catalog, public;
DROP FUNCTION IF EXISTS public.auth_lookup_oauth_state(text);
DROP FUNCTION IF EXISTS public.auth_resolve_tenant(text);

-- platform.impersonate is 0002 seed data; remove dependent 0002 grants before the action row.
DELETE FROM role_grants WHERE action_code = 'platform.impersonate';
DELETE FROM permission_actions WHERE action_code = 'platform.impersonate';

DROP FUNCTION IF EXISTS public.control_plane_replace_entitlements(
  text, text, text, bigint, jsonb, text, text, text
);
DROP FUNCTION IF EXISTS public.auth_consume_login_throttle(text, text, text, boolean, timestamptz);
DROP FUNCTION IF EXISTS public.auth_lookup_refresh_token(text);

CREATE OR REPLACE FUNCTION public.auth_lookup_password(p_account text, p_tenant_hint text)
RETURNS TABLE (tenant_id text, user_id text, password_hash text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH normalized_input AS (
    SELECT
      lower(btrim(p_account)) AS account,
      nullif(lower(btrim(p_tenant_hint)), '') AS tenant_hint
  ),
  candidates AS MATERIALIZED (
    SELECT user_row.tenant_id, user_row.id AS user_id, user_row.password_hash
    FROM public.users user_row
    JOIN public.tenants tenant_row ON tenant_row.id = user_row.tenant_id
    CROSS JOIN normalized_input input_row
    WHERE user_row.login_name_normalized = input_row.account
      AND (input_row.tenant_hint IS NULL OR tenant_row.slug = input_row.tenant_hint)
      AND tenant_row.status = 'ACTIVE'
      AND user_row.status = 'ACTIVE'
      AND user_row.password_hash IS NOT NULL
    ORDER BY user_row.tenant_id, user_row.id
    LIMIT 2
  ),
  candidate_rollup AS (
    SELECT
      count(*) AS candidate_count,
      min(candidates.tenant_id) AS tenant_id,
      min(candidates.user_id) AS user_id,
      min(candidates.password_hash) AS password_hash
    FROM candidates
  )
  SELECT
    CASE WHEN candidate_rollup.candidate_count = 1
      THEN candidate_rollup.tenant_id ELSE '01J0000000000000000000000A' END,
    CASE WHEN candidate_rollup.candidate_count = 1
      THEN candidate_rollup.user_id ELSE '01J0000000000000000000000B' END,
    CASE WHEN candidate_rollup.candidate_count = 1
      THEN candidate_rollup.password_hash
      ELSE '$argon2id$v=19$m=65536,t=3,p=1$emhpbGktYXV0aC1kdW1teQ$YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk'
    END
  FROM candidate_rollup
$$;
COMMENT ON FUNCTION public.auth_lookup_password(text, text) IS
  'Always returns one verifier row. The auth service must perform one Argon2id verify and return the same rate-limited generic failure for every mismatch.';
REVOKE ALL ON FUNCTION public.auth_lookup_password(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_lookup_password(text, text) TO zhili_auth;

-- Remove the only outward foreign key from a pre-0002 table before dropping the new relations.
ALTER TABLE device_event_media_claims
  DROP CONSTRAINT device_event_media_claims_reservation_fk;

DROP TABLE IF EXISTS
  partner_event_replay_attempts,
  partner_event_receipts,
  last_mile_charge_generation_tasks,
  last_mile_charge_generations,
  last_mile_intake_expected_waybills,
  last_mile_intake_scans,
  fba_shipment_cartons,
  warehouse_stocktake_items,
  warehouse_location_inventory_ledger,
  pod_version_media,
  declaration_attachments,
  delivery_task_waybills,
  bill_of_lading_waybills,
  load_unit_waybills,
  accepted_quote_order_links,
  waybill_number_history,
  waybill_lineage,
  label_jobs,
  order_package_snapshots,
  fba_shipment_links,
  last_mile_intakes,
  warehouse_stocktakes,
  warehouse_location_inventory,
  device_media_reservations,
  transaction_command_contexts,
  shipment_restriction_rules,
  reauthentication_grants,
  user_organization_memberships,
  partner_contacts,
  login_throttle_buckets;

-- Remove 0002-only indexes and constraints that are not owned by an added column.
DROP INDEX IF EXISTS delivery_tasks_immutable_list_idx;
DROP INDEX IF EXISTS device_sync_sessions_one_open_device_idx;
DROP INDEX IF EXISTS load_units_immutable_list_idx;
DROP INDEX IF EXISTS warehouse_receipts_immutable_list_idx;
DROP INDEX IF EXISTS warehouse_receipts_filter_list_idx;

ALTER TABLE idempotency_records
  DROP CONSTRAINT idempotency_records_tenant_id_unique;
ALTER TABLE quote_acceptances
  DROP CONSTRAINT quote_acceptances_ownership_unique;
ALTER TABLE pod_versions
  DROP CONSTRAINT pod_versions_device_event_unique;
ALTER TABLE warehouse_measurements
  DROP CONSTRAINT warehouse_measurements_device_event_unique;

ALTER TABLE customer_addresses
  DROP CONSTRAINT customer_addresses_label_check,
  DROP CONSTRAINT customer_addresses_code_check,
  DROP CONSTRAINT customer_addresses_type_check,
  DROP CONSTRAINT customer_addresses_contact_check;
ALTER TABLE customers DROP CONSTRAINT customers_settlement_currency_check;
ALTER TABLE organizations DROP CONSTRAINT organizations_type_check;
ALTER TABLE tenants
  DROP CONSTRAINT tenants_timezone_check,
  DROP CONSTRAINT tenants_currency_check,
  DROP CONSTRAINT tenants_reserved_sentinel_check;
ALTER TABLE users DROP CONSTRAINT users_mobile_check;
ALTER TABLE customer_credit_policies
  DROP CONSTRAINT customer_credit_policies_contract_shape_check,
  DROP CONSTRAINT customer_credit_policies_aggregate_version_check,
  DROP CONSTRAINT customer_credit_policies_timestamps_check,
  DROP CONSTRAINT customer_credit_policies_money_check,
  DROP CONSTRAINT customer_credit_policies_cycle_check,
  DROP CONSTRAINT customer_credit_policies_hold_check;
ALTER TABLE partners DROP CONSTRAINT partners_contact_check;
ALTER TABLE reference_data_versions
  DROP CONSTRAINT reference_data_versions_publication_metadata_check;
ALTER TABLE tenant_entitlements
  DROP CONSTRAINT tenant_entitlements_actor_creator_fk,
  DROP CONSTRAINT tenant_entitlements_aggregate_version_check,
  DROP CONSTRAINT tenant_entitlements_replacement_version_check,
  DROP CONSTRAINT tenant_entitlements_quota_map_check,
  DROP CONSTRAINT tenant_entitlements_creator_shape_check,
  DROP CONSTRAINT tenant_entitlements_actor_tenant_id_ulid_check,
  DROP CONSTRAINT tenant_entitlements_module_check;
ALTER TABLE customs_declarations
  DROP CONSTRAINT customs_declarations_insurance_check,
  DROP CONSTRAINT customs_declarations_number_check,
  DROP CONSTRAINT customs_declarations_incoterm_check;
ALTER TABLE declaration_items
  DROP CONSTRAINT declaration_items_hs_code_check,
  DROP CONSTRAINT declaration_items_origin_check,
  DROP CONSTRAINT declaration_items_weight_check;
ALTER TABLE import_jobs
  DROP CONSTRAINT import_jobs_atomicity_check,
  DROP CONSTRAINT import_jobs_versions_check,
  DROP CONSTRAINT import_jobs_type_check,
  DROP CONSTRAINT import_jobs_source_check;
ALTER TABLE orders DROP CONSTRAINT orders_type_check;
ALTER TABLE rate_rules
  DROP CONSTRAINT rate_rules_semantic_metadata_check,
  DROP CONSTRAINT rate_rules_method_check,
  DROP CONSTRAINT rate_rules_money_check,
  DROP CONSTRAINT rate_rules_measurement_check,
  DROP CONSTRAINT rate_rules_state_check;
ALTER TABLE shipping_channels
  DROP CONSTRAINT shipping_channels_transport_mode_check,
  DROP CONSTRAINT shipping_channels_state_check;
ALTER TABLE bills_of_lading
  DROP CONSTRAINT bills_of_lading_parent_fk,
  DROP CONSTRAINT bills_of_lading_type_check,
  DROP CONSTRAINT bills_of_lading_parent_check,
  DROP CONSTRAINT bills_of_lading_status_check;
ALTER TABLE delivery_task_events DROP CONSTRAINT delivery_task_events_type_check;
ALTER TABLE delivery_tasks
  DROP CONSTRAINT delivery_tasks_executor_check,
  DROP CONSTRAINT delivery_tasks_window_check;
ALTER TABLE device_event_media_claims DROP CONSTRAINT device_event_media_claims_owner_check;
ALTER TABLE device_event_receipts
  DROP CONSTRAINT device_event_receipts_subject_fk,
  DROP CONSTRAINT device_event_receipts_claims_check,
  DROP CONSTRAINT device_event_receipts_server_version_check;
ALTER TABLE device_sync_conflicts
  DROP CONSTRAINT device_sync_conflicts_resolver_fk,
  DROP CONSTRAINT device_sync_conflicts_resolution_shape_check;
ALTER TABLE device_sync_sessions
  DROP CONSTRAINT device_sync_sessions_subject_fk,
  DROP CONSTRAINT device_sync_sessions_binding_check;
ALTER TABLE linehaul_bookings
  DROP CONSTRAINT linehaul_bookings_carrier_fk,
  DROP CONSTRAINT linehaul_bookings_contract_fields_check;
ALTER TABLE load_units
  DROP CONSTRAINT load_units_type_check,
  DROP CONSTRAINT load_units_distinct_warehouses_check;
ALTER TABLE warehouse_measurements DROP CONSTRAINT warehouse_measurements_event_time_check;
ALTER TABLE warehouse_receipts DROP CONSTRAINT warehouse_receipts_customer_fk;
ALTER TABLE permission_simulations
  DROP CONSTRAINT permission_simulations_expiry_check,
  ADD CONSTRAINT permission_simulations_expiry_check CHECK (
    expires_at >= created_at + interval '5 minutes'
    AND expires_at <= created_at + interval '60 minutes'
  );

-- Remove all typed fields introduced by 0002.
ALTER TABLE customer_addresses DROP COLUMN address_label, DROP COLUMN is_default;
ALTER TABLE customers DROP COLUMN settlement_currency;
ALTER TABLE tenants DROP COLUMN default_timezone, DROP COLUMN default_currency;
ALTER TABLE users DROP COLUMN mobile;
ALTER TABLE customer_credit_policies
  DROP COLUMN credit_limit_amount,
  DROP COLUMN credit_tier,
  DROP COLUMN payment_cycle_days,
  DROP COLUMN hold_on_exceed,
  DROP COLUMN change_reason,
  DROP COLUMN version,
  DROP COLUMN updated_at;
ALTER TABLE partners DROP COLUMN contact_name, DROP COLUMN contact_phone;
ALTER TABLE reference_data_versions DROP COLUMN version_label, DROP COLUMN publish_reason;
ALTER TABLE tenant_entitlements
  DROP COLUMN quota_map,
  DROP COLUMN is_enabled,
  DROP COLUMN replacement_version,
  DROP COLUMN version,
  DROP COLUMN created_by_actor_tenant_id,
  DROP COLUMN created_by_actor_subject_id;
ALTER TABLE customs_declarations
  DROP COLUMN insured,
  DROP COLUMN insured_value_amount,
  DROP COLUMN insured_value_minor,
  DROP COLUMN insured_currency;
ALTER TABLE import_jobs
  DROP COLUMN source_file_ref,
  DROP COLUMN source_metadata,
  DROP COLUMN atomicity,
  DROP COLUMN mapping_version,
  DROP COLUMN validation_version;
ALTER TABLE orders DROP COLUMN order_type;
ALTER TABLE rate_rules
  DROP COLUMN rule_code,
  DROP COLUMN charge_code,
  DROP COLUMN price_type,
  DROP COLUMN zone_code,
  DROP COLUMN rounding_mode,
  DROP COLUMN minimum_charge_minor,
  DROP COLUMN effective_from,
  DROP COLUMN effective_until;
ALTER TABLE shipping_channels DROP COLUMN transport_mode;
ALTER TABLE bills_of_lading DROP COLUMN bill_type, DROP COLUMN parent_bill_of_lading_id;
ALTER TABLE delivery_task_events DROP COLUMN device_event_id;
ALTER TABLE delivery_tasks
  DROP COLUMN station_id,
  DROP COLUMN executor_type,
  DROP COLUMN executor_id,
  DROP COLUMN planned_start_at,
  DROP COLUMN planned_end_at;
ALTER TABLE device_event_media_claims DROP COLUMN media_reservation_id;
ALTER TABLE device_event_receipts DROP COLUMN subject_id, DROP COLUMN claimed_media_refs;
ALTER TABLE device_sync_conflicts
  DROP COLUMN resolved_by_subject_id,
  DROP COLUMN resolution_reason;
ALTER TABLE device_sync_sessions DROP COLUMN subject_id;
ALTER TABLE linehaul_bookings
  DROP COLUMN carrier_id,
  DROP COLUMN origin_port,
  DROP COLUMN destination_port,
  DROP COLUMN planned_departure_at,
  DROP COLUMN station_code;
ALTER TABLE load_units DROP COLUMN load_unit_type, DROP COLUMN seal_no, DROP COLUMN station_code;
ALTER TABLE pod_versions DROP COLUMN device_event_id;
ALTER TABLE warehouse_measurements DROP COLUMN device_event_id, DROP COLUMN measured_at;
ALTER TABLE warehouse_receipts DROP COLUMN customer_id, DROP COLUMN station_code;

-- Restore the exact 0001 nullability and validation contract.
ALTER TABLE customer_addresses
  ALTER COLUMN address_code SET NOT NULL,
  ALTER COLUMN address_type SET NOT NULL,
  ALTER COLUMN contact_name SET NOT NULL,
  ADD CONSTRAINT customer_addresses_code_check
    CHECK (length(btrim(address_code)) BETWEEN 1 AND 64),
  ADD CONSTRAINT customer_addresses_type_check
    CHECK (address_type IN ('BILLING', 'PICKUP', 'DELIVERY', 'RETURN')),
  ADD CONSTRAINT customer_addresses_contact_check
    CHECK (length(btrim(contact_name)) BETWEEN 1 AND 160);
ALTER TABLE organizations ADD CONSTRAINT organizations_type_check
  CHECK (organization_type IN ('TENANT_ROOT', 'BUSINESS_UNIT', 'BRANCH', 'PARTNER'));
ALTER TABLE customer_credit_policies
  ALTER COLUMN credit_limit_minor SET NOT NULL,
  ALTER COLUMN payment_cycle SET NOT NULL,
  ALTER COLUMN hold_policy SET NOT NULL,
  ADD CONSTRAINT customer_credit_policies_money_check
    CHECK (currency ~ '^[A-Z]{3}$' AND credit_limit_minor >= 0),
  ADD CONSTRAINT customer_credit_policies_cycle_check
    CHECK (payment_cycle IN ('PREPAID', 'WEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'NET_30', 'NET_60')),
  ADD CONSTRAINT customer_credit_policies_hold_check
    CHECK (hold_policy IN ('AUTO_HOLD', 'REVIEW', 'ALLOW'));
ALTER TABLE tenant_entitlements ADD CONSTRAINT tenant_entitlements_module_check
  CHECK (module_code ~ '^[A-Z][A-Z0-9_]{1,63}$');
ALTER TABLE tenant_entitlements ALTER COLUMN created_by_user_id SET NOT NULL;
ALTER TABLE customs_declarations
  ALTER COLUMN declaration_number SET NOT NULL,
  ALTER COLUMN incoterm SET NOT NULL,
  ADD CONSTRAINT customs_declarations_number_check
    CHECK (length(btrim(declaration_number)) BETWEEN 1 AND 100),
  ADD CONSTRAINT customs_declarations_incoterm_check CHECK (incoterm ~ '^[A-Z]{3}$');
ALTER TABLE declaration_items
  ALTER COLUMN hs_code SET NOT NULL,
  ALTER COLUMN origin_country_code SET NOT NULL,
  ALTER COLUMN net_weight_grams SET NOT NULL,
  ADD CONSTRAINT declaration_items_hs_code_check CHECK (hs_code ~ '^[0-9]{6,12}$'),
  ADD CONSTRAINT declaration_items_origin_check CHECK (origin_country_code ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT declaration_items_weight_check CHECK (net_weight_grams > 0);
ALTER TABLE import_jobs
  ALTER COLUMN source_object_key SET NOT NULL,
  ALTER COLUMN source_sha256 SET NOT NULL,
  ALTER COLUMN idempotency_key SET NOT NULL,
  ADD CONSTRAINT import_jobs_type_check CHECK (import_type IN ('ORDERS', 'WAYBILLS')),
  ADD CONSTRAINT import_jobs_source_check CHECK (
    length(btrim(source_object_key)) >= 1 AND source_sha256 ~ '^[0-9a-f]{64}$'
  );
ALTER TABLE orders ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE quotes ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE waybills ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE rate_rules
  ADD CONSTRAINT rate_rules_method_check
    CHECK (calculation_method IN ('FLAT', 'PER_KG', 'PERCENT', 'MINIMUM')),
  ADD CONSTRAINT rate_rules_money_check CHECK (
    (calculation_method IN ('FLAT', 'PER_KG', 'MINIMUM')
      AND amount_minor IS NOT NULL AND amount_minor >= 0
      AND currency ~ '^[A-Z]{3}$' AND percentage_bps IS NULL)
    OR
    (calculation_method = 'PERCENT' AND amount_minor IS NULL AND currency IS NULL
      AND percentage_bps BETWEEN -10000 AND 100000)
  ),
  ADD CONSTRAINT rate_rules_measurement_check CHECK (
    (dimensional_divisor IS NULL OR dimensional_divisor > 0)
    AND (rounding_step_grams IS NULL OR rounding_step_grams > 0)
  ),
  ADD CONSTRAINT rate_rules_state_check CHECK (state IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE shipping_channels ADD CONSTRAINT shipping_channels_state_check
  CHECK (state IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE bills_of_lading ADD CONSTRAINT bills_of_lading_status_check
  CHECK (status IN ('DRAFT', 'ISSUED', 'VOID'));
ALTER TABLE delivery_task_events ADD CONSTRAINT delivery_task_events_type_check CHECK (
  event_type IN (
    'INTAKE', 'DISCREPANCY', 'ASSIGNED', 'ACCEPTED', 'DEPARTED', 'ARRIVED',
    'DELIVERED', 'FAILED', 'CANCELLED', 'PARTNER_REPLAY'
  )
);
ALTER TABLE delivery_tasks
  ALTER COLUMN waybill_id SET NOT NULL,
  ALTER COLUMN customer_id SET NOT NULL,
  ALTER COLUMN destination_address_id SET NOT NULL;
ALTER TABLE device_event_media_claims ALTER COLUMN media_id SET NOT NULL;
ALTER TABLE device_event_receipts ADD CONSTRAINT device_event_receipts_server_version_check
  CHECK (server_version IS NULL OR server_version >= 0);
ALTER TABLE device_sync_conflicts ADD CONSTRAINT device_sync_conflicts_resolution_shape_check CHECK (
  (status = 'OPEN' AND resolution IS NULL AND resolution_payload IS NULL AND resolved_at IS NULL)
  OR (status = 'RESOLVED' AND resolution IS NOT NULL AND resolved_at IS NOT NULL)
);
ALTER TABLE device_sync_sessions ADD CONSTRAINT device_sync_sessions_binding_check
  CHECK (binding_version >= 0);
ALTER TABLE linehaul_bookings ALTER COLUMN load_unit_id SET NOT NULL;
ALTER TABLE load_unit_items ALTER COLUMN package_id SET NOT NULL;
ALTER TABLE load_units
  ALTER COLUMN destination_warehouse_id SET NOT NULL,
  ADD CONSTRAINT load_units_distinct_warehouses_check
    CHECK (origin_warehouse_id <> destination_warehouse_id);
