#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)
PROPOSAL="$SCRIPT_DIR/backend-rates-waybills.sql"
FOUNDATION="$REPOSITORY_ROOT/packages/db/migrations/0000_foundation.sql"
CONTAINER_NAME="zhili-rates-waybills-proposal-$$"
POSTGRES_IMAGE=${POSTGRES_IMAGE:-postgres:17-alpine}
RATE_CONCRETE_LOG=
RATE_WILDCARD_LOG=
QUOTE_ACCEPT_LOG=
QUOTE_HEAD_LOG=

fail() {
  printf 'proposal contract: FAIL: %s\n' "$*" >&2
  exit 1
}

expect_text() {
  pattern=$1
  description=$2
  if ! grep -Eq "$pattern" "$PROPOSAL"; then
    fail "$description"
  fi
}

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -f \
    "${RATE_CONCRETE_LOG:-}" \
    "${RATE_WILDCARD_LOG:-}" \
    "${QUOTE_ACCEPT_LOG:-}" \
    "${QUOTE_HEAD_LOG:-}"
}
trap cleanup EXIT HUP INT TERM

[ -f "$PROPOSAL" ] || fail "missing backend-rates-waybills.sql"
[ -f "$FOUNDATION" ] || fail "missing 0000_foundation.sql"
command -v docker >/dev/null 2>&1 || fail "docker is required for PostgreSQL verification"

for table in \
  shipping_channels rate_cards rate_card_versions rate_rules \
  quotes quote_versions quote_parcels quote_options quote_charge_lines \
  quote_explanations quote_acceptances orders waybills waybill_packages \
  customs_declarations declaration_items order_batch_jobs order_batch_items \
  attachments import_jobs import_rows
do
  expect_text "CREATE TABLE ${table}[[:space:]]*\\(" "missing table ${table}"
done

expect_text "current_setting\\('app\\.tenant_id',[[:space:]]*true\\)" \
  "RLS must use the foundation app.tenant_id setting"
if grep -Eq "app\\.current_tenant" "$PROPOSAL"; then
  fail "deprecated app.current_tenant setting is forbidden"
fi
if grep -Eq "CREATE TABLE (tenants|customers|customer_addresses)[[:space:]]*\\(" "$PROPOSAL"; then
  fail "identity/master-data dependencies must not be redefined"
fi
expect_text "CREATE EXTENSION IF NOT EXISTS btree_gist" \
  "rule overlap rejection requires btree_gist"
expect_text "EXCLUDE USING gist" "rule priority ties must be rejected by a database constraint"
expect_text "prevent_quote_snapshot_mutation" \
  "quote versions and accepted snapshots need an immutability trigger"
expect_text "valid_until" "quote and rate validity must be persisted"
expect_text "idempotency_key" "mutations/imports must persist idempotency keys"
expect_text "rollback_status" "import rows must persist rollback outcomes"

docker run -d --rm \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_PASSWORD=proposal \
  -e POSTGRES_DB=zhili_proposal \
  "$POSTGRES_IMAGE" >/dev/null

attempt=0
until docker exec "$CONTAINER_NAME" pg_isready -U postgres -d zhili_proposal >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || fail "PostgreSQL container did not become ready"
  sleep 1
done

docker exec -i "$CONTAINER_NAME" \
  psql -v ON_ERROR_STOP=1 -U postgres -d zhili_proposal < "$FOUNDATION" >/dev/null

# Phase A runs before the identity proposal is merged. These tables reproduce only
# its declared public keys so the cross-domain foreign keys can be executed.
docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d zhili_proposal \
  >/dev/null <<'SQL'
CREATE TABLE tenants (
  id text PRIMARY KEY
);
CREATE TABLE customers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT
);
CREATE TABLE customer_addresses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  customer_id text NOT NULL,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);
SQL

docker exec -i "$CONTAINER_NAME" \
  psql -v ON_ERROR_STOP=1 -U postgres -d zhili_proposal < "$PROPOSAL" >/dev/null

docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d zhili_proposal \
  >/dev/null <<'SQL'
