#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)
PROPOSAL="$SCRIPT_DIR/backend-rates-waybills.sql"
FOUNDATION="$REPOSITORY_ROOT/packages/db/migrations/0000_foundation.sql"
CONTAINER_NAME="zhili-rates-waybills-proposal-$$"
POSTGRES_IMAGE=${POSTGRES_IMAGE:-postgres:17-alpine}

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

INSERT INTO quotes (
  id, tenant_id, quote_number, customer_id, state, requested_currency,
  idempotency_key, version
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FA6', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  'Q-1', '01ARZ3NDEKTSV4RRFFQ69G5FAX', 'OPEN', 'USD', 'quote-request-1', 1
);
INSERT INTO quote_versions (
  id, tenant_id, quote_id, version_number, input_snapshot, valid_until
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FA7', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA6', 1, '{"route":"CN-US"}', now() + interval '1 hour'
);
INSERT INTO quote_parcels (
  id, tenant_id, quote_version_id, parcel_number, actual_weight_grams,
  length_mm, width_mm, height_mm
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FA8', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA7', 1, 1000, 100, 100, 100
);
INSERT INTO quote_options (
  id, tenant_id, quote_version_id, option_code, channel_id, service_code,
  currency, total_amount_minor, chargeable_weight_grams, state
) VALUES (
  '01ARZ3NDEKTSV4RRFFQ69G5FA9', '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  '01ARZ3NDEKTSV4RRFFQ69G5FA7', 'FASTEST', '01ARZ3NDEKTSV4RRFFQ69G5FA0',
  'EXPRESS', 'USD', 500, 1000, 'OFFERED'
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
SQL

printf 'proposal contract: PASS\n'
