-- B1 Phase A proposal: identity and master data.
-- Execute after packages/db/migrations/0000_foundation.sql.
-- This proposal intentionally contains PostgreSQL DDL only; the root integration branch owns
-- Drizzle schema generation and the ordered B1 migration.

CREATE TABLE tenants (
  id text PRIMARY KEY,
  slug text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT tenants_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  CONSTRAINT tenants_slug_unique UNIQUE (slug),
  CONSTRAINT tenants_display_name_check CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  CONSTRAINT tenants_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  CONSTRAINT tenants_version_check CHECK (version >= 0),
  CONSTRAINT tenants_timestamps_check CHECK (updated_at >= created_at)
);

CREATE TABLE organizations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  parent_organization_id text,
  code text NOT NULL,
  display_name text NOT NULL,
  organization_type text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT organizations_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT organizations_code_check CHECK (length(btrim(code)) BETWEEN 1 AND 64),
  CONSTRAINT organizations_display_name_check CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  CONSTRAINT organizations_type_check CHECK (organization_type IN ('TENANT_ROOT', 'BUSINESS_UNIT', 'BRANCH', 'PARTNER')),
  CONSTRAINT organizations_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT organizations_version_check CHECK (version >= 0),
  CONSTRAINT organizations_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT organizations_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT organizations_tenant_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT organizations_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT organizations_parent_fk FOREIGN KEY (tenant_id, parent_organization_id)
    REFERENCES organizations (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE warehouses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text NOT NULL,
  code text NOT NULL,
  display_name text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Shanghai',
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouses_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT warehouses_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT warehouses_code_check CHECK (length(btrim(code)) BETWEEN 1 AND 64),
  CONSTRAINT warehouses_display_name_check CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  CONSTRAINT warehouses_timezone_check CHECK (length(btrim(timezone)) BETWEEN 1 AND 64),
  CONSTRAINT warehouses_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT warehouses_version_check CHECK (version >= 0),
  CONSTRAINT warehouses_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT warehouses_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT warehouses_tenant_code_unique UNIQUE (tenant_id, code),
  CONSTRAINT warehouses_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT warehouses_organization_fk FOREIGN KEY (tenant_id, organization_id)
    REFERENCES organizations (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE users (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text,
  login_name_normalized text NOT NULL,
  email_normalized text,
  display_name text NOT NULL,
  password_hash text,
  status text NOT NULL DEFAULT 'INVITED',
  password_changed_at timestamptz,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT users_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT users_login_name_check CHECK (
    login_name_normalized = lower(btrim(login_name_normalized))
    AND length(login_name_normalized) BETWEEN 3 AND 128
  ),
  CONSTRAINT users_email_check CHECK (
    email_normalized IS NULL
    OR (email_normalized = lower(btrim(email_normalized)) AND position('@' IN email_normalized) > 1)
  ),
  CONSTRAINT users_display_name_check CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  CONSTRAINT users_password_hash_check CHECK (
    password_hash IS NULL OR password_hash LIKE '$argon2id$%'
  ),
  CONSTRAINT users_status_check CHECK (status IN ('INVITED', 'ACTIVE', 'LOCKED', 'DISABLED')),
  CONSTRAINT users_version_check CHECK (version >= 0),
  CONSTRAINT users_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT users_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT users_tenant_login_unique UNIQUE (tenant_id, login_name_normalized),
  CONSTRAINT users_tenant_email_unique UNIQUE (tenant_id, email_normalized),
  CONSTRAINT users_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT users_organization_fk FOREIGN KEY (tenant_id, organization_id)
    REFERENCES organizations (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

COMMENT ON COLUMN users.password_hash IS
  'Encoded Argon2id verifier only. Raw passwords are never persisted.';

CREATE TABLE customers (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  organization_id text,
  customer_number text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT customers_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT customers_number_check CHECK (length(btrim(customer_number)) BETWEEN 1 AND 64),
  CONSTRAINT customers_display_name_check CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  CONSTRAINT customers_status_check CHECK (status IN ('ACTIVE', 'ON_HOLD', 'INACTIVE')),
  CONSTRAINT customers_version_check CHECK (version >= 0),
  CONSTRAINT customers_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT customers_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT customers_tenant_number_unique UNIQUE (tenant_id, customer_number),
  CONSTRAINT customers_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT customers_organization_fk FOREIGN KEY (tenant_id, organization_id)
    REFERENCES organizations (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE customer_addresses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  customer_id text NOT NULL,
  address_code text NOT NULL,
  address_type text NOT NULL,
  contact_name text NOT NULL,
  contact_phone text,
  country_code text NOT NULL,
  region text,
  city text NOT NULL,
  postal_code text,
  line1 text NOT NULL,
  line2 text,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_addresses_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT customer_addresses_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT customer_addresses_code_check CHECK (length(btrim(address_code)) BETWEEN 1 AND 64),
  CONSTRAINT customer_addresses_type_check CHECK (address_type IN ('BILLING', 'PICKUP', 'DELIVERY', 'RETURN')),
  CONSTRAINT customer_addresses_contact_check CHECK (length(btrim(contact_name)) BETWEEN 1 AND 160),
  CONSTRAINT customer_addresses_country_check CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT customer_addresses_city_check CHECK (length(btrim(city)) BETWEEN 1 AND 120),
  CONSTRAINT customer_addresses_line1_check CHECK (length(btrim(line1)) BETWEEN 1 AND 240),
  CONSTRAINT customer_addresses_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT customer_addresses_version_check CHECK (version >= 0),
  CONSTRAINT customer_addresses_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT customer_addresses_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT customer_addresses_customer_code_unique UNIQUE (tenant_id, customer_id, address_code),
  CONSTRAINT customer_addresses_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT customer_addresses_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE permission_actions (
  action_code text PRIMARY KEY,
  resource_type text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permission_actions_code_check CHECK (
    action_code ~ '^[a-z][a-z0-9_-]{1,63}:[a-z][a-z0-9_-]{1,63}$'
  ),
  CONSTRAINT permission_actions_resource_check CHECK (resource_type ~ '^[a-z][a-z0-9_-]{1,63}$'),
  CONSTRAINT permission_actions_description_check CHECK (length(btrim(description)) BETWEEN 1 AND 240)
);

CREATE TABLE roles (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  role_code text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roles_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT roles_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT roles_code_check CHECK (length(btrim(role_code)) BETWEEN 1 AND 64),
  CONSTRAINT roles_display_name_check CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  CONSTRAINT roles_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT roles_version_check CHECK (version >= 0),
  CONSTRAINT roles_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT roles_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT roles_tenant_code_unique UNIQUE (tenant_id, role_code),
  CONSTRAINT roles_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE role_grants (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  role_id text NOT NULL,
  action_code text NOT NULL,
  effect text NOT NULL DEFAULT 'ALLOW',
  data_scope_kind text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_grants_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT role_grants_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT role_grants_effect_check CHECK (effect IN ('ALLOW', 'DENY')),
  CONSTRAINT role_grants_data_scope_check CHECK (
    data_scope_kind IN ('TENANT', 'ORGANIZATION', 'CUSTOMER', 'WAREHOUSE', 'SELF')
  ),
  CONSTRAINT role_grants_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT role_grants_version_check CHECK (version >= 0),
  CONSTRAINT role_grants_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT role_grants_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT role_grants_role_action_scope_unique UNIQUE (
    tenant_id, role_id, action_code, effect, data_scope_kind
  ),
  CONSTRAINT role_grants_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT role_grants_role_fk FOREIGN KEY (tenant_id, role_id)
    REFERENCES roles (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT role_grants_action_fk FOREIGN KEY (action_code)
    REFERENCES permission_actions (action_code) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE role_grant_organization_scopes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  grant_id text NOT NULL,
  organization_id text NOT NULL,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_grant_organization_scopes_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT role_grant_organization_scopes_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT role_grant_organization_scopes_version_check CHECK (version >= 0),
  CONSTRAINT role_grant_organization_scopes_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT role_grant_organization_scopes_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT role_grant_organization_scopes_unique UNIQUE (tenant_id, grant_id, organization_id),
  CONSTRAINT role_grant_organization_scopes_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT role_grant_organization_scopes_grant_fk FOREIGN KEY (tenant_id, grant_id)
    REFERENCES role_grants (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT role_grant_organization_scopes_organization_fk FOREIGN KEY (tenant_id, organization_id)
    REFERENCES organizations (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE role_grant_customer_scopes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  grant_id text NOT NULL,
  customer_id text NOT NULL,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_grant_customer_scopes_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT role_grant_customer_scopes_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT role_grant_customer_scopes_version_check CHECK (version >= 0),
  CONSTRAINT role_grant_customer_scopes_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT role_grant_customer_scopes_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT role_grant_customer_scopes_unique UNIQUE (tenant_id, grant_id, customer_id),
  CONSTRAINT role_grant_customer_scopes_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT role_grant_customer_scopes_grant_fk FOREIGN KEY (tenant_id, grant_id)
    REFERENCES role_grants (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT role_grant_customer_scopes_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE role_grant_warehouse_scopes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  grant_id text NOT NULL,
  warehouse_id text NOT NULL,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_grant_warehouse_scopes_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT role_grant_warehouse_scopes_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT role_grant_warehouse_scopes_version_check CHECK (version >= 0),
  CONSTRAINT role_grant_warehouse_scopes_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT role_grant_warehouse_scopes_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT role_grant_warehouse_scopes_unique UNIQUE (tenant_id, grant_id, warehouse_id),
  CONSTRAINT role_grant_warehouse_scopes_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT role_grant_warehouse_scopes_grant_fk FOREIGN KEY (tenant_id, grant_id)
    REFERENCES role_grants (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT role_grant_warehouse_scopes_warehouse_fk FOREIGN KEY (tenant_id, warehouse_id)
    REFERENCES warehouses (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE role_grant_field_policies (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  grant_id text NOT NULL,
  field_path text NOT NULL,
  access_level text NOT NULL,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_grant_field_policies_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT role_grant_field_policies_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT role_grant_field_policies_field_path_check CHECK (
    field_path ~ '^[A-Za-z][A-Za-z0-9_.]{0,159}$'
  ),
  CONSTRAINT role_grant_field_policies_access_check CHECK (access_level IN ('READ', 'MASK', 'DENY')),
  CONSTRAINT role_grant_field_policies_version_check CHECK (version >= 0),
  CONSTRAINT role_grant_field_policies_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT role_grant_field_policies_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT role_grant_field_policies_unique UNIQUE (tenant_id, grant_id, field_path),
  CONSTRAINT role_grant_field_policies_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT role_grant_field_policies_grant_fk FOREIGN KEY (tenant_id, grant_id)
    REFERENCES role_grants (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE user_role_assignments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  role_id text NOT NULL,
  assigned_by_user_id text,
  status text NOT NULL DEFAULT 'ACTIVE',
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_role_assignments_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT user_role_assignments_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT user_role_assignments_status_check CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  CONSTRAINT user_role_assignments_validity_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT user_role_assignments_version_check CHECK (version >= 0),
  CONSTRAINT user_role_assignments_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT user_role_assignments_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT user_role_assignments_user_role_unique UNIQUE (tenant_id, user_id, role_id, valid_from),
  CONSTRAINT user_role_assignments_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT user_role_assignments_user_fk FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT user_role_assignments_role_fk FOREIGN KEY (tenant_id, role_id)
    REFERENCES roles (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT user_role_assignments_assigner_fk FOREIGN KEY (tenant_id, assigned_by_user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  authentication_method text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  ip_address inet,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT sessions_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT sessions_auth_method_check CHECK (authentication_method IN ('PASSWORD', 'WECHAT', 'OIDC', 'DEVICE')),
  CONSTRAINT sessions_status_check CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  CONSTRAINT sessions_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT sessions_revocation_check CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL) OR (status <> 'REVOKED')
  ),
  CONSTRAINT sessions_version_check CHECK (version >= 0),
  CONSTRAINT sessions_timestamps_check CHECK (updated_at >= created_at AND last_seen_at >= created_at),
  CONSTRAINT sessions_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT sessions_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT sessions_user_fk FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE refresh_token_families (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  session_id text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  reuse_detected_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refresh_token_families_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT refresh_token_families_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT refresh_token_families_status_check CHECK (status IN ('ACTIVE', 'REVOKED', 'COMPROMISED')),
  CONSTRAINT refresh_token_families_reuse_check CHECK (
    (status = 'COMPROMISED' AND reuse_detected_at IS NOT NULL AND revoked_at IS NOT NULL)
    OR status <> 'COMPROMISED'
  ),
  CONSTRAINT refresh_token_families_revocation_check CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL) OR status <> 'REVOKED'
  ),
  CONSTRAINT refresh_token_families_version_check CHECK (version >= 0),
  CONSTRAINT refresh_token_families_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT refresh_token_families_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT refresh_token_families_session_unique UNIQUE (tenant_id, session_id),
  CONSTRAINT refresh_token_families_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT refresh_token_families_session_fk FOREIGN KEY (tenant_id, session_id)
    REFERENCES sessions (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE refresh_tokens (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  family_id text NOT NULL,
  parent_token_id text,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refresh_tokens_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT refresh_tokens_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT refresh_tokens_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT refresh_tokens_status_check CHECK (status IN ('ACTIVE', 'ROTATED', 'REVOKED', 'EXPIRED')),
  CONSTRAINT refresh_tokens_expiry_check CHECK (expires_at > issued_at),
  CONSTRAINT refresh_tokens_consumed_check CHECK (
    (status = 'ROTATED' AND consumed_at IS NOT NULL) OR status <> 'ROTATED'
  ),
  CONSTRAINT refresh_tokens_revoked_check CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL) OR status <> 'REVOKED'
  ),
  CONSTRAINT refresh_tokens_no_self_parent_check CHECK (
    parent_token_id IS NULL OR parent_token_id <> id
  ),
  CONSTRAINT refresh_tokens_version_check CHECK (version >= 0),
  CONSTRAINT refresh_tokens_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT refresh_tokens_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT refresh_tokens_family_id_id_unique UNIQUE (tenant_id, family_id, id),
  CONSTRAINT refresh_tokens_hash_unique UNIQUE (token_hash),
  CONSTRAINT refresh_tokens_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT refresh_tokens_family_fk FOREIGN KEY (tenant_id, family_id)
    REFERENCES refresh_token_families (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT refresh_tokens_parent_fk FOREIGN KEY (tenant_id, family_id, parent_token_id)
    REFERENCES refresh_tokens (tenant_id, family_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX refresh_tokens_one_successor_idx
  ON refresh_tokens (tenant_id, parent_token_id)
  WHERE parent_token_id IS NOT NULL;

COMMENT ON COLUMN refresh_tokens.token_hash IS
  'Keyed SHA-256 digest of a high-entropy refresh token. The bearer token is never persisted.';
COMMENT ON COLUMN refresh_tokens.parent_token_id IS
  'Rotation lineage. Reuse revokes the linked refresh_token_families row and all descendants.';

CREATE TABLE oauth_states (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  provider text NOT NULL,
  state_hash text NOT NULL,
  pkce_verifier_ciphertext bytea NOT NULL,
  encryption_key_version text NOT NULL,
  encryption_nonce bytea NOT NULL,
  redirect_uri text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_states_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT oauth_states_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT oauth_states_provider_check CHECK (provider IN ('WECHAT', 'OIDC')),
  CONSTRAINT oauth_states_state_hash_check CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT oauth_states_ciphertext_check CHECK (octet_length(pkce_verifier_ciphertext) >= 32),
  CONSTRAINT oauth_states_key_version_check CHECK (length(btrim(encryption_key_version)) BETWEEN 1 AND 64),
  CONSTRAINT oauth_states_nonce_check CHECK (octet_length(encryption_nonce) >= 12),
  CONSTRAINT oauth_states_redirect_check CHECK (redirect_uri ~ '^https://'),
  CONSTRAINT oauth_states_status_check CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED')),
  CONSTRAINT oauth_states_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT oauth_states_consumed_check CHECK (
    (status = 'CONSUMED' AND consumed_at IS NOT NULL) OR status <> 'CONSUMED'
  ),
  CONSTRAINT oauth_states_version_check CHECK (version >= 0),
  CONSTRAINT oauth_states_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT oauth_states_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT oauth_states_state_hash_unique UNIQUE (state_hash),
  CONSTRAINT oauth_states_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

COMMENT ON COLUMN oauth_states.state_hash IS
  'SHA-256 digest of the one-time OAuth state. Raw state is never persisted.';
COMMENT ON COLUMN oauth_states.pkce_verifier_ciphertext IS
  'Authenticated ciphertext only; encryption_nonce and encryption_key_version support key rotation.';

CREATE TABLE devices (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  device_code text NOT NULL,
  display_name text NOT NULL,
  platform text NOT NULL,
  credential_hash text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  last_seen_at timestamptz,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT devices_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT devices_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT devices_code_check CHECK (length(btrim(device_code)) BETWEEN 1 AND 96),
  CONSTRAINT devices_display_name_check CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  CONSTRAINT devices_platform_check CHECK (platform IN ('PDA_ANDROID', 'PDA_IOS', 'KIOSK', 'SCANNER')),
  CONSTRAINT devices_credential_hash_check CHECK (credential_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT devices_status_check CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED')),
  CONSTRAINT devices_version_check CHECK (version >= 0),
  CONSTRAINT devices_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT devices_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT devices_tenant_code_unique UNIQUE (tenant_id, device_code),
  CONSTRAINT devices_credential_hash_unique UNIQUE (credential_hash),
  CONSTRAINT devices_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

COMMENT ON COLUMN devices.credential_hash IS
  'Keyed SHA-256 credential digest. Raw enrollment and device secrets are never persisted.';

CREATE TABLE device_bindings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  device_id text NOT NULL,
  warehouse_id text NOT NULL,
  bound_by_user_id text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  bound_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_user_id text,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_bindings_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT device_bindings_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT device_bindings_status_check CHECK (status IN ('ACTIVE', 'REVOKED')),
  CONSTRAINT device_bindings_revocation_check CHECK (
    (status = 'REVOKED' AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
    OR status = 'ACTIVE'
  ),
  CONSTRAINT device_bindings_version_check CHECK (version >= 0),
  CONSTRAINT device_bindings_timestamps_check CHECK (updated_at >= created_at AND bound_at >= created_at),
  CONSTRAINT device_bindings_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT device_bindings_history_unique UNIQUE (tenant_id, device_id, warehouse_id, bound_at),
  CONSTRAINT device_bindings_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT device_bindings_device_fk FOREIGN KEY (tenant_id, device_id)
    REFERENCES devices (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT device_bindings_warehouse_fk FOREIGN KEY (tenant_id, warehouse_id)
    REFERENCES warehouses (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT device_bindings_bound_by_fk FOREIGN KEY (tenant_id, bound_by_user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT device_bindings_revoked_by_fk FOREIGN KEY (tenant_id, revoked_by_user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX device_bindings_one_active_device_idx
  ON device_bindings (tenant_id, device_id)
  WHERE status = 'ACTIVE';

CREATE TABLE device_tasks (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  warehouse_id text NOT NULL,
  assigned_device_id text,
  assigned_user_id text,
  task_type text NOT NULL,
  task_number text NOT NULL,
  status text NOT NULL DEFAULT 'READY',
  priority integer NOT NULL DEFAULT 0,
  task_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  available_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  completed_at timestamptz,
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT device_tasks_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT device_tasks_tenant_id_ulid_check CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT device_tasks_type_check CHECK (task_type IN ('RECEIVE', 'PUTAWAY', 'PICK', 'LOAD', 'DELIVER', 'COUNT')),
  CONSTRAINT device_tasks_number_check CHECK (length(btrim(task_number)) BETWEEN 1 AND 96),
  CONSTRAINT device_tasks_status_check CHECK (status IN ('READY', 'CLAIMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT device_tasks_priority_check CHECK (priority BETWEEN -100 AND 100),
  CONSTRAINT device_tasks_payload_check CHECK (jsonb_typeof(task_payload) = 'object'),
  CONSTRAINT device_tasks_due_check CHECK (due_at IS NULL OR due_at >= available_at),
  CONSTRAINT device_tasks_completion_check CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL) OR status <> 'COMPLETED'
  ),
  CONSTRAINT device_tasks_version_check CHECK (version >= 0),
  CONSTRAINT device_tasks_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT device_tasks_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT device_tasks_tenant_number_unique UNIQUE (tenant_id, task_number),
  CONSTRAINT device_tasks_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT device_tasks_warehouse_fk FOREIGN KEY (tenant_id, warehouse_id)
    REFERENCES warehouses (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT device_tasks_device_fk FOREIGN KEY (tenant_id, assigned_device_id)
    REFERENCES devices (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT device_tasks_user_fk FOREIGN KEY (tenant_id, assigned_user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX organizations_parent_idx ON organizations (tenant_id, parent_organization_id);
CREATE INDEX warehouses_organization_idx ON warehouses (tenant_id, organization_id);
CREATE INDEX customer_addresses_customer_idx ON customer_addresses (tenant_id, customer_id, status);
CREATE INDEX role_grants_role_idx ON role_grants (tenant_id, role_id, status);
CREATE INDEX user_role_assignments_active_idx
  ON user_role_assignments (tenant_id, user_id, role_id)
  WHERE status = 'ACTIVE';
CREATE INDEX sessions_active_user_idx ON sessions (tenant_id, user_id, expires_at) WHERE status = 'ACTIVE';
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (tenant_id, family_id, issued_at);
CREATE INDEX oauth_states_pending_idx ON oauth_states (tenant_id, provider, expires_at) WHERE status = 'PENDING';
CREATE INDEX device_tasks_queue_idx
  ON device_tasks (tenant_id, assigned_device_id, status, priority DESC, available_at, id);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses FORCE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
ALTER TABLE role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE role_grant_organization_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_grant_organization_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE role_grant_customer_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_grant_customer_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE role_grant_warehouse_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_grant_warehouse_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE role_grant_field_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_grant_field_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_token_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_token_families FORCE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_states FORCE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;
ALTER TABLE device_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE device_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_tenant_isolation ON tenants
  AS PERMISSIVE
  FOR ALL
  TO zhili_app
  USING (id = nullif(current_setting('app.tenant_id', true), ''))
  WITH CHECK (id = nullif(current_setting('app.tenant_id', true), ''));

DO $policy$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations',
    'warehouses',
    'users',
    'customers',
    'customer_addresses',
    'roles',
    'role_grants',
    'role_grant_organization_scopes',
    'role_grant_customer_scopes',
    'role_grant_warehouse_scopes',
    'role_grant_field_policies',
    'user_role_assignments',
    'sessions',
    'refresh_token_families',
    'refresh_tokens',
    'oauth_states',
    'devices',
    'device_bindings',
    'device_tasks'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO zhili_app '
      || 'USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')) '
      || 'WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))',
      table_name || '_tenant_isolation',
      table_name
    );
  END LOOP;
END
$policy$;

GRANT SELECT ON tenants, permission_actions TO zhili_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  organizations,
  warehouses,
  users,
  customers,
  customer_addresses,
  roles,
  role_grants,
  role_grant_organization_scopes,
  role_grant_customer_scopes,
  role_grant_warehouse_scopes,
  role_grant_field_policies,
  user_role_assignments,
  sessions,
  refresh_token_families,
  refresh_tokens,
  oauth_states,
  devices,
  device_bindings,
  device_tasks
TO zhili_app;