DO $$
DECLARE
  expected_tables constant text[] := ARRAY[
    'shipping_channels', 'rate_cards', 'rate_card_versions', 'rate_rules',
    'quotes', 'quote_versions', 'quote_parcels', 'quote_options',
    'quote_charge_lines', 'quote_explanations', 'quote_acceptances',
    'orders', 'waybills', 'waybill_packages', 'customs_declarations',
    'declaration_items', 'order_batch_jobs', 'order_batch_items',
    'attachments', 'import_jobs', 'import_rows'
  ];
  table_name text;
  missing_count integer;
BEGIN
  FOREACH table_name IN ARRAY expected_tables LOOP
    SELECT count(*) INTO missing_count
    FROM pg_class
    WHERE oid = table_name::regclass
      AND relrowsecurity
      AND relforcerowsecurity;
    IF missing_count <> 1 THEN
      RAISE EXCEPTION '% must enable and force RLS', table_name;
    END IF;

    SELECT count(*) INTO missing_count
    FROM pg_constraint
    WHERE conrelid = table_name::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, id)';
    IF missing_count <> 1 THEN
      RAISE EXCEPTION '% must expose UNIQUE (tenant_id, id)', table_name;
    END IF;
  END LOOP;

  SELECT count(*) INTO missing_count
  FROM pg_constraint c
  JOIN pg_class child ON child.oid = c.conrelid
  JOIN pg_class parent ON parent.oid = c.confrelid
  WHERE c.contype = 'f'
    AND child.relname = ANY (expected_tables)
    AND parent.relname = ANY (expected_tables)
    AND NOT (
      pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (tenant_id,%'
      AND pg_get_constraintdef(c.oid) LIKE '%REFERENCES %(tenant_id,%'
    );
  IF missing_count <> 0 THEN
    RAISE EXCEPTION '% cross-domain foreign keys are not tenant-safe', missing_count;
  END IF;
END
$$;

INSERT INTO tenants (id) VALUES
  ('01ARZ3NDEKTSV4RRFFQ69G5FAV'),
  ('01ARZ3NDEKTSV4RRFFQ69G5FAW');
INSERT INTO customers (id, tenant_id) VALUES
  ('01ARZ3NDEKTSV4RRFFQ69G5FAX', '01ARZ3NDEKTSV4RRFFQ69G5FAV');
INSERT INTO customer_addresses (id, tenant_id, customer_id) VALUES
  ('01ARZ3NDEKTSV4RRFFQ69G5FAY', '01ARZ3NDEKTSV4RRFFQ69G5FAV', '01ARZ3NDEKTSV4RRFFQ69G5FAX');

INSERT INTO shipping_channels (id, tenant_id, code, name, state, version) VALUES
  ('01ARZ3NDEKTSV4RRFFQ69G5FA0', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'DHL', 'DHL', 'ACTIVE', 1),
  ('01ARZ3NDEKTSV4RRFFQ69G5FA1', '01ARZ3NDEKTSV4RRFFQ69G5FAW', 'UPS', 'UPS', 'ACTIVE', 1);

BEGIN;
SET LOCAL ROLE zhili_app;
SELECT set_config('app.tenant_id', '01ARZ3NDEKTSV4RRFFQ69G5FAV', true);
DO $$
DECLARE visible_rows integer;
BEGIN
  SELECT count(*) INTO visible_rows FROM shipping_channels;
  IF visible_rows <> 1 THEN
    RAISE EXCEPTION 'RLS exposed % shipping channels instead of 1', visible_rows;
  END IF;
END
$$;
ROLLBACK;

INSERT INTO rate_cards (
  id, tenant_id, code, name, state, currency, version
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FA2', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  'DEFAULT', 'Default', 'ACTIVE', 'USD', 1
);
INSERT INTO rate_card_versions (
  id, tenant_id, rate_card_id, version_number, state, valid_from, valid_until, published_at
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FA3', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA2', 1, 'PUBLISHED', now() - interval '1 day',
  now() + interval '1 day', now()
);
INSERT INTO rate_rules (
  id, tenant_id, rate_card_version_id, rule_type, priority, channel_id,
  service_code, origin_country_code, destination_country_code, package_type,
  min_weight_grams, max_weight_grams, calculation_method, amount_minor,
  currency, percentage_bps, state, version
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FA4', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA3', 'BASE', 100,
  '01ARZ3NDEKTSV4RRFFQ69G5FA0', 'EXPRESS', 'CN', 'US', 'PARCEL',
  1, 1000, 'FLAT', 500, 'USD', NULL, 'ACTIVE', 1
);
INSERT INTO rate_rules (
  id, tenant_id, rate_card_version_id, rule_type, priority, channel_id,
  service_code, origin_country_code, destination_country_code, package_type,
  min_weight_grams, max_weight_grams, calculation_method, amount_minor,
  currency, percentage_bps, state, version
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FAD', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA3', 'SURCHARGE', 200,
  NULL, 'ANY', '*', '*', 'PARCEL', 1, 1000, 'FLAT', 50, 'USD', NULL, 'ACTIVE', 1
);

DO $$
BEGIN
  BEGIN
    INSERT INTO rate_rules (
      id, tenant_id, rate_card_version_id, rule_type, priority, channel_id,
      service_code, origin_country_code, destination_country_code, package_type,
      min_weight_grams, max_weight_grams, calculation_method, amount_minor,
      currency, percentage_bps, state, version
    ) VALUES (
      '01ARZ3NDEKTSV4RRFFQ69G5FA5', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      '01ARZ3NDEKTSV4RRFFQ69G5FA3', 'BASE', 100,
      '01ARZ3NDEKTSV4RRFFQ69G5FA0', 'EXPRESS', 'CN', 'US', 'PARCEL',
      500, 2000, 'FLAT', 600, 'USD', NULL, 'ACTIVE', 1
    );
    RAISE EXCEPTION 'overlapping rules with tied priority were accepted';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;
END
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO rate_rules (
      id, tenant_id, rate_card_version_id, rule_type, priority, channel_id,
      service_code, origin_country_code, destination_country_code, package_type,
      min_weight_grams, max_weight_grams, calculation_method, amount_minor,
      currency, percentage_bps, state, version
    ) VALUES (
      '01ARZ3NDEKTSV4RRFFQ69G5FAE', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      '01ARZ3NDEKTSV4RRFFQ69G5FA3', 'BASE', 100,
      NULL, 'EXPRESS', '*', '*', 'PARCEL',
      500, 2000, 'FLAT', 600, 'USD', NULL, 'ACTIVE', 1
    );
    RAISE EXCEPTION 'wildcard and concrete rules tied at the same priority';
  EXCEPTION
    WHEN exclusion_violation THEN NULL;
  END;
END
$$;

INSERT INTO quotes (
  id, tenant_id, quote_number, customer_id, state, requested_currency,
  idempotency_key, version
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FA6', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  'Q-1', '01ARZ3NDEKTSV4RRFFQ69G5FAX', 'OPEN', 'USD', 'quote-request-1', 1
);
INSERT INTO quotes (
  id, tenant_id, quote_number, customer_id, state, requested_currency,
  idempotency_key, version
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FB0', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  'Q-2', '01ARZ3NDEKTSV4RRFFQ69G5FAX', 'OPEN', 'USD', 'quote-request-2', 1
);
INSERT INTO quote_versions (
  id, tenant_id, quote_id, version_number, input_snapshot, valid_until
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FA7', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA6', 1, '{"route":"CN-US"}', now() + interval '1 hour'
);
INSERT INTO quote_versions (
  id, tenant_id, quote_id, version_number, input_snapshot, valid_until
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FB1', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FB0', 1, '{"route":"CN-GB"}', now() + interval '1 hour'
);
INSERT INTO quote_parcels (
  id, tenant_id, quote_version_id, parcel_number, actual_weight_grams,
  length_mm, width_mm, height_mm
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FA8', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA7', 1, 1000, 100, 100, 100
);
INSERT INTO quote_options (
  id, tenant_id, quote_version_id, quote_id, option_code, channel_id, service_code,
  currency, total_amount_minor, chargeable_weight_grams, state
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FA9', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA7', '01ARZ3NDEKTSV4RRFFQ69G5FA6',
  'FASTEST', '01ARZ3NDEKTSV4RRFFQ69G5FA0',
  'EXPRESS', 'USD', 500, 1000, 'OFFERED'
);
INSERT INTO quote_options (
  id, tenant_id, quote_version_id, quote_id, option_code, channel_id, service_code,
  currency, total_amount_minor, chargeable_weight_grams, state
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FB2', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FB1', '01ARZ3NDEKTSV4RRFFQ69G5FB0',
  'FOREIGN', '01ARZ3NDEKTSV4RRFFQ69G5FA0',
  'EXPRESS', 'USD', 700, 1000, 'OFFERED'
);
INSERT INTO quote_charge_lines (
  id, tenant_id, quote_option_id, line_number, charge_code, description,
  currency, amount_minor, rate_rule_id
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FAA', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA9', 1, 'BASE', 'Base charge', 'USD', 500,
  '01ARZ3NDEKTSV4RRFFQ69G5FA4'
);
INSERT INTO quote_explanations (
  id, tenant_id, quote_option_id, sequence_number, explanation_code,
  message, facts_snapshot
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FAB', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA9', 1, 'RULE_APPLIED', 'Base rule selected',
  '{"rule":"01ARZ3NDEKTSV4RRFFQ69G5FA4"}'
);
DO $$
BEGIN
  BEGIN
    UPDATE quotes
    SET state = 'ACCEPTED',
        accepted_quote_version_id = '01ARZ3NDEKTSV4RRFFQ69G5FB1',
        accepted_quote_option_id = '01ARZ3NDEKTSV4RRFFQ69G5FB2',
        version = 2,
        updated_at = now()
    WHERE id = '01ARZ3NDEKTSV4RRFFQ69G5FA6';
    RAISE EXCEPTION 'quote accepted a version and option owned by another quote';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;
END
$$;
UPDATE quotes
SET state = 'ACCEPTED',
    accepted_quote_version_id = '01ARZ3NDEKTSV4RRFFQ69G5FA7',
    accepted_quote_option_id = '01ARZ3NDEKTSV4RRFFQ69G5FA9',
    version = 2,
    updated_at = now()
WHERE id = '01ARZ3NDEKTSV4RRFFQ69G5FA6';
INSERT INTO quote_acceptances (
  id, tenant_id, quote_id, quote_version_id, quote_option_id, currency,
  total_amount_minor, explanation_snapshot, accepted_by_subject_id
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FAC', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA6', '01ARZ3NDEKTSV4RRFFQ69G5FA7',
  '01ARZ3NDEKTSV4RRFFQ69G5FA9', 'USD', 500,
  '[{"code":"RULE_APPLIED","message":"Base rule selected"}]', 'subject-1'
);

DO $$
BEGIN
  BEGIN
    UPDATE quote_explanations
    SET message = 'recomputed'
    WHERE id = '01ARZ3NDEKTSV4RRFFQ69G5FAB';
    RAISE EXCEPTION 'quote explanation mutation was accepted';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN NULL;
  END;
  BEGIN
    DELETE FROM quote_acceptances
    WHERE id = '01ARZ3NDEKTSV4RRFFQ69G5FAC';
    RAISE EXCEPTION 'accepted explanation snapshot deletion was accepted';
  EXCEPTION
    WHEN SQLSTATE '55000' THEN NULL;
  END;
END
$$;

INSERT INTO orders (
  id, tenant_id, order_number, customer_id, pickup_address_id,
  delivery_address_id, state, idempotency_key, version
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FC0', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'ORD-IMPORT-1',
  '01ARZ3NDEKTSV4RRFFQ69G5FAX', '01ARZ3NDEKTSV4RRFFQ69G5FAY',
  '01ARZ3NDEKTSV4RRFFQ69G5FAY', 'DRAFT', 'order-import-1', 1
);
INSERT INTO import_jobs (
  id, tenant_id, import_number, import_type, source_object_key, source_sha256,
  state, idempotency_key, total_rows, succeeded_rows, failed_rows, committed_at
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FC1', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'IMP-ORIGINAL-1',
  'ORDERS', 'imports/original-1.csv', repeat('a', 64), 'COMMITTED',
  'import-original-1', 1, 1, 0, now()
);
INSERT INTO import_rows (
  id, tenant_id, import_job_id, row_number, source_fingerprint, input_payload,
  validation_status, commit_status, rollback_status, result_code,
  created_order_id, applied_at
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FC2', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FC1', 1, repeat('b', 64), '{"order":"ORD-IMPORT-1"}',
  'VALID', 'APPLIED', 'PENDING', 'CREATED', '01ARZ3NDEKTSV4RRFFQ69G5FC0', now()
);
UPDATE import_rows
SET rollback_status = 'ROLLED_BACK', rolled_back_at = now(), updated_at = now()
WHERE id = '01ARZ3NDEKTSV4RRFFQ69G5FC2';

DO $$
BEGIN
  BEGIN
    INSERT INTO import_rows (
      id, tenant_id, import_job_id, row_number, source_fingerprint, input_payload,
      validation_status, commit_status, rollback_status, result_code, rolled_back_at
    ) VALUES (
      '01ARZ3NDEKTSV4RRFFQ69G5FC6', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      '01ARZ3NDEKTSV4RRFFQ69G5FC1', 2, repeat('c', 64), '{"bad":true}',
      'INVALID', 'FAILED', 'ROLLED_BACK', 'INVALID_ROW', now()
    );
    RAISE EXCEPTION 'a failed import row claimed a successful rollback';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$$;

INSERT INTO import_jobs (
  id, tenant_id, import_number, import_type, source_object_key, source_sha256,
  state, idempotency_key, rollback_of_job_id
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FC3', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'IMP-ROLLBACK-1',
  'ORDERS', 'imports/rollback-1.json', repeat('d', 64), 'UPLOADED',
  'import-rollback-1', '01ARZ3NDEKTSV4RRFFQ69G5FC1'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO import_jobs (
      id, tenant_id, import_number, import_type, source_object_key, source_sha256,
      state, idempotency_key, rollback_of_job_id
    ) VALUES (
      '01ARZ3NDEKTSV4RRFFQ69G5FC4', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'IMP-ROLLBACK-DUP',
      'ORDERS', 'imports/rollback-duplicate.json', repeat('e', 64), 'UPLOADED',
      'import-rollback-duplicate', '01ARZ3NDEKTSV4RRFFQ69G5FC1'
    );
    RAISE EXCEPTION 'duplicate rollback job was accepted';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO import_jobs (
      id, tenant_id, import_number, import_type, source_object_key, source_sha256,
      state, idempotency_key, rollback_of_job_id
    ) VALUES (
      '01ARZ3NDEKTSV4RRFFQ69G5FC5', '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'IMP-ROLLBACK-NESTED',
      'ORDERS', 'imports/rollback-nested.json', repeat('f', 64), 'UPLOADED',
      'import-rollback-nested', '01ARZ3NDEKTSV4RRFFQ69G5FC3'
    );
    RAISE EXCEPTION 'rollback-of-rollback job was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$$;
SQL

RATE_CONCRETE_LOG=$(mktemp)
RATE_WILDCARD_LOG=$(mktemp)

docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d zhili_proposal \
  >"$RATE_CONCRETE_LOG" 2>&1 <<'SQL' &
BEGIN;
INSERT INTO rate_rules (
  id, tenant_id, rate_card_version_id, rule_type, priority, channel_id,
  service_code, origin_country_code, destination_country_code, package_type,
  min_weight_grams, max_weight_grams, calculation_method, amount_minor,
  currency, percentage_bps, state, version
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FD0', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA3', 'BASE', 300,
  '01ARZ3NDEKTSV4RRFFQ69G5FA0', 'EXPRESS', 'CN', 'US', 'PARCEL',
  1, 1000, 'FLAT', 500, 'USD', NULL, 'ACTIVE', 1
);
SELECT pg_sleep(2);
COMMIT;
SQL
rate_concrete_pid=$!
sleep 1

set +e
docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d zhili_proposal \
  >"$RATE_WILDCARD_LOG" 2>&1 <<'SQL'
INSERT INTO rate_rules (
  id, tenant_id, rate_card_version_id, rule_type, priority, channel_id,
  service_code, origin_country_code, destination_country_code, package_type,
  min_weight_grams, max_weight_grams, calculation_method, amount_minor,
  currency, percentage_bps, state, version
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FD1', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA3', 'BASE', 300,
  NULL, 'EXPRESS', '*', '*', 'PARCEL',
  500, 2000, 'FLAT', 600, 'USD', NULL, 'ACTIVE', 1
);
SQL
rate_wildcard_status=$?
wait "$rate_concrete_pid"
rate_concrete_status=$?
set -e

[ "$rate_concrete_status" -eq 0 ] || fail "concrete rate-rule transaction did not commit"
[ "$rate_wildcard_status" -ne 0 ] || fail "concurrent wildcard rate-rule tie committed"
grep -q "rate rule priority tie after wildcard expansion" "$RATE_WILDCARD_LOG" ||
  fail "concurrent wildcard rate-rule tie did not fail by semantic exclusion"

docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d zhili_proposal \
  >/dev/null <<'SQL'
INSERT INTO quote_options (
  id, tenant_id, quote_version_id, quote_id, option_code, channel_id, service_code,
  currency, total_amount_minor, chargeable_weight_grams, state
) VALUES
  (
    '01ARZ3NDEKTSV4RRFFQ69G5FD3', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    '01ARZ3NDEKTSV4RRFFQ69G5FB1', '01ARZ3NDEKTSV4RRFFQ69G5FB0',
    'SECOND', '01ARZ3NDEKTSV4RRFFQ69G5FA0', 'EXPRESS', 'USD', 800, 1000, 'OFFERED'
  ),
  (
    '01ARZ3NDEKTSV4RRFFQ69G5FD5', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    '01ARZ3NDEKTSV4RRFFQ69G5FB1', '01ARZ3NDEKTSV4RRFFQ69G5FB0',
    'UNAVAILABLE', '01ARZ3NDEKTSV4RRFFQ69G5FA0', 'EXPRESS', 'USD', 900, 1000, 'UNAVAILABLE'
  );
INSERT INTO quote_charge_lines (
  id, tenant_id, quote_option_id, line_number, charge_code, description,
  currency, amount_minor
) VALUES
  (
    '01ARZ3NDEKTSV4RRFFQ69G5FD7', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    '01ARZ3NDEKTSV4RRFFQ69G5FB2', 1, 'BASE', 'Base charge', 'USD', 700
  ),
  (
    '01ARZ3NDEKTSV4RRFFQ69G5FD8', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    '01ARZ3NDEKTSV4RRFFQ69G5FD3', 1, 'BASE', 'Second charge', 'USD', 800
  ),
  (
    '01ARZ3NDEKTSV4RRFFQ69G5FD9', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    '01ARZ3NDEKTSV4RRFFQ69G5FD5', 1, 'BASE', 'Unavailable charge', 'USD', 900
  );
UPDATE quotes
SET state = 'ACCEPTED',
    accepted_quote_version_id = '01ARZ3NDEKTSV4RRFFQ69G5FB1',
    accepted_quote_option_id = '01ARZ3NDEKTSV4RRFFQ69G5FB2',
    version = 2,
    updated_at = now()
WHERE id = '01ARZ3NDEKTSV4RRFFQ69G5FB0';

DO $$
DECLARE boundary timestamptz;
BEGIN
  SELECT valid_until INTO boundary
  FROM quote_versions
  WHERE id = '01ARZ3NDEKTSV4RRFFQ69G5FB1';
  BEGIN
    INSERT INTO quote_acceptances (
      id, tenant_id, quote_id, quote_version_id, quote_option_id, currency,
      total_amount_minor, explanation_snapshot, accepted_by_subject_id,
      accepted_at, created_at
    ) VALUES (
      '01ARZ3NDEKTSV4RRFFQ69G5FD4', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      '01ARZ3NDEKTSV4RRFFQ69G5FB0', '01ARZ3NDEKTSV4RRFFQ69G5FB1',
      '01ARZ3NDEKTSV4RRFFQ69G5FB2', 'USD', 700, '[{"code":"BOUNDARY"}]',
      'subject-boundary', boundary, boundary
    );
    RAISE EXCEPTION 'quote was accepted at the exclusive valid_until boundary';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE quotes
    SET accepted_quote_option_id = '01ARZ3NDEKTSV4RRFFQ69G5FD5',
        version = version + 1,
        updated_at = now()
    WHERE id = '01ARZ3NDEKTSV4RRFFQ69G5FB0';
    INSERT INTO quote_acceptances (
      id, tenant_id, quote_id, quote_version_id, quote_option_id, currency,
      total_amount_minor, explanation_snapshot, accepted_by_subject_id
    ) VALUES (
      '01ARZ3NDEKTSV4RRFFQ69G5FD6', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      '01ARZ3NDEKTSV4RRFFQ69G5FB0', '01ARZ3NDEKTSV4RRFFQ69G5FB1',
      '01ARZ3NDEKTSV4RRFFQ69G5FD5', 'USD', 900, '[{"code":"UNAVAILABLE"}]',
      'subject-unavailable'
    );
    RAISE EXCEPTION 'an unavailable quote option was accepted';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$$;
SQL

QUOTE_ACCEPT_LOG=$(mktemp)
QUOTE_HEAD_LOG=$(mktemp)

docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d zhili_proposal \
  >"$QUOTE_ACCEPT_LOG" 2>&1 <<'SQL' &
BEGIN;
INSERT INTO quote_acceptances (
  id, tenant_id, quote_id, quote_version_id, quote_option_id, currency,
  total_amount_minor, explanation_snapshot, accepted_by_subject_id
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FD2', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FB0', '01ARZ3NDEKTSV4RRFFQ69G5FB1',
  '01ARZ3NDEKTSV4RRFFQ69G5FB2', 'USD', 700, '[{"code":"ACCEPTED"}]',
  'subject-concurrent'
);
SELECT pg_sleep(2);
COMMIT;
SQL
quote_accept_pid=$!
sleep 1

set +e
docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d zhili_proposal \
  >"$QUOTE_HEAD_LOG" 2>&1 <<'SQL'
UPDATE quotes
SET accepted_quote_option_id = '01ARZ3NDEKTSV4RRFFQ69G5FD3',
    version = version + 1,
    updated_at = now()
WHERE id = '01ARZ3NDEKTSV4RRFFQ69G5FB0';
SQL
quote_head_status=$?
wait "$quote_accept_pid"
quote_accept_status=$?
set -e

[ "$quote_accept_status" -eq 0 ] || fail "concurrent quote acceptance did not commit"
[ "$quote_head_status" -ne 0 ] || fail "concurrent accepted quote head update committed"
grep -q "accepted quotes are immutable" "$QUOTE_HEAD_LOG" ||
  fail "concurrent quote head update failed for an unexpected reason"

docker exec -i "$CONTAINER_NAME" psql -v ON_ERROR_STOP=1 -U postgres -d zhili_proposal \
  >/dev/null <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM quotes q
    JOIN quote_acceptances a
      ON a.tenant_id = q.tenant_id
     AND a.quote_id = q.id
     AND a.quote_version_id = q.accepted_quote_version_id
     AND a.quote_option_id = q.accepted_quote_option_id
    WHERE q.id = '01ARZ3NDEKTSV4RRFFQ69G5FB0'
  ) THEN
    RAISE EXCEPTION 'quote head and immutable acceptance diverged after concurrent updates';
  END IF;
END
$$;
SQL

printf 'proposal contract: PASS\n'
