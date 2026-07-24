-- B1 rates, quotes, orders, waybills and imports schema proposal.
-- Ordered prerequisites (owned by other proposals; intentionally not redefined):
--   packages/db/migrations/0000_foundation.sql
--   tenants(id)
--   customers(tenant_id, id)
--   customer_addresses(tenant_id, id)
-- RLS convention: current_setting('app.tenant_id', true).

DO $$
BEGIN
  IF to_regclass('public.tenants') IS NULL
     OR to_regclass('public.customers') IS NULL
     OR to_regclass('public.customer_addresses') IS NULL THEN
    RAISE EXCEPTION
      'backend-rates-waybills requires tenants, customers, and customer_addresses';
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE shipping_channels (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  state text NOT NULL DEFAULT 'ACTIVE',
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipping_channels_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT shipping_channels_code_check CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'),
  CONSTRAINT shipping_channels_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT shipping_channels_state_check CHECK (state IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT shipping_channels_version_check CHECK (version >= 1),
  CONSTRAINT shipping_channels_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT shipping_channels_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT shipping_channels_tenant_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT shipping_channels_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE rate_cards (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  channel_id text,
  customer_id text,
  state text NOT NULL DEFAULT 'DRAFT',
  currency text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_cards_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT rate_cards_code_check CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'),
  CONSTRAINT rate_cards_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  CONSTRAINT rate_cards_state_check CHECK (state IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  CONSTRAINT rate_cards_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT rate_cards_version_check CHECK (version >= 1),
  CONSTRAINT rate_cards_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT rate_cards_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT rate_cards_tenant_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT rate_cards_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT rate_cards_channel_fk FOREIGN KEY (tenant_id, channel_id)
    REFERENCES shipping_channels (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT rate_cards_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE rate_card_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  rate_card_id text NOT NULL,
  version_number integer NOT NULL,
  state text NOT NULL DEFAULT 'DRAFT',
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_card_versions_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT rate_card_versions_number_check CHECK (version_number >= 1),
  CONSTRAINT rate_card_versions_state_check CHECK (state IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  CONSTRAINT rate_card_versions_validity_check CHECK (valid_until > valid_from),
  CONSTRAINT rate_card_versions_publish_check CHECK (
    (state = 'DRAFT' AND published_at IS NULL) OR
    (state IN ('PUBLISHED', 'RETIRED') AND published_at IS NOT NULL)
  ),
  CONSTRAINT rate_card_versions_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT rate_card_versions_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT rate_card_versions_number_unique UNIQUE (tenant_id, rate_card_id, version_number),
  CONSTRAINT rate_card_versions_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT rate_card_versions_card_fk FOREIGN KEY (tenant_id, rate_card_id)
    REFERENCES rate_cards (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT rate_card_versions_published_validity_exclude EXCLUDE USING gist (
    tenant_id WITH =,
    rate_card_id WITH =,
    tstzrange(valid_from, valid_until, '[)') WITH &&
  ) WHERE (state = 'PUBLISHED')
);

CREATE TABLE rate_rules (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  rate_card_version_id text NOT NULL,
  rule_type text NOT NULL,
  priority integer NOT NULL,
  channel_id text,
  service_code text NOT NULL,
  origin_country_code text NOT NULL,
  destination_country_code text NOT NULL,
  package_type text NOT NULL,
  min_weight_grams bigint NOT NULL,
  max_weight_grams bigint NOT NULL,
  calculation_method text NOT NULL,
  amount_minor bigint,
  currency text,
  percentage_bps integer,
  dimensional_divisor bigint,
  rounding_step_grams bigint,
  state text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  scope_key text GENERATED ALWAYS AS (
    coalesce(channel_id, '*') || '|' || service_code || '|' || origin_country_code || '|' ||
    destination_country_code || '|' || package_type
  ) STORED,
  weight_range int8range GENERATED ALWAYS AS (
    int8range(min_weight_grams, max_weight_grams, '[]')
  ) STORED,
  CONSTRAINT rate_rules_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT rate_rules_type_check CHECK (
    rule_type IN ('BASE', 'WEIGHT_STEP', 'FUEL', 'MINIMUM', 'SURCHARGE', 'DISCOUNT')
  ),
  CONSTRAINT rate_rules_priority_check CHECK (priority >= 0),
  CONSTRAINT rate_rules_service_check CHECK (length(btrim(service_code)) BETWEEN 1 AND 64),
  CONSTRAINT rate_rules_origin_check CHECK (origin_country_code ~ '^([A-Z]{2}|[*])$'),
  CONSTRAINT rate_rules_destination_check CHECK (destination_country_code ~ '^([A-Z]{2}|[*])$'),
  CONSTRAINT rate_rules_package_type_check CHECK (length(btrim(package_type)) BETWEEN 1 AND 32),
  CONSTRAINT rate_rules_weight_check CHECK (
    min_weight_grams > 0 AND max_weight_grams >= min_weight_grams
  ),
  CONSTRAINT rate_rules_method_check CHECK (
    calculation_method IN ('FLAT', 'PER_KG', 'PERCENT', 'MINIMUM')
  ),
  CONSTRAINT rate_rules_money_check CHECK (
    (calculation_method IN ('FLAT', 'PER_KG', 'MINIMUM')
      AND amount_minor IS NOT NULL AND amount_minor >= 0
      AND currency ~ '^[A-Z]{3}$' AND percentage_bps IS NULL)
    OR
    (calculation_method = 'PERCENT' AND amount_minor IS NULL AND currency IS NULL
      AND percentage_bps BETWEEN -10000 AND 100000)
  ),
  CONSTRAINT rate_rules_measurement_check CHECK (
    (dimensional_divisor IS NULL OR dimensional_divisor > 0) AND
    (rounding_step_grams IS NULL OR rounding_step_grams > 0)
  ),
  CONSTRAINT rate_rules_state_check CHECK (state IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT rate_rules_version_check CHECK (version >= 1),
  CONSTRAINT rate_rules_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT rate_rules_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT rate_rules_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT rate_rules_version_fk FOREIGN KEY (tenant_id, rate_card_version_id)
    REFERENCES rate_card_versions (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT rate_rules_channel_fk FOREIGN KEY (tenant_id, channel_id)
    REFERENCES shipping_channels (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT rate_rules_priority_tie_exclude EXCLUDE USING gist (
    tenant_id WITH =,
    rate_card_version_id WITH =,
    rule_type WITH =,
    priority WITH =,
    scope_key WITH =,
    weight_range WITH &&
  ) WHERE (state = 'ACTIVE')
);

CREATE FUNCTION reject_rate_rule_semantic_priority_tie()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  -- The lock key covers every rule that could tie after wildcard expansion. It
  -- closes the read-then-insert race that a plain trigger query would leave.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.tenant_id || '|' || NEW.rate_card_version_id || '|' ||
      NEW.rule_type || '|' || NEW.priority::text,
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM rate_rules existing
    WHERE existing.tenant_id = NEW.tenant_id
      AND existing.rate_card_version_id = NEW.rate_card_version_id
      AND existing.rule_type = NEW.rule_type
      AND existing.priority = NEW.priority
      AND existing.state = 'ACTIVE'
      AND existing.id <> NEW.id
      AND existing.min_weight_grams <= NEW.max_weight_grams
      AND existing.max_weight_grams >= NEW.min_weight_grams
      AND (
        existing.channel_id IS NULL OR NEW.channel_id IS NULL OR
        existing.channel_id = NEW.channel_id
      )
      AND (
        existing.service_code = '*' OR NEW.service_code = '*' OR
        existing.service_code = NEW.service_code
      )
      AND (
        existing.origin_country_code = '*' OR NEW.origin_country_code = '*' OR
        existing.origin_country_code = NEW.origin_country_code
      )
      AND (
        existing.destination_country_code = '*' OR NEW.destination_country_code = '*' OR
        existing.destination_country_code = NEW.destination_country_code
      )
      AND (
        existing.package_type = '*' OR NEW.package_type = '*' OR
        existing.package_type = NEW.package_type
      )
  ) THEN
    RAISE EXCEPTION 'rate rule priority tie after wildcard expansion'
      USING ERRCODE = '23P01', CONSTRAINT = 'rate_rules_semantic_priority_tie';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rate_rules_semantic_tie_insert
BEFORE INSERT ON rate_rules
FOR EACH ROW EXECUTE FUNCTION reject_rate_rule_semantic_priority_tie();

CREATE TRIGGER rate_rules_semantic_tie_update
BEFORE UPDATE OF
  tenant_id,
  rate_card_version_id,
  rule_type,
  priority,
  channel_id,
  service_code,
  origin_country_code,
  destination_country_code,
  package_type,
  min_weight_grams,
  max_weight_grams,
  state
ON rate_rules
FOR EACH ROW EXECUTE FUNCTION reject_rate_rule_semantic_priority_tie();

CREATE TABLE quotes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  quote_number text NOT NULL,
  customer_id text NOT NULL,
  pickup_address_id text,
  delivery_address_id text,
  state text NOT NULL DEFAULT 'OPEN',
  requested_currency text NOT NULL,
  idempotency_key text NOT NULL,
  accepted_quote_version_id text,
  accepted_quote_option_id text,
  version bigint NOT NULL DEFAULT 1,
  requested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quotes_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT quotes_number_check CHECK (length(btrim(quote_number)) BETWEEN 1 AND 100),
  CONSTRAINT quotes_state_check CHECK (state IN ('OPEN', 'ACCEPTED', 'EXPIRED', 'CANCELLED')),
  CONSTRAINT quotes_currency_check CHECK (requested_currency ~ '^[A-Z]{3}$'),
  CONSTRAINT quotes_acceptance_pointer_check CHECK (
    (state = 'ACCEPTED' AND accepted_quote_version_id IS NOT NULL AND accepted_quote_option_id IS NOT NULL)
    OR
    (state <> 'ACCEPTED' AND accepted_quote_version_id IS NULL AND accepted_quote_option_id IS NULL)
  ),
  CONSTRAINT quotes_version_check CHECK (version >= 1),
  CONSTRAINT quotes_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT quotes_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT quotes_tenant_number_unique UNIQUE (tenant_id, quote_number),
  CONSTRAINT quotes_tenant_idempotency_unique UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT quotes_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT quotes_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT quotes_pickup_address_fk FOREIGN KEY (tenant_id, pickup_address_id)
    REFERENCES customer_addresses (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT quotes_delivery_address_fk FOREIGN KEY (tenant_id, delivery_address_id)
    REFERENCES customer_addresses (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE quote_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  quote_id text NOT NULL,
  version_number integer NOT NULL,
  input_snapshot jsonb NOT NULL,
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_versions_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT quote_versions_number_check CHECK (version_number >= 1),
  CONSTRAINT quote_versions_input_check CHECK (jsonb_typeof(input_snapshot) = 'object'),
  CONSTRAINT quote_versions_validity_check CHECK (valid_until > created_at),
  CONSTRAINT quote_versions_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT quote_versions_ownership_key_unique UNIQUE (tenant_id, id, quote_id),
  CONSTRAINT quote_versions_quote_version_unique UNIQUE (tenant_id, quote_id, version_number),
  CONSTRAINT quote_versions_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT quote_versions_quote_fk FOREIGN KEY (tenant_id, quote_id)
    REFERENCES quotes (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE quote_parcels (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  quote_version_id text NOT NULL,
  parcel_number integer NOT NULL,
  actual_weight_grams bigint NOT NULL,
  length_mm bigint NOT NULL,
  width_mm bigint NOT NULL,
  height_mm bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_parcels_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT quote_parcels_number_check CHECK (parcel_number >= 1),
  CONSTRAINT quote_parcels_measurements_check CHECK (
    actual_weight_grams > 0 AND length_mm > 0 AND width_mm > 0 AND height_mm > 0
  ),
  CONSTRAINT quote_parcels_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT quote_parcels_number_unique UNIQUE (tenant_id, quote_version_id, parcel_number),
  CONSTRAINT quote_parcels_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT quote_parcels_version_fk FOREIGN KEY (tenant_id, quote_version_id)
    REFERENCES quote_versions (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE quote_options (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  quote_version_id text NOT NULL,
  quote_id text NOT NULL,
  option_code text NOT NULL,
  channel_id text NOT NULL,
  service_code text NOT NULL,
  currency text NOT NULL,
  total_amount_minor bigint NOT NULL,
  chargeable_weight_grams bigint NOT NULL,
  estimated_transit_days integer,
  state text NOT NULL DEFAULT 'OFFERED',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_options_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT quote_options_code_check CHECK (length(btrim(option_code)) BETWEEN 1 AND 64),
  CONSTRAINT quote_options_service_check CHECK (length(btrim(service_code)) BETWEEN 1 AND 64),
  CONSTRAINT quote_options_money_check CHECK (
    currency ~ '^[A-Z]{3}$' AND total_amount_minor >= 0
  ),
  CONSTRAINT quote_options_measurement_check CHECK (chargeable_weight_grams > 0),
  CONSTRAINT quote_options_transit_check CHECK (
    estimated_transit_days IS NULL OR estimated_transit_days >= 0
  ),
  CONSTRAINT quote_options_state_check CHECK (state IN ('OFFERED', 'SELECTED', 'UNAVAILABLE')),
  CONSTRAINT quote_options_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT quote_options_code_unique UNIQUE (tenant_id, quote_version_id, option_code),
  CONSTRAINT quote_options_version_key_unique UNIQUE (tenant_id, id, quote_version_id),
  CONSTRAINT quote_options_ownership_key_unique UNIQUE (
    tenant_id, id, quote_version_id, quote_id
  ),
  CONSTRAINT quote_options_acceptance_key_unique UNIQUE (
    tenant_id, id, quote_version_id, quote_id, currency, total_amount_minor
  ),
  CONSTRAINT quote_options_money_key_unique UNIQUE (tenant_id, id, currency),
  CONSTRAINT quote_options_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT quote_options_version_fk FOREIGN KEY (tenant_id, quote_version_id, quote_id)
    REFERENCES quote_versions (tenant_id, id, quote_id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT quote_options_channel_fk FOREIGN KEY (tenant_id, channel_id)
    REFERENCES shipping_channels (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE quote_charge_lines (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  quote_option_id text NOT NULL,
  line_number integer NOT NULL,
  charge_code text NOT NULL,
  description text NOT NULL,
  currency text NOT NULL,
  amount_minor bigint NOT NULL,
  rate_rule_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_charge_lines_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT quote_charge_lines_number_check CHECK (line_number >= 1),
  CONSTRAINT quote_charge_lines_code_check CHECK (length(btrim(charge_code)) BETWEEN 1 AND 64),
  CONSTRAINT quote_charge_lines_description_check CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  CONSTRAINT quote_charge_lines_money_check CHECK (
    currency ~ '^[A-Z]{3}$' AND amount_minor BETWEEN -9000000000000000 AND 9000000000000000
  ),
  CONSTRAINT quote_charge_lines_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT quote_charge_lines_number_unique UNIQUE (tenant_id, quote_option_id, line_number),
  CONSTRAINT quote_charge_lines_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT quote_charge_lines_option_fk FOREIGN KEY (tenant_id, quote_option_id, currency)
    REFERENCES quote_options (tenant_id, id, currency) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT quote_charge_lines_rule_fk FOREIGN KEY (tenant_id, rate_rule_id)
    REFERENCES rate_rules (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE quote_explanations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  quote_option_id text NOT NULL,
  sequence_number integer NOT NULL,
  explanation_code text NOT NULL,
  message text NOT NULL,
  facts_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_explanations_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT quote_explanations_sequence_check CHECK (sequence_number >= 1),
  CONSTRAINT quote_explanations_code_check CHECK (length(btrim(explanation_code)) BETWEEN 1 AND 64),
  CONSTRAINT quote_explanations_message_check CHECK (length(btrim(message)) BETWEEN 1 AND 2000),
  CONSTRAINT quote_explanations_facts_check CHECK (jsonb_typeof(facts_snapshot) = 'object'),
  CONSTRAINT quote_explanations_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT quote_explanations_sequence_unique UNIQUE (
    tenant_id, quote_option_id, sequence_number
  ),
  CONSTRAINT quote_explanations_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT quote_explanations_option_fk FOREIGN KEY (tenant_id, quote_option_id)
    REFERENCES quote_options (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE quote_acceptances (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  quote_id text NOT NULL,
  quote_version_id text NOT NULL,
  quote_option_id text NOT NULL,
  currency text NOT NULL,
  total_amount_minor bigint NOT NULL,
  explanation_snapshot jsonb NOT NULL,
  accepted_by_subject_id text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_acceptances_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT quote_acceptances_money_check CHECK (
    currency ~ '^[A-Z]{3}$' AND total_amount_minor >= 0
  ),
  CONSTRAINT quote_acceptances_explanation_check CHECK (
    jsonb_typeof(explanation_snapshot) = 'array' AND jsonb_array_length(explanation_snapshot) > 0
  ),
  CONSTRAINT quote_acceptances_subject_check CHECK (length(btrim(accepted_by_subject_id)) >= 1),
  CONSTRAINT quote_acceptances_time_check CHECK (created_at >= accepted_at),
  CONSTRAINT quote_acceptances_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT quote_acceptances_quote_unique UNIQUE (tenant_id, quote_id),
  CONSTRAINT quote_acceptances_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT quote_acceptances_quote_fk FOREIGN KEY (tenant_id, quote_id)
    REFERENCES quotes (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT quote_acceptances_version_ownership_fk FOREIGN KEY (
    tenant_id, quote_version_id, quote_id
  ) REFERENCES quote_versions (tenant_id, id, quote_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT quote_acceptances_option_fk FOREIGN KEY (
    tenant_id, quote_option_id, quote_version_id, quote_id, currency, total_amount_minor
  ) REFERENCES quote_options (
    tenant_id, id, quote_version_id, quote_id, currency, total_amount_minor
  ) ON UPDATE RESTRICT ON DELETE RESTRICT
);

ALTER TABLE quotes
  ADD CONSTRAINT quotes_accepted_version_fk FOREIGN KEY (
    tenant_id, accepted_quote_version_id, id
  ) REFERENCES quote_versions (tenant_id, id, quote_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  ADD CONSTRAINT quotes_accepted_option_fk FOREIGN KEY (
    tenant_id, accepted_quote_option_id, accepted_quote_version_id, id
  ) REFERENCES quote_options (tenant_id, id, quote_version_id, quote_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE TABLE orders (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  order_number text NOT NULL,
  customer_id text NOT NULL,
  pickup_address_id text NOT NULL,
  delivery_address_id text NOT NULL,
  quote_acceptance_id text,
  state text NOT NULL DEFAULT 'DRAFT',
  idempotency_key text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT orders_number_check CHECK (length(btrim(order_number)) BETWEEN 1 AND 100),
  CONSTRAINT orders_state_check CHECK (state IN ('DRAFT', 'VALIDATED', 'SUBMITTED', 'CANCELLED')),
  CONSTRAINT orders_submission_check CHECK (
    (state IN ('SUBMITTED', 'CANCELLED') AND submitted_at IS NOT NULL) OR
    (state IN ('DRAFT', 'VALIDATED') AND submitted_at IS NULL)
  ),
  CONSTRAINT orders_version_check CHECK (version >= 1),
  CONSTRAINT orders_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT orders_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT orders_tenant_number_unique UNIQUE (tenant_id, order_number),
  CONSTRAINT orders_tenant_idempotency_unique UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT orders_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT orders_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT orders_pickup_address_fk FOREIGN KEY (tenant_id, pickup_address_id)
    REFERENCES customer_addresses (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT orders_delivery_address_fk FOREIGN KEY (tenant_id, delivery_address_id)
    REFERENCES customer_addresses (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT orders_quote_acceptance_fk FOREIGN KEY (tenant_id, quote_acceptance_id)
    REFERENCES quote_acceptances (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE order_batch_jobs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  batch_number text NOT NULL,
  operation text NOT NULL,
  state text NOT NULL DEFAULT 'PENDING',
  idempotency_key text NOT NULL,
  total_items integer NOT NULL DEFAULT 0,
  succeeded_items integer NOT NULL DEFAULT 0,
  failed_items integer NOT NULL DEFAULT 0,
  version bigint NOT NULL DEFAULT 1,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_batch_jobs_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT order_batch_jobs_number_check CHECK (length(btrim(batch_number)) BETWEEN 1 AND 100),
  CONSTRAINT order_batch_jobs_operation_check CHECK (
    operation IN ('COPY', 'RENUMBER', 'SPLIT', 'MERGE', 'VALIDATE', 'SUBMIT', 'CANCEL')
  ),
  CONSTRAINT order_batch_jobs_state_check CHECK (
    state IN ('PENDING', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED')
  ),
  CONSTRAINT order_batch_jobs_counts_check CHECK (
    total_items >= 0 AND succeeded_items >= 0 AND failed_items >= 0 AND
    succeeded_items + failed_items <= total_items
  ),
  CONSTRAINT order_batch_jobs_completion_check CHECK (
    (state IN ('COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED') AND completed_at IS NOT NULL) OR
    (state IN ('PENDING', 'RUNNING') AND completed_at IS NULL)
  ),
  CONSTRAINT order_batch_jobs_version_check CHECK (version >= 1),
  CONSTRAINT order_batch_jobs_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT order_batch_jobs_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT order_batch_jobs_number_unique UNIQUE (tenant_id, batch_number),
  CONSTRAINT order_batch_jobs_idempotency_unique UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT order_batch_jobs_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE order_batch_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  batch_job_id text NOT NULL,
  item_number integer NOT NULL,
  item_key text NOT NULL,
  source_order_id text NOT NULL,
  outcome text NOT NULL DEFAULT 'PENDING',
  result_order_id text,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_batch_items_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT order_batch_items_number_check CHECK (item_number >= 1),
  CONSTRAINT order_batch_items_key_check CHECK (length(btrim(item_key)) BETWEEN 1 AND 200),
  CONSTRAINT order_batch_items_outcome_check CHECK (
    outcome IN ('PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED')
  ),
  CONSTRAINT order_batch_items_result_check CHECK (
    (outcome = 'PENDING' AND result_order_id IS NULL AND error_code IS NULL) OR
    (outcome = 'SUCCEEDED' AND result_order_id IS NOT NULL AND error_code IS NULL) OR
    (outcome IN ('FAILED', 'SKIPPED') AND result_order_id IS NULL AND error_code IS NOT NULL)
  ),
  CONSTRAINT order_batch_items_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT order_batch_items_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT order_batch_items_number_unique UNIQUE (tenant_id, batch_job_id, item_number),
  CONSTRAINT order_batch_items_key_unique UNIQUE (tenant_id, batch_job_id, item_key),
  CONSTRAINT order_batch_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT order_batch_items_job_fk FOREIGN KEY (tenant_id, batch_job_id)
    REFERENCES order_batch_jobs (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT order_batch_items_source_order_fk FOREIGN KEY (tenant_id, source_order_id)
    REFERENCES orders (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT order_batch_items_result_order_fk FOREIGN KEY (tenant_id, result_order_id)
    REFERENCES orders (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE waybills (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  waybill_number text NOT NULL,
  tracking_number text NOT NULL,
  order_id text NOT NULL,
  state text NOT NULL DEFAULT 'DRAFT',
  idempotency_key text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waybills_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT waybills_number_check CHECK (length(btrim(waybill_number)) BETWEEN 1 AND 100),
  CONSTRAINT waybills_tracking_check CHECK (length(btrim(tracking_number)) BETWEEN 1 AND 100),
  CONSTRAINT waybills_state_check CHECK (
    state IN ('DRAFT', 'ISSUED', 'IN_TRANSIT', 'DELIVERED', 'VOID')
  ),
  CONSTRAINT waybills_issue_check CHECK (
    (state = 'DRAFT' AND issued_at IS NULL) OR (state <> 'DRAFT' AND issued_at IS NOT NULL)
  ),
  CONSTRAINT waybills_version_check CHECK (version >= 1),
  CONSTRAINT waybills_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT waybills_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT waybills_tenant_number_unique UNIQUE (tenant_id, waybill_number),
  CONSTRAINT waybills_tenant_tracking_unique UNIQUE (tenant_id, tracking_number),
  CONSTRAINT waybills_tenant_idempotency_unique UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT waybills_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT waybills_order_fk FOREIGN KEY (tenant_id, order_id)
    REFERENCES orders (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE waybill_packages (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  waybill_id text NOT NULL,
  package_number integer NOT NULL,
  tracking_number text,
  actual_weight_grams bigint NOT NULL,
  length_mm bigint NOT NULL,
  width_mm bigint NOT NULL,
  height_mm bigint NOT NULL,
  state text NOT NULL DEFAULT 'PLANNED',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waybill_packages_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT waybill_packages_number_check CHECK (package_number >= 1),
  CONSTRAINT waybill_packages_tracking_check CHECK (
    tracking_number IS NULL OR length(btrim(tracking_number)) BETWEEN 1 AND 100
  ),
  CONSTRAINT waybill_packages_measurements_check CHECK (
    actual_weight_grams > 0 AND length_mm > 0 AND width_mm > 0 AND height_mm > 0
  ),
  CONSTRAINT waybill_packages_state_check CHECK (state IN ('PLANNED', 'LABELLED', 'VOID')),
  CONSTRAINT waybill_packages_version_check CHECK (version >= 1),
  CONSTRAINT waybill_packages_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT waybill_packages_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT waybill_packages_number_unique UNIQUE (tenant_id, waybill_id, package_number),
  CONSTRAINT waybill_packages_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT waybill_packages_waybill_fk FOREIGN KEY (tenant_id, waybill_id)
    REFERENCES waybills (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE UNIQUE INDEX waybill_packages_tenant_tracking_unique
  ON waybill_packages (tenant_id, tracking_number) WHERE tracking_number IS NOT NULL;

CREATE TABLE customs_declarations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  waybill_id text NOT NULL,
  declaration_number text NOT NULL,
  incoterm text NOT NULL,
  currency text NOT NULL,
  total_value_minor bigint NOT NULL,
  state text NOT NULL DEFAULT 'DRAFT',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customs_declarations_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT customs_declarations_number_check CHECK (
    length(btrim(declaration_number)) BETWEEN 1 AND 100
  ),
  CONSTRAINT customs_declarations_incoterm_check CHECK (incoterm ~ '^[A-Z]{3}$'),
  CONSTRAINT customs_declarations_money_check CHECK (
    currency ~ '^[A-Z]{3}$' AND total_value_minor >= 0
  ),
  CONSTRAINT customs_declarations_state_check CHECK (
    state IN ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'VOID')
  ),
  CONSTRAINT customs_declarations_version_check CHECK (version >= 1),
  CONSTRAINT customs_declarations_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT customs_declarations_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT customs_declarations_number_unique UNIQUE (tenant_id, declaration_number),
  CONSTRAINT customs_declarations_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT customs_declarations_waybill_fk FOREIGN KEY (tenant_id, waybill_id)
    REFERENCES waybills (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE declaration_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  declaration_id text NOT NULL,
  line_number integer NOT NULL,
  description text NOT NULL,
  hs_code text NOT NULL,
  origin_country_code text NOT NULL,
  quantity integer NOT NULL,
  unit_value_minor bigint NOT NULL,
  currency text NOT NULL,
  net_weight_grams bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT declaration_items_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT declaration_items_line_check CHECK (line_number >= 1),
  CONSTRAINT declaration_items_description_check CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  CONSTRAINT declaration_items_hs_code_check CHECK (hs_code ~ '^[0-9]{6,12}$'),
  CONSTRAINT declaration_items_origin_check CHECK (origin_country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT declaration_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT declaration_items_money_check CHECK (
    currency ~ '^[A-Z]{3}$' AND unit_value_minor >= 0
  ),
  CONSTRAINT declaration_items_weight_check CHECK (net_weight_grams > 0),
  CONSTRAINT declaration_items_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT declaration_items_line_unique UNIQUE (tenant_id, declaration_id, line_number),
  CONSTRAINT declaration_items_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT declaration_items_declaration_fk FOREIGN KEY (tenant_id, declaration_id)
    REFERENCES customs_declarations (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE import_jobs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  import_number text NOT NULL,
  import_type text NOT NULL,
  source_object_key text NOT NULL,
  source_sha256 text NOT NULL,
  state text NOT NULL DEFAULT 'UPLOADED',
  idempotency_key text NOT NULL,
  rollback_of_job_id text,
  total_rows integer NOT NULL DEFAULT 0,
  succeeded_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  version bigint NOT NULL DEFAULT 1,
  committed_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_jobs_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT import_jobs_number_check CHECK (length(btrim(import_number)) BETWEEN 1 AND 100),
  CONSTRAINT import_jobs_type_check CHECK (import_type IN ('ORDERS', 'WAYBILLS')),
  CONSTRAINT import_jobs_source_check CHECK (
    length(btrim(source_object_key)) >= 1 AND source_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT import_jobs_state_check CHECK (
    state IN (
      'UPLOADED', 'VALIDATING', 'READY', 'COMMITTING', 'COMMITTED',
      'COMMIT_FAILED', 'ROLLING_BACK', 'ROLLED_BACK', 'ROLLBACK_FAILED'
    )
  ),
  CONSTRAINT import_jobs_counts_check CHECK (
    total_rows >= 0 AND succeeded_rows >= 0 AND failed_rows >= 0 AND
    succeeded_rows + failed_rows <= total_rows
  ),
  CONSTRAINT import_jobs_commit_check CHECK (
    (state IN ('COMMITTED', 'ROLLING_BACK', 'ROLLED_BACK', 'ROLLBACK_FAILED')
      AND committed_at IS NOT NULL)
    OR
    (state NOT IN ('COMMITTED', 'ROLLING_BACK', 'ROLLED_BACK', 'ROLLBACK_FAILED')
      AND committed_at IS NULL)
  ),
  CONSTRAINT import_jobs_rollback_check CHECK (
    (state = 'ROLLED_BACK' AND rolled_back_at IS NOT NULL) OR
    (state <> 'ROLLED_BACK' AND rolled_back_at IS NULL)
  ),
  CONSTRAINT import_jobs_version_check CHECK (version >= 1),
  CONSTRAINT import_jobs_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT import_jobs_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT import_jobs_number_unique UNIQUE (tenant_id, import_number),
  CONSTRAINT import_jobs_idempotency_unique UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT import_jobs_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT import_jobs_rollback_job_fk FOREIGN KEY (tenant_id, rollback_of_job_id)
    REFERENCES import_jobs (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT import_jobs_not_self_rollback_check CHECK (
    rollback_of_job_id IS NULL OR rollback_of_job_id <> id
  )
);

CREATE UNIQUE INDEX import_jobs_single_rollback_unique
  ON import_jobs (tenant_id, rollback_of_job_id) WHERE rollback_of_job_id IS NOT NULL;

CREATE FUNCTION validate_import_rollback_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  original_type text;
  original_state text;
  original_rollback_of_job_id text;
BEGIN
  IF NEW.rollback_of_job_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT import_type, state, rollback_of_job_id
    INTO original_type, original_state, original_rollback_of_job_id
  FROM import_jobs
  WHERE tenant_id = NEW.tenant_id AND id = NEW.rollback_of_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rollback target does not exist in the tenant'
      USING ERRCODE = '23503';
  END IF;
  IF original_rollback_of_job_id IS NOT NULL THEN
    RAISE EXCEPTION 'a rollback job cannot itself be rolled back'
      USING ERRCODE = '23514';
  END IF;
  IF original_state <> 'COMMITTED' THEN
    RAISE EXCEPTION 'only a committed import job can be rolled back'
      USING ERRCODE = '23514';
  END IF;
  IF original_type <> NEW.import_type THEN
    RAISE EXCEPTION 'rollback import type must match its original job'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER import_jobs_rollback_validate_insert
BEFORE INSERT ON import_jobs
FOR EACH ROW EXECUTE FUNCTION validate_import_rollback_job();

CREATE TRIGGER import_jobs_rollback_validate_update
BEFORE UPDATE OF tenant_id, rollback_of_job_id, import_type ON import_jobs
FOR EACH ROW EXECUTE FUNCTION validate_import_rollback_job();

CREATE TABLE import_rows (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  import_job_id text NOT NULL,
  row_number integer NOT NULL,
  source_fingerprint text NOT NULL,
  input_payload jsonb NOT NULL,
  validation_status text NOT NULL DEFAULT 'PENDING',
  commit_status text NOT NULL DEFAULT 'NOT_ATTEMPTED',
  rollback_status text NOT NULL DEFAULT 'NOT_REQUIRED',
  result_code text,
  result_message text,
  created_order_id text,
  created_waybill_id text,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_rows_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT import_rows_number_check CHECK (row_number >= 1),
  CONSTRAINT import_rows_fingerprint_check CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT import_rows_payload_check CHECK (jsonb_typeof(input_payload) = 'object'),
  CONSTRAINT import_rows_validation_status_check CHECK (
    validation_status IN ('PENDING', 'VALID', 'INVALID')
  ),
  CONSTRAINT import_rows_commit_status_check CHECK (
    commit_status IN ('NOT_ATTEMPTED', 'APPLIED', 'FAILED', 'SKIPPED')
  ),
  CONSTRAINT import_rows_rollback_status_check CHECK (
    rollback_status IN ('NOT_REQUIRED', 'PENDING', 'ROLLED_BACK', 'FAILED')
  ),
  CONSTRAINT import_rows_result_check CHECK (
    (commit_status IN ('APPLIED', 'FAILED', 'SKIPPED') AND result_code IS NOT NULL)
    OR
    (commit_status = 'NOT_ATTEMPTED' AND result_code IS NULL)
  ),
  CONSTRAINT import_rows_applied_check CHECK (
    (commit_status = 'APPLIED' AND applied_at IS NOT NULL
      AND num_nonnulls(created_order_id, created_waybill_id) = 1)
    OR
    (commit_status <> 'APPLIED' AND applied_at IS NULL
      AND created_order_id IS NULL AND created_waybill_id IS NULL)
  ),
  CONSTRAINT import_rows_rollback_shape_check CHECK (
    (
      commit_status = 'APPLIED' AND (
        (rollback_status = 'ROLLED_BACK' AND rolled_back_at IS NOT NULL) OR
        (rollback_status IN ('NOT_REQUIRED', 'PENDING', 'FAILED') AND rolled_back_at IS NULL)
      )
    ) OR (
      commit_status <> 'APPLIED' AND
      rollback_status = 'NOT_REQUIRED' AND
      rolled_back_at IS NULL
    )
  ),
  CONSTRAINT import_rows_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT import_rows_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT import_rows_number_unique UNIQUE (tenant_id, import_job_id, row_number),
  CONSTRAINT import_rows_fingerprint_unique UNIQUE (
    tenant_id, import_job_id, source_fingerprint
  ),
  CONSTRAINT import_rows_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT import_rows_job_fk FOREIGN KEY (tenant_id, import_job_id)
    REFERENCES import_jobs (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT import_rows_order_fk FOREIGN KEY (tenant_id, created_order_id)
    REFERENCES orders (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT import_rows_waybill_fk FOREIGN KEY (tenant_id, created_waybill_id)
    REFERENCES waybills (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE attachments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  object_key text NOT NULL,
  file_name text NOT NULL,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  category text NOT NULL,
  order_id text,
  waybill_id text,
  import_job_id text,
  state text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attachments_id_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT attachments_object_key_check CHECK (length(btrim(object_key)) >= 1),
  CONSTRAINT attachments_file_name_check CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
  CONSTRAINT attachments_media_type_check CHECK (media_type ~ '^[^/]+/[^/]+$'),
  CONSTRAINT attachments_size_check CHECK (size_bytes > 0),
  CONSTRAINT attachments_sha256_check CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT attachments_category_check CHECK (
    category IN ('LABEL', 'COMMERCIAL_INVOICE', 'CUSTOMS_DOCUMENT', 'IMPORT_SOURCE', 'OTHER')
  ),
  CONSTRAINT attachments_owner_check CHECK (num_nonnulls(order_id, waybill_id, import_job_id) = 1),
  CONSTRAINT attachments_state_check CHECK (state IN ('ACTIVE', 'DELETED')),
  CONSTRAINT attachments_version_check CHECK (version >= 1),
  CONSTRAINT attachments_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT attachments_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT attachments_object_key_unique UNIQUE (tenant_id, object_key),
  CONSTRAINT attachments_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants (id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT attachments_order_fk FOREIGN KEY (tenant_id, order_id)
    REFERENCES orders (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT attachments_waybill_fk FOREIGN KEY (tenant_id, waybill_id)
    REFERENCES waybills (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT attachments_import_job_fk FOREIGN KEY (tenant_id, import_job_id)
    REFERENCES import_jobs (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX shipping_channels_cursor_idx ON shipping_channels (tenant_id, created_at, id);
CREATE INDEX rate_cards_cursor_idx ON rate_cards (tenant_id, created_at, id);
CREATE INDEX rate_card_versions_cursor_idx ON rate_card_versions (tenant_id, created_at, id);
CREATE INDEX rate_rules_cursor_idx ON rate_rules (tenant_id, created_at, id);
CREATE INDEX quotes_cursor_idx ON quotes (tenant_id, created_at, id);
CREATE INDEX quote_versions_cursor_idx ON quote_versions (tenant_id, created_at, id);
CREATE INDEX quote_parcels_cursor_idx ON quote_parcels (tenant_id, created_at, id);
CREATE INDEX quote_options_cursor_idx ON quote_options (tenant_id, created_at, id);
CREATE INDEX quote_charge_lines_cursor_idx ON quote_charge_lines (tenant_id, created_at, id);
CREATE INDEX quote_explanations_cursor_idx ON quote_explanations (tenant_id, created_at, id);
CREATE INDEX quote_acceptances_cursor_idx ON quote_acceptances (tenant_id, created_at, id);
CREATE INDEX orders_cursor_idx ON orders (tenant_id, created_at, id);
CREATE INDEX order_batch_jobs_cursor_idx ON order_batch_jobs (tenant_id, created_at, id);
CREATE INDEX order_batch_items_cursor_idx ON order_batch_items (tenant_id, created_at, id);
CREATE INDEX waybills_cursor_idx ON waybills (tenant_id, created_at, id);
CREATE INDEX waybill_packages_cursor_idx ON waybill_packages (tenant_id, created_at, id);
CREATE INDEX customs_declarations_cursor_idx ON customs_declarations (tenant_id, created_at, id);
CREATE INDEX declaration_items_cursor_idx ON declaration_items (tenant_id, created_at, id);
CREATE INDEX import_jobs_cursor_idx ON import_jobs (tenant_id, created_at, id);
CREATE INDEX import_rows_cursor_idx ON import_rows (tenant_id, created_at, id);
CREATE INDEX attachments_cursor_idx ON attachments (tenant_id, created_at, id);

CREATE FUNCTION prevent_quote_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER quote_versions_immutable
BEFORE UPDATE OR DELETE ON quote_versions
FOR EACH ROW EXECUTE FUNCTION prevent_quote_snapshot_mutation();
CREATE TRIGGER quote_parcels_immutable
BEFORE UPDATE OR DELETE ON quote_parcels
FOR EACH ROW EXECUTE FUNCTION prevent_quote_snapshot_mutation();
CREATE TRIGGER quote_options_immutable
BEFORE UPDATE OR DELETE ON quote_options
FOR EACH ROW EXECUTE FUNCTION prevent_quote_snapshot_mutation();
CREATE TRIGGER quote_charge_lines_immutable
BEFORE UPDATE OR DELETE ON quote_charge_lines
FOR EACH ROW EXECUTE FUNCTION prevent_quote_snapshot_mutation();
CREATE TRIGGER quote_explanations_immutable
BEFORE UPDATE OR DELETE ON quote_explanations
FOR EACH ROW EXECUTE FUNCTION prevent_quote_snapshot_mutation();
CREATE TRIGGER quote_acceptances_immutable
BEFORE UPDATE OR DELETE ON quote_acceptances
FOR EACH ROW EXECUTE FUNCTION prevent_quote_snapshot_mutation();

CREATE FUNCTION validate_quote_acceptance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  quote_row quotes%ROWTYPE;
  quote_valid_until timestamptz;
  quote_option_state text;
  charge_total bigint;
  charge_count bigint;
BEGIN
  SELECT * INTO quote_row
  FROM quotes
  WHERE tenant_id = NEW.tenant_id AND id = NEW.quote_id
  FOR UPDATE;

  IF quote_row.state <> 'ACCEPTED'
     OR quote_row.accepted_quote_version_id <> NEW.quote_version_id
     OR quote_row.accepted_quote_option_id <> NEW.quote_option_id THEN
    RAISE EXCEPTION 'quote must point to the accepted version and option'
      USING ERRCODE = '23514';
  END IF;

  SELECT valid_until INTO quote_valid_until
  FROM quote_versions
  WHERE tenant_id = NEW.tenant_id
    AND id = NEW.quote_version_id
    AND quote_id = NEW.quote_id;
  IF quote_valid_until <= NEW.accepted_at THEN
    RAISE EXCEPTION 'quote version expired at %', quote_valid_until
      USING ERRCODE = '23514';
  END IF;

  SELECT state INTO quote_option_state
  FROM quote_options
  WHERE tenant_id = NEW.tenant_id
    AND id = NEW.quote_option_id
    AND quote_version_id = NEW.quote_version_id
    AND quote_id = NEW.quote_id;
  IF quote_option_state <> 'OFFERED' THEN
    RAISE EXCEPTION 'only offered quote options can be accepted'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*), coalesce(sum(amount_minor), 0)
    INTO charge_count, charge_total
  FROM quote_charge_lines
  WHERE tenant_id = NEW.tenant_id AND quote_option_id = NEW.quote_option_id;
  IF charge_count = 0 OR charge_total <> NEW.total_amount_minor THEN
    RAISE EXCEPTION 'quote option total % does not equal charge lines total %',
      NEW.total_amount_minor, charge_total USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER quote_acceptances_validate
BEFORE INSERT ON quote_acceptances
FOR EACH ROW EXECUTE FUNCTION validate_quote_acceptance();

CREATE FUNCTION prevent_accepted_quote_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM quote_acceptances
    WHERE tenant_id = OLD.tenant_id AND quote_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'accepted quotes are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER quotes_accepted_immutable
BEFORE UPDATE OR DELETE ON quotes
FOR EACH ROW EXECUTE FUNCTION prevent_accepted_quote_mutation();

DO $$
DECLARE
  table_name text;
  tenant_tables constant text[] := ARRAY[
    'shipping_channels', 'rate_cards', 'rate_card_versions', 'rate_rules',
    'quotes', 'quote_versions', 'quote_parcels', 'quote_options',
    'quote_charge_lines', 'quote_explanations', 'quote_acceptances',
    'orders', 'order_batch_jobs', 'order_batch_items', 'waybills',
    'waybill_packages', 'customs_declarations', 'declaration_items',
    'attachments', 'import_jobs', 'import_rows'
  ];
BEGIN
  FOREACH table_name IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO zhili_app '
      || 'USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')) '
      || 'WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))',
      table_name || '_tenant_isolation', table_name
    );
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  shipping_channels,
  rate_cards,
  rate_card_versions,
  rate_rules,
  quotes,
  quote_versions,
  quote_parcels,
  quote_options,
  quote_charge_lines,
  quote_explanations,
  quote_acceptances,
  orders,
  order_batch_jobs,
  order_batch_items,
  waybills,
  waybill_packages,
  customs_declarations,
  declaration_items,
  attachments,
  import_jobs,
  import_rows
TO zhili_app;
