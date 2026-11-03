BEGIN;

-- The application role is non-owner/NOBYPASSRLS. This predicate is owned by
-- the dedicated NOLOGIN/NOBYPASSRLS helper role after migration 0014 so membership lookups remain RLS-constrained.
CREATE OR REPLACE FUNCTION core.has_active_tenant_membership(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM core.organization_memberships om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND om.membership_status = 'active'
  )
$function$;

-- A narrow definer helper is used only by the guarded first-organization API.
-- It reveals whether the global organization registry is empty, not its rows.
CREATE OR REPLACE FUNCTION core.first_organization_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core
AS $function$
  SELECT EXISTS (SELECT 1 FROM core.organizations)
$function$;

-- The first member of a newly-created tenant can receive the system owner role
-- exactly once. Direct INSERT/UPDATE/DELETE on membership_roles is not granted
-- to the application role; this definer helper is the only bootstrap path.
CREATE OR REPLACE FUNCTION core.bootstrap_initial_owner_role(p_membership_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core
AS $function$
DECLARE
  v_user_id uuid;
  v_organization_id uuid;
  v_active_memberships integer;
  v_owner_role_id uuid;
BEGIN
  v_user_id := nullif(current_setting('app.user_id', true), '')::uuid;
  v_organization_id := nullif(current_setting('app.organization_id', true), '')::uuid;
  IF v_user_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION 'Tenant context is required for initial owner assignment' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM core.organization_memberships om
  WHERE om.id = p_membership_id
    AND om.organization_id = v_organization_id
    AND om.user_id = v_user_id
    AND om.membership_status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active self-membership is required for initial owner assignment' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_active_memberships
  FROM core.organization_memberships om
  WHERE om.organization_id = v_organization_id
    AND om.membership_status = 'active';
  IF v_active_memberships <> 1 THEN
    RAISE EXCEPTION 'Initial owner assignment is only available to the first active member' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM core.membership_roles mr
    JOIN core.organization_memberships om ON om.id = mr.membership_id
    WHERE om.organization_id = v_organization_id
  ) THEN
    RAISE EXCEPTION 'An organization role has already been assigned' USING ERRCODE = '42501';
  END IF;

  SELECT r.id INTO v_owner_role_id
  FROM core.roles r
  WHERE r.organization_id IS NULL
    AND r.role_key = 'institution_owner'
    AND r.is_system = true
  LIMIT 1;
  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'System institution owner role is missing' USING ERRCODE = '23503';
  END IF;

  INSERT INTO core.membership_roles (membership_id, role_id)
  VALUES (p_membership_id, v_owner_role_id);

  RETURN v_owner_role_id;
END
$function$;

-- Keep privileged helper execution closed during the migration boundary.
-- Migration 0014 grants only the required functions to pondok_app.
REVOKE ALL ON FUNCTION core.has_active_tenant_membership(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.first_organization_exists() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.bootstrap_initial_owner_role(uuid) FROM PUBLIC;

-- Enforce tenant isolation in PostgreSQL, not only in API query predicates.
-- Context is transaction-local and is set by apps/api/src/tenant-db.ts.
DO $migration$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('academic', 'admissions', 'assets', 'audit', 'boarding', 'cms', 'config', 'core', 'crm', 'finance', 'hr', 'inventory', 'library', 'procurement', 'sync')
      AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'organization_id'
          AND a.attnum > 0
          AND NOT a.attisdropped
      )
    ORDER BY n.nspname, c.relname
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target.schema_name, target.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', target.schema_name, target.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I.%I', target.schema_name, target.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_membership_self_insert ON %I.%I', target.schema_name, target.table_name);

    IF target.schema_name = 'core' AND target.table_name = 'roles' THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I.%I USING (organization_id IS NULL OR (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND core.has_active_tenant_membership(organization_id))) WITH CHECK (organization_id IS NOT NULL AND organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND core.has_active_tenant_membership(organization_id))',
        target.schema_name, target.table_name
      );
    ELSIF target.schema_name = 'core' AND target.table_name = 'organization_memberships' THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I.%I FOR SELECT USING (user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid AND organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid)',
        target.schema_name, target.table_name
      );
      EXECUTE format(
        'CREATE POLICY tenant_membership_self_insert ON %I.%I FOR INSERT WITH CHECK (user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid AND organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid)',
        target.schema_name, target.table_name
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I.%I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND core.has_active_tenant_membership(organization_id)) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND core.has_active_tenant_membership(organization_id))',
        target.schema_name, target.table_name
      );
    END IF;
  END LOOP;
END
$migration$;

-- The organization registry is visible only to a member of the selected tenant.
-- First-tenant INSERT is allowed only for the UUID already set in transaction context.
ALTER TABLE core.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_organization_select ON core.organizations;
DROP POLICY IF EXISTS tenant_organization_insert ON core.organizations;
CREATE POLICY tenant_organization_select ON core.organizations
  FOR SELECT
  USING (
    id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND core.has_active_tenant_membership(id)
  );
CREATE POLICY tenant_organization_insert ON core.organizations
  FOR INSERT
  WITH CHECK (id = nullif(current_setting('app.organization_id', true), '')::uuid);

-- Membership role assignments are readable only through the caller's own
-- active membership. The app role cannot write this table directly.
ALTER TABLE core.membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.membership_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_membership_roles_select ON core.membership_roles;
CREATE POLICY tenant_membership_roles_select ON core.membership_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM core.organization_memberships om
      WHERE om.id = membership_id
    )
  );

-- Fail the migration if a tenant-owned table or authority table was missed.
DO $validation$
DECLARE
  unsafe_count integer;
BEGIN
  SELECT count(*) INTO unsafe_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('academic', 'admissions', 'assets', 'audit', 'boarding', 'cms', 'config', 'core', 'crm', 'finance', 'hr', 'inventory', 'library', 'procurement', 'sync')
    AND c.relkind = 'r'
    AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attname = 'organization_id'
        AND a.attnum > 0 AND NOT a.attisdropped
    )
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR NOT EXISTS (
      SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
    ));
  IF unsafe_count <> 0 THEN
    RAISE EXCEPTION 'Tenant RLS validation failed for % organization-owned table(s)', unsafe_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'core' AND c.relname = 'organizations'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'core' AND c.relname = 'organizations'
      AND p.polname = 'tenant_organization_select'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'core' AND c.relname = 'membership_roles'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'core' AND c.relname = 'membership_roles'
      AND p.polname = 'tenant_membership_roles_select'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'core' AND c.relname = 'organization_memberships'
      AND p.polname = 'tenant_membership_self_insert'
  ) THEN
    RAISE EXCEPTION 'Tenant RLS validation failed for core organization authority tables';
  END IF;
END
$validation$;

COMMIT;
