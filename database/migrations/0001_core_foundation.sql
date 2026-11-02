-- PONDOK OS / Sprint 0 foundation
-- Additive migration. Apply to development branch first; never drop existing Neon Auth objects.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS config;

CREATE TABLE IF NOT EXISTS core.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  organization_type text NOT NULL DEFAULT 'pesantren',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived')),
  timezone text NOT NULL DEFAULT 'Asia/Jakarta',
  locale text NOT NULL DEFAULT 'id-ID',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  campus_type text NOT NULL DEFAULT 'main',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS core.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  user_id uuid NOT NULL,
  membership_status text NOT NULL DEFAULT 'active'
    CHECK (membership_status IN ('invited', 'active', 'suspended', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS core.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES core.organizations(id),
  role_key text NOT NULL,
  role_name text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, role_key)
);

CREATE TABLE IF NOT EXISTS core.permissions (
  permission_key text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE IF NOT EXISTS core.role_permissions (
  role_id uuid NOT NULL REFERENCES core.roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES core.permissions(permission_key),
  PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE IF NOT EXISTS core.membership_roles (
  membership_id uuid NOT NULL REFERENCES core.organization_memberships(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES core.roles(id),
  PRIMARY KEY (membership_id, role_id)
);

CREATE TABLE IF NOT EXISTS config.organization_settings (
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  setting_key text NOT NULL,
  setting_value jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, setting_key)
);

CREATE TABLE IF NOT EXISTS audit.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES core.organizations(id),
  actor_user_id uuid,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campuses_org ON core.campuses (organization_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON core.organization_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit.audit_events (organization_id, occurred_at DESC);

COMMIT;
