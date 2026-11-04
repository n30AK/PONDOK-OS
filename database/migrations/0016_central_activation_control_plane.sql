-- PONDOK OS Central Control Plane
-- Prepared for Development review only. Do not apply to Production without a separate approval.
BEGIN;

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.super_admins (
  user_id uuid PRIMARY KEY,
  email text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS platform.activation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL,
  contact_email text NOT NULL,
  contact_name text NOT NULL,
  organization_name text NOT NULL,
  organization_slug text NOT NULL,
  organization_type text NOT NULL DEFAULT 'pesantren',
  campus_code text NOT NULL,
  campus_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','activated','cancelled')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  organization_id uuid REFERENCES core.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (organization_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CHECK (length(organization_name) BETWEEN 3 AND 180),
  CHECK (length(contact_email) BETWEEN 3 AND 254)
);

CREATE UNIQUE INDEX IF NOT EXISTS activation_one_pending_per_user
  ON platform.activation_requests (requested_by)
  WHERE status IN ('pending','approved');

CREATE INDEX IF NOT EXISTS activation_requests_status_created
  ON platform.activation_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS platform.activation_tokens (
  token_hash bytea PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES platform.activation_requests(id),
  requested_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activation_tokens_request
  ON platform.activation_tokens (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform.tenant_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES core.organizations(id),
  plan_code text NOT NULL DEFAULT 'pilot',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial','active','suspended','expired','cancelled')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  max_users integer CHECK (max_users IS NULL OR max_users > 0),
  max_campuses integer CHECK (max_campuses IS NULL OR max_campuses > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION platform.is_active_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM platform.super_admins sa
    WHERE sa.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND sa.status = 'active'
  )
$function$;

REVOKE ALL ON SCHEMA platform FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA platform FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.is_active_super_admin() FROM PUBLIC;

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pondok_platform_runtime') THEN
    CREATE ROLE pondok_platform_runtime NOLOGIN NOBYPASSRLS;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'pondok_platform_runtime' AND (rolcanlogin OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'pondok_platform_runtime must be NOLOGIN and NOBYPASSRLS';
  END IF;
END
$role$;

DO $grant$
BEGIN
  EXECUTE format('GRANT pondok_platform_runtime TO %I', current_user);
END
$grant$;

GRANT USAGE ON SCHEMA platform, core, audit TO pondok_platform_runtime;
GRANT EXECUTE ON FUNCTION platform.is_active_super_admin() TO pondok_platform_runtime;
GRANT SELECT, INSERT, UPDATE ON platform.activation_requests TO pondok_platform_runtime;
GRANT SELECT, INSERT ON platform.activation_tokens TO pondok_platform_runtime;
GRANT UPDATE (consumed_at) ON platform.activation_tokens TO pondok_platform_runtime;
GRANT SELECT, INSERT ON platform.audit_events TO pondok_platform_runtime;
GRANT SELECT ON platform.tenant_licenses TO pondok_platform_runtime;

-- The platform role can create a tenant only through the authenticated API
-- transaction. Tenant-owned campus, membership-role and audit writes remain
-- subject to their existing FORCE RLS policies.
GRANT SELECT, INSERT ON core.organizations, core.organization_memberships TO pondok_platform_runtime;
GRANT SELECT ON core.roles TO pondok_platform_runtime;
GRANT INSERT ON core.campuses, core.membership_roles, audit.audit_events TO pondok_platform_runtime;

ALTER TABLE platform.activation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.activation_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activation_requests_access ON platform.activation_requests;
CREATE POLICY activation_requests_access ON platform.activation_requests
  USING (
    requested_by = nullif(current_setting('app.user_id', true), '')::uuid
    OR platform.is_active_super_admin()
  )
  WITH CHECK (
    (requested_by = nullif(current_setting('app.user_id', true), '')::uuid AND status = 'pending')
    OR platform.is_active_super_admin()
  );

ALTER TABLE platform.activation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.activation_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activation_tokens_admin_only ON platform.activation_tokens;
CREATE POLICY activation_tokens_owner_or_admin ON platform.activation_tokens
  USING (
    requested_by = nullif(current_setting('app.user_id', true), '')::uuid
    OR platform.is_active_super_admin()
  )
  WITH CHECK (
    requested_by = nullif(current_setting('app.user_id', true), '')::uuid
    OR platform.is_active_super_admin()
  );

ALTER TABLE platform.tenant_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.tenant_licenses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_licenses_admin_only ON platform.tenant_licenses;
CREATE POLICY tenant_licenses_admin_only ON platform.tenant_licenses
  USING (platform.is_active_super_admin())
  WITH CHECK (platform.is_active_super_admin());

ALTER TABLE platform.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.audit_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_audit_admin_only ON platform.audit_events;
CREATE POLICY platform_audit_actor_or_admin ON platform.audit_events
  USING (
    actor_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR platform.is_active_super_admin()
  )
  WITH CHECK (
    actor_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR platform.is_active_super_admin()
  );

-- Deliberately no initial super-admin is inserted here. The first company
-- administrator must be granted through the controlled Development runbook
-- after verifying the intended Neon Auth user UUID out of band.

COMMIT;
