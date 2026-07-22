DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zhili_app') THEN
    CREATE ROLE zhili_app
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  ELSE
    ALTER ROLE zhili_app
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

CREATE TABLE idempotency_records (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  response_status integer,
  response_headers jsonb,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT idempotency_records_id_ulid_check
    CHECK (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  CONSTRAINT idempotency_records_tenant_ulid_check
    CHECK (tenant_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  CONSTRAINT idempotency_records_request_hash_check
    CHECK (length(request_hash) = 64),
  CONSTRAINT idempotency_records_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT idempotency_records_tenant_key_unique
    UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX idempotency_records_expiry_idx ON idempotency_records (expires_at);

CREATE TABLE outbox_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  aggregate_version bigint NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  dedupe_key text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  CONSTRAINT outbox_events_id_ulid_check
    CHECK (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  CONSTRAINT outbox_events_tenant_ulid_check
    CHECK (tenant_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  CONSTRAINT outbox_events_aggregate_version_check
    CHECK (aggregate_version >= 0),
  CONSTRAINT outbox_events_attempts_check
    CHECK (attempts >= 0),
  CONSTRAINT outbox_events_tenant_dedupe_unique
    UNIQUE (tenant_id, dedupe_key)
);

CREATE INDEX outbox_events_pending_idx ON outbox_events (published_at, occurred_at);
CREATE INDEX outbox_events_aggregate_idx
  ON outbox_events (tenant_id, aggregate_type, aggregate_id, aggregate_version);

CREATE TABLE audit_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  subject_id text NOT NULL,
  request_id text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_events_id_ulid_check
    CHECK (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  CONSTRAINT audit_events_tenant_ulid_check
    CHECK (tenant_id ~ '^[0-9A-HJKMNP-TV-Z]{26}$')
);

CREATE INDEX audit_events_entity_idx
  ON audit_events (tenant_id, entity_type, entity_id, occurred_at);

ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY idempotency_records_tenant_isolation ON idempotency_records
  AS PERMISSIVE
  FOR ALL
  TO zhili_app
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));

CREATE POLICY outbox_events_tenant_isolation ON outbox_events
  AS PERMISSIVE
  FOR ALL
  TO zhili_app
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));

CREATE POLICY audit_events_tenant_isolation ON audit_events
  AS PERMISSIVE
  FOR ALL
  TO zhili_app
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), ''))
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), ''));

CREATE FUNCTION prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER audit_events_immutable_update
BEFORE UPDATE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

CREATE TRIGGER audit_events_immutable_delete
BEFORE DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();

GRANT USAGE ON SCHEMA public TO zhili_app;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON idempotency_records, outbox_events, audit_events
  TO zhili_app;
