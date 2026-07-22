-- B1 ordered domain migration. Source proposals were independently reviewed.
-- Dependency order: identity/master data -> rates/waybills -> warehouse/linehaul.

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

-- Root-owned B1 contract alignment addendum. The reviewed proposal files stay immutable; these
-- changes resolve cross-domain contract gaps discovered before service implementation.
ALTER TABLE tenants
  ALTER COLUMN version SET DEFAULT 1,
  DROP CONSTRAINT tenants_status_check,
  DROP CONSTRAINT tenants_version_check,
  ADD CONSTRAINT tenants_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'EXPIRED')),
  ADD CONSTRAINT tenants_version_check CHECK (version >= 1);

ALTER TABLE permission_actions
  DROP CONSTRAINT permission_actions_code_check,
  ADD CONSTRAINT permission_actions_code_check CHECK (
    action_code ~ '^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$'
  );

ALTER TABLE device_bindings
  ADD COLUMN bound_subject_user_id text NOT NULL,
  ADD CONSTRAINT device_bindings_bound_subject_fk
    FOREIGN KEY (tenant_id, bound_subject_user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT;

DROP INDEX device_tasks_queue_idx;
ALTER TABLE device_tasks
  DROP CONSTRAINT device_tasks_type_check,
  DROP CONSTRAINT device_tasks_priority_check,
  DROP CONSTRAINT device_tasks_version_check,
  ALTER COLUMN priority DROP DEFAULT,
  ALTER COLUMN priority TYPE text USING (
    CASE priority
      WHEN 100 THEN 'URGENT'
      WHEN 50 THEN 'HIGH'
      WHEN 0 THEN 'NORMAL'
      ELSE 'LOW'
    END
  ),
  ALTER COLUMN priority SET DEFAULT 'NORMAL',
  ALTER COLUMN version SET DEFAULT 1,
  ADD CONSTRAINT device_tasks_type_check CHECK (
    task_type IN (
      'RECEIVE', 'MOVE', 'PICK', 'LOAD', 'DISPATCH',
      'LAST_MILE_DELIVERY', 'STOCKTAKE'
    )
  ),
  ADD CONSTRAINT device_tasks_priority_check CHECK (
    priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')
  ),
  ADD CONSTRAINT device_tasks_version_check CHECK (version >= 1);

CREATE INDEX device_tasks_queue_idx ON device_tasks (
  tenant_id,
  assigned_device_id,
  status,
  (CASE priority WHEN 'URGENT' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'NORMAL' THEN 2 ELSE 1 END) DESC,
  available_at,
  id
);

CREATE TABLE tenant_entitlements (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  module_code text NOT NULL,
  entitlement_version integer NOT NULL,
  state text NOT NULL DEFAULT 'ACTIVE',
  quota_limit bigint,
  usage_value bigint NOT NULL DEFAULT 0,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_entitlements_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT tenant_entitlements_module_check CHECK (module_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT tenant_entitlements_version_check CHECK (entitlement_version >= 1),
  CONSTRAINT tenant_entitlements_state_check CHECK (state IN ('ACTIVE', 'RETIRED')),
  CONSTRAINT tenant_entitlements_usage_check CHECK (
    usage_value >= 0 AND (quota_limit IS NULL OR (quota_limit >= 0 AND usage_value <= quota_limit))
  ),
  CONSTRAINT tenant_entitlements_validity_check CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  CONSTRAINT tenant_entitlements_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT tenant_entitlements_module_version_unique UNIQUE (
    tenant_id, module_code, entitlement_version
  ),
  CONSTRAINT tenant_entitlements_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT tenant_entitlements_creator_fk FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE impersonation_sessions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  actor_subject_id text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  ended_reason text,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT impersonation_sessions_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT impersonation_sessions_actor_check CHECK (length(btrim(actor_subject_id)) >= 1),
  CONSTRAINT impersonation_sessions_reason_check CHECK (length(btrim(reason)) >= 10),
  CONSTRAINT impersonation_sessions_status_check CHECK (status IN ('ACTIVE', 'ENDED', 'EXPIRED')),
  CONSTRAINT impersonation_sessions_duration_check CHECK (
    expires_at >= started_at + interval '5 minutes'
    AND expires_at <= started_at + interval '60 minutes'
  ),
  CONSTRAINT impersonation_sessions_end_check CHECK (
    (status = 'ACTIVE' AND ended_at IS NULL AND ended_reason IS NULL)
    OR (status IN ('ENDED', 'EXPIRED') AND ended_at IS NOT NULL AND length(btrim(ended_reason)) >= 1)
  ),
  CONSTRAINT impersonation_sessions_version_check CHECK (version >= 1),
  CONSTRAINT impersonation_sessions_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT impersonation_sessions_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT impersonation_sessions_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE UNIQUE INDEX impersonation_sessions_one_active_actor_tenant_idx
  ON impersonation_sessions (tenant_id, actor_subject_id)
  WHERE status = 'ACTIVE';

CREATE TABLE oauth_identities (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  provider text NOT NULL,
  provider_subject_hash text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_identities_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT oauth_identities_provider_check CHECK (provider IN ('WECHAT', 'OIDC')),
  CONSTRAINT oauth_identities_subject_hash_check CHECK (provider_subject_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT oauth_identities_status_check CHECK (status IN ('ACTIVE', 'REVOKED')),
  CONSTRAINT oauth_identities_version_check CHECK (version >= 1),
  CONSTRAINT oauth_identities_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT oauth_identities_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT oauth_identities_provider_subject_unique UNIQUE (provider, provider_subject_hash),
  CONSTRAINT oauth_identities_user_provider_unique UNIQUE (tenant_id, user_id, provider),
  CONSTRAINT oauth_identities_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT oauth_identities_user_fk FOREIGN KEY (tenant_id, user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE partners (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  partner_code text NOT NULL,
  display_name text NOT NULL,
  partner_type text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partners_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT partners_code_check CHECK (length(btrim(partner_code)) BETWEEN 1 AND 64),
  CONSTRAINT partners_name_check CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  CONSTRAINT partners_type_check CHECK (
    partner_type IN ('CARRIER', 'AGENT', 'SUPPLIER', 'LAST_MILE', 'CUSTOMS_BROKER')
  ),
  CONSTRAINT partners_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT partners_version_check CHECK (version >= 1),
  CONSTRAINT partners_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT partners_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT partners_tenant_code_unique UNIQUE (tenant_id, partner_code),
  CONSTRAINT partners_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE reference_data_sets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  set_code text NOT NULL,
  display_name text NOT NULL,
  current_version_id text,
  status text NOT NULL DEFAULT 'ACTIVE',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_data_sets_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT reference_data_sets_code_check CHECK (set_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT reference_data_sets_name_check CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  CONSTRAINT reference_data_sets_status_check CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT reference_data_sets_version_check CHECK (version >= 1),
  CONSTRAINT reference_data_sets_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT reference_data_sets_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT reference_data_sets_tenant_code_unique UNIQUE (tenant_id, set_code),
  CONSTRAINT reference_data_sets_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE reference_data_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  reference_data_set_id text NOT NULL,
  version_number integer NOT NULL,
  state text NOT NULL DEFAULT 'DRAFT',
  published_at timestamptz,
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_data_versions_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT reference_data_versions_number_check CHECK (version_number >= 1),
  CONSTRAINT reference_data_versions_state_check CHECK (state IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  CONSTRAINT reference_data_versions_publish_check CHECK (
    (state = 'DRAFT' AND published_at IS NULL)
    OR (state IN ('PUBLISHED', 'RETIRED') AND published_at IS NOT NULL)
  ),
  CONSTRAINT reference_data_versions_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT reference_data_versions_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT reference_data_versions_set_version_unique UNIQUE (
    tenant_id, reference_data_set_id, version_number
  ),
  CONSTRAINT reference_data_versions_head_key_unique UNIQUE (
    tenant_id, id, reference_data_set_id
  ),
  CONSTRAINT reference_data_versions_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT reference_data_versions_set_fk FOREIGN KEY (tenant_id, reference_data_set_id)
    REFERENCES reference_data_sets (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT reference_data_versions_creator_fk FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

ALTER TABLE reference_data_sets
  ADD CONSTRAINT reference_data_sets_current_version_fk FOREIGN KEY (
    tenant_id, current_version_id, id
  ) REFERENCES reference_data_versions (tenant_id, id, reference_data_set_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE TABLE reference_data_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  reference_data_version_id text NOT NULL,
  item_key text NOT NULL,
  item_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_data_items_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT reference_data_items_key_check CHECK (length(btrim(item_key)) BETWEEN 1 AND 160),
  CONSTRAINT reference_data_items_payload_check CHECK (jsonb_typeof(item_payload) = 'object'),
  CONSTRAINT reference_data_items_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT reference_data_items_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT reference_data_items_version_key_unique UNIQUE (
    tenant_id, reference_data_version_id, item_key
  ),
  CONSTRAINT reference_data_items_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT reference_data_items_version_fk FOREIGN KEY (tenant_id, reference_data_version_id)
    REFERENCES reference_data_versions (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE customer_credit_policies (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  customer_id text NOT NULL,
  policy_version integer NOT NULL,
  currency text NOT NULL,
  credit_limit_minor bigint NOT NULL,
  payment_cycle text NOT NULL,
  hold_policy text NOT NULL,
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_credit_policies_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT customer_credit_policies_version_check CHECK (policy_version >= 1),
  CONSTRAINT customer_credit_policies_money_check CHECK (
    currency ~ '^[A-Z]{3}$' AND credit_limit_minor >= 0
  ),
  CONSTRAINT customer_credit_policies_cycle_check CHECK (
    payment_cycle IN ('PREPAID', 'WEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'NET_30', 'NET_60')
  ),
  CONSTRAINT customer_credit_policies_hold_check CHECK (
    hold_policy IN ('AUTO_HOLD', 'REVIEW', 'ALLOW')
  ),
  CONSTRAINT customer_credit_policies_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT customer_credit_policies_customer_version_unique UNIQUE (
    tenant_id, customer_id, policy_version
  ),
  CONSTRAINT customer_credit_policies_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT customer_credit_policies_customer_fk FOREIGN KEY (tenant_id, customer_id)
    REFERENCES customers (tenant_id, id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT customer_credit_policies_creator_fk FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE permission_simulations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  actor_user_id text NOT NULL,
  subject_user_id text NOT NULL,
  proposed_policy jsonb NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permission_simulations_id_ulid_check CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
  CONSTRAINT permission_simulations_policy_check CHECK (jsonb_typeof(proposed_policy) = 'object'),
  CONSTRAINT permission_simulations_status_check CHECK (status IN ('ACTIVE', 'ENDED', 'EXPIRED')),
  CONSTRAINT permission_simulations_expiry_check CHECK (
    expires_at >= created_at + interval '5 minutes'
    AND expires_at <= created_at + interval '60 minutes'
  ),
  CONSTRAINT permission_simulations_end_check CHECK (
    (status = 'ACTIVE' AND ended_at IS NULL)
    OR (status IN ('ENDED', 'EXPIRED') AND ended_at IS NOT NULL)
  ),
  CONSTRAINT permission_simulations_version_check CHECK (version >= 1),
  CONSTRAINT permission_simulations_timestamps_check CHECK (updated_at >= created_at),
  CONSTRAINT permission_simulations_tenant_id_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT permission_simulations_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants (id) ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT permission_simulations_actor_fk FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT permission_simulations_subject_fk FOREIGN KEY (tenant_id, subject_user_id)
    REFERENCES users (tenant_id, id) ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE FUNCTION reject_identity_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER tenant_entitlements_immutable_update
BEFORE UPDATE ON tenant_entitlements
FOR EACH ROW EXECUTE FUNCTION reject_identity_history_mutation();
CREATE TRIGGER tenant_entitlements_immutable_delete
BEFORE DELETE ON tenant_entitlements
FOR EACH ROW EXECUTE FUNCTION reject_identity_history_mutation();
CREATE TRIGGER customer_credit_policies_immutable_update
BEFORE UPDATE ON customer_credit_policies
FOR EACH ROW EXECUTE FUNCTION reject_identity_history_mutation();
CREATE TRIGGER customer_credit_policies_immutable_delete
BEFORE DELETE ON customer_credit_policies
FOR EACH ROW EXECUTE FUNCTION reject_identity_history_mutation();

CREATE FUNCTION guard_reference_data_version_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state <> 'DRAFT' OR NEW.state <> 'PUBLISHED'
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.reference_data_set_id IS DISTINCT FROM OLD.reference_data_set_id
     OR NEW.version_number IS DISTINCT FROM OLD.version_number
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.published_at IS NULL THEN
    RAISE EXCEPTION 'reference data versions are immutable except DRAFT to PUBLISHED'
      USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER reference_data_versions_publish_guard
BEFORE UPDATE ON reference_data_versions
FOR EACH ROW EXECUTE FUNCTION guard_reference_data_version_update();
CREATE TRIGGER reference_data_versions_immutable_delete
BEFORE DELETE ON reference_data_versions
FOR EACH ROW EXECUTE FUNCTION reject_identity_history_mutation();

CREATE FUNCTION guard_reference_data_item_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_state text;
  scoped_tenant_id text;
  scoped_version_id text;
BEGIN
  scoped_tenant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  scoped_version_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.reference_data_version_id
    ELSE NEW.reference_data_version_id
  END;

  SELECT state INTO version_state
  FROM reference_data_versions
  WHERE tenant_id = scoped_tenant_id AND id = scoped_version_id
  FOR UPDATE;

  IF version_state IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'published reference data items are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER reference_data_items_mutation_guard
BEFORE INSERT OR UPDATE OR DELETE ON reference_data_items
FOR EACH ROW EXECUTE FUNCTION guard_reference_data_item_mutation();

CREATE FUNCTION guard_reference_data_set_head()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'reference data set version must advance exactly once' USING ERRCODE = '40001';
  END IF;
  IF NEW.current_version_id IS DISTINCT FROM OLD.current_version_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM reference_data_versions
      WHERE tenant_id = NEW.tenant_id
        AND id = NEW.current_version_id
        AND reference_data_set_id = NEW.id
        AND state = 'PUBLISHED'
    ) THEN
      RAISE EXCEPTION 'reference data head must be a published version' USING ERRCODE = '23514';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER reference_data_sets_head_guard
BEFORE UPDATE ON reference_data_sets
FOR EACH ROW EXECUTE FUNCTION guard_reference_data_set_head();

DO $identity_rls$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_entitlements',
    'impersonation_sessions',
    'oauth_identities',
    'partners',
    'reference_data_sets',
    'reference_data_versions',
    'reference_data_items',
    'customer_credit_policies',
    'permission_simulations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO zhili_app '
      || 'USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')) '
      || 'WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), ''''))',
      table_name || '_tenant_isolation',
      table_name
    );
  END LOOP;
END
$identity_rls$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  tenant_entitlements,
  impersonation_sessions,
  oauth_identities,
  partners,
  reference_data_sets,
  reference_data_versions,
  reference_data_items,
  customer_credit_policies,
  permission_simulations
TO zhili_app;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zhili_auth') THEN
    CREATE ROLE zhili_auth
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  ELSE
    ALTER ROLE zhili_auth
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

CREATE FUNCTION auth_lookup_password(p_account text, p_tenant_hint text)
RETURNS TABLE (
  tenant_id text,
  tenant_status text,
  user_id text,
  user_status text,
  password_hash text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    u.tenant_id,
    t.status,
    u.id,
    u.status,
    u.password_hash
  FROM public.users u
  JOIN public.tenants t ON t.id = u.tenant_id
  WHERE u.login_name_normalized = lower(btrim(p_account))
    AND (p_tenant_hint IS NULL OR t.slug = lower(btrim(p_tenant_hint)))
  ORDER BY u.tenant_id
  LIMIT 2
$$;

REVOKE ALL ON FUNCTION auth_lookup_password(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_lookup_password(text, text) TO zhili_auth;

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
ALTER TABLE waybills
  DROP CONSTRAINT waybills_state_check,
  DROP CONSTRAINT waybills_issue_check,
  ADD CONSTRAINT waybills_state_check CHECK (
    state IN (
      'DRAFT', 'FORECASTED', 'AWAITING_RECEIPT', 'RECEIVED', 'AWAITING_ROUTING',
      'AWAITING_TRANSIT', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED',
      'AWAITING_RETURN', 'RETURNED', 'CANCELLED'
    )
  ),
  ADD CONSTRAINT waybills_issue_check CHECK (
    (state IN ('DRAFT', 'FORECASTED') AND issued_at IS NULL)
    OR (state NOT IN ('DRAFT', 'FORECASTED') AND issued_at IS NOT NULL)
  );

ALTER TABLE import_jobs
  DROP CONSTRAINT import_jobs_state_check,
  DROP CONSTRAINT import_jobs_commit_check,
  DROP CONSTRAINT import_jobs_rollback_check,
  ADD CONSTRAINT import_jobs_state_check CHECK (
    state IN (
      'UPLOADED', 'MAPPING', 'VALIDATING', 'READY', 'COMMITTING',
      'COMPLETED', 'FAILED', 'ROLLED_BACK'
    )
  ),
  ADD CONSTRAINT import_jobs_commit_check CHECK (
    (state IN ('COMPLETED', 'ROLLED_BACK') AND committed_at IS NOT NULL)
    OR (state NOT IN ('COMPLETED', 'ROLLED_BACK') AND committed_at IS NULL)
  ),
  ADD CONSTRAINT import_jobs_rollback_check CHECK (
    (state = 'ROLLED_BACK' AND rolled_back_at IS NOT NULL)
    OR (state <> 'ROLLED_BACK' AND rolled_back_at IS NULL)
  );

CREATE OR REPLACE FUNCTION validate_import_rollback_job()
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
    RAISE EXCEPTION 'rollback target does not exist in the tenant' USING ERRCODE = '23503';
  END IF;
  IF original_rollback_of_job_id IS NOT NULL THEN
    RAISE EXCEPTION 'a rollback job cannot itself be rolled back' USING ERRCODE = '23514';
  END IF;
  IF original_state <> 'COMPLETED' THEN
    RAISE EXCEPTION 'only a completed import job can be rolled back' USING ERRCODE = '23514';
  END IF;
  IF original_type <> NEW.import_type THEN
    RAISE EXCEPTION 'rollback import type must match its original job' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE warehouse_receipts
  ALTER COLUMN status SET DEFAULT 'SCANNED',
  ALTER COLUMN version SET DEFAULT 1,
  DROP CONSTRAINT warehouse_receipts_status_check,
  DROP CONSTRAINT warehouse_receipts_version_check,
  DROP CONSTRAINT warehouse_receipts_undo_shape_check,
  ADD CONSTRAINT warehouse_receipts_status_check CHECK (
    status IN ('SCANNED', 'CONFIRMED', 'UNDONE')
  ),
  ADD CONSTRAINT warehouse_receipts_version_check CHECK (version >= 1),
  ADD CONSTRAINT warehouse_receipts_undo_shape_check CHECK (
    (status IN ('SCANNED', 'CONFIRMED') AND undone_at IS NULL AND undo_reason IS NULL)
    OR (status = 'UNDONE' AND undone_at IS NOT NULL AND length(btrim(undo_reason)) > 0)
  );

CREATE OR REPLACE FUNCTION guard_warehouse_receipt_update()
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
  IF OLD.status = 'SCANNED' AND NEW.status = 'CONFIRMED' THEN
    NULL;
  ELSIF OLD.status = 'CONFIRMED' AND NEW.status = 'UNDONE' THEN
    IF statement_timestamp() > OLD.undo_until THEN
      RAISE EXCEPTION 'warehouse receipt undo is stale' USING ERRCODE = '40001';
    END IF;
  ELSIF NEW.status = OLD.status THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'invalid warehouse receipt state transition' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

ALTER TABLE load_units
  ALTER COLUMN status SET DEFAULT 'OPEN',
  ALTER COLUMN version SET DEFAULT 1,
  DROP CONSTRAINT load_units_status_check,
  DROP CONSTRAINT load_units_version_check,
  DROP CONSTRAINT load_units_state_shape_check,
  ADD CONSTRAINT load_units_status_check CHECK (status IN ('OPEN', 'SEALED', 'DISPATCHED')),
  ADD CONSTRAINT load_units_version_check CHECK (version >= 1),
  ADD CONSTRAINT load_units_state_shape_check CHECK (
    (status = 'OPEN' AND sealed_at IS NULL AND dispatched_at IS NULL)
    OR (status = 'SEALED' AND sealed_at IS NOT NULL AND dispatched_at IS NULL)
    OR (status = 'DISPATCHED' AND sealed_at IS NOT NULL AND dispatched_at IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION guard_load_unit_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'OPEN'
     OR NEW.version <> 1
     OR NEW.sealed_at IS NOT NULL
     OR NEW.dispatched_at IS NOT NULL THEN
    RAISE EXCEPTION 'load units must be inserted as OPEN at version one'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_load_unit_update()
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
  IF OLD.status = 'OPEN' AND NEW.status = 'SEALED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM load_unit_items
      WHERE tenant_id = OLD.tenant_id AND load_unit_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'empty load unit cannot be sealed' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.status = 'SEALED' AND NEW.status = 'DISPATCHED' THEN
    NULL;
  ELSIF OLD.status = 'OPEN' AND NEW.status = 'OPEN' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'invalid load unit state transition' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_load_unit_item_mutation()
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
    IF parent_row.status <> 'OPEN' THEN
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

ALTER TABLE linehaul_bookings
  ALTER COLUMN version SET DEFAULT 1,
  DROP CONSTRAINT linehaul_bookings_status_check,
  DROP CONSTRAINT linehaul_bookings_version_check,
  ADD CONSTRAINT linehaul_bookings_status_check CHECK (
    status IN ('DRAFT', 'CONFIRMED', 'DEPARTED', 'CLOSED', 'CANCELLED')
  ),
  ADD CONSTRAINT linehaul_bookings_version_check CHECK (version >= 1);

ALTER TABLE delivery_tasks
  ALTER COLUMN status SET DEFAULT 'PLANNED',
  ALTER COLUMN version SET DEFAULT 1,
  DROP CONSTRAINT delivery_tasks_status_check,
  DROP CONSTRAINT delivery_tasks_version_check,
  DROP CONSTRAINT delivery_tasks_completion_check,
  ADD CONSTRAINT delivery_tasks_status_check CHECK (
    status IN ('PLANNED', 'PALLETIZED', 'LOADED', 'OUT_FOR_DELIVERY', 'COMPLETED', 'EXCEPTION')
  ),
  ADD CONSTRAINT delivery_tasks_version_check CHECK (version >= 1),
  ADD CONSTRAINT delivery_tasks_completion_check CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL) OR status <> 'COMPLETED'
  );

ALTER TABLE device_sync_conflicts
  DROP CONSTRAINT device_sync_conflicts_resolution_check,
  ADD CONSTRAINT device_sync_conflicts_resolution_check CHECK (
    resolution IS NULL OR resolution IN ('KEEP_SERVER', 'REAPPLY_LOCAL', 'SUBMIT_MANUAL')
  );

ALTER TABLE inventory_balances
  ALTER COLUMN version SET DEFAULT 1,
  DROP CONSTRAINT inventory_balances_version_check,
  ADD CONSTRAINT inventory_balances_version_check CHECK (version >= 1);
ALTER TABLE bills_of_lading
  ALTER COLUMN version SET DEFAULT 1,
  DROP CONSTRAINT bills_of_lading_version_check,
  ADD CONSTRAINT bills_of_lading_version_check CHECK (version >= 1);
ALTER TABLE fba_deliveries
  ALTER COLUMN version SET DEFAULT 1,
  DROP CONSTRAINT fba_deliveries_version_check,
  ADD CONSTRAINT fba_deliveries_version_check CHECK (version >= 1);
ALTER TABLE print_jobs
  ALTER COLUMN version SET DEFAULT 1,
  DROP CONSTRAINT print_jobs_version_check,
  ADD CONSTRAINT print_jobs_version_check CHECK (version >= 1);
