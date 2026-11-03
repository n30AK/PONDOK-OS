BEGIN;

-- The Neon-injected DATABASE_URL connects as neondb_owner, which has BYPASSRLS.
-- Every application transaction must explicitly SET LOCAL ROLE to this restricted role.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pondok_runtime') THEN
    CREATE ROLE pondok_runtime NOLOGIN NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pondok_runtime' AND (rolcanlogin OR rolbypassrls)) THEN
    RAISE EXCEPTION 'pondok_runtime must be NOLOGIN and NOBYPASSRLS';
  END IF;
END
$role$;

GRANT pondok_runtime TO neondb_owner;
GRANT USAGE ON SCHEMA academic, admissions, assets, audit, boarding, cms, config, core, crm, finance, hr, inventory, library, procurement, sync TO pondok_runtime;

-- Grant only the tenant-owned application tables, not the membership authority table.
DO $grants$
DECLARE target record;
BEGIN
  FOR target IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('academic','admissions','assets','audit','boarding','cms','config','core','crm','finance','hr','inventory','library','procurement','sync')
      AND c.relkind = 'r'
      AND NOT (n.nspname = 'core' AND c.relname = 'organization_memberships')
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attname = 'organization_id'
          AND a.attnum > 0 AND NOT a.attisdropped
      )
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO pondok_runtime', target.schema_name, target.table_name);
  END LOOP;
END
$grants$;

-- Identity lookup is read-only for normal requests. Bootstrap creates the first
-- organization and membership before switching into pondok_runtime.
GRANT SELECT ON core.organizations, core.organization_memberships, core.roles, core.role_permissions TO pondok_runtime;
GRANT SELECT, INSERT ON core.membership_roles TO pondok_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA academic, admissions, assets, audit, boarding, cms, config, core, crm, finance, hr, inventory, library, procurement, sync TO pondok_runtime;

-- Membership role assignments are visible only to the authenticated active member.
ALTER TABLE core.membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.membership_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_membership_roles ON core.membership_roles;
CREATE POLICY tenant_membership_roles ON core.membership_roles
  USING (EXISTS (
    SELECT 1 FROM core.organization_memberships om
    WHERE om.id = membership_id
      AND om.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
      AND om.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND om.membership_status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM core.organization_memberships om
    WHERE om.id = membership_id
      AND om.organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
      AND om.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND om.membership_status = 'active'
  ));

-- Permission rows follow the visibility of their global or tenant-scoped role.
ALTER TABLE core.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_role_permissions ON core.role_permissions;
CREATE POLICY tenant_role_permissions ON core.role_permissions
  USING (EXISTS (SELECT 1 FROM core.roles r WHERE r.id = role_id))
  WITH CHECK (EXISTS (SELECT 1 FROM core.roles r WHERE r.id = role_id));

DO $validation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'pondok_runtime' AND NOT rolcanlogin AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Restricted runtime role validation failed';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='core.membership_roles'::regclass) THEN
    RAISE EXCEPTION 'core.membership_roles must enforce RLS';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='core.role_permissions'::regclass) THEN
    RAISE EXCEPTION 'core.role_permissions must enforce RLS';
  END IF;
END
$validation$;

COMMIT;
