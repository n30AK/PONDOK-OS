BEGIN;

-- The API must never connect as neondb_owner: that managed owner role has
-- BYPASSRLS. This role is created NOLOGIN in CI; Neon development can create
-- the same role as LOGIN through Neon before applying this migration.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pondok_app') THEN
    CREATE ROLE pondok_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
END
$role$;

ALTER ROLE pondok_app
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;

GRANT USAGE ON SCHEMA academic, admissions, assets, audit, boarding, cms, config, core, crm, finance, hr, inventory, library, procurement, sync
TO pondok_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA academic, admissions, assets, audit, boarding, cms, config, core, crm, finance, hr, inventory, library, procurement, sync
TO pondok_app;

GRANT USAGE, SELECT, UPDATE
ON ALL SEQUENCES IN SCHEMA academic, admissions, assets, audit, boarding, cms, config, core, crm, finance, hr, inventory, library, procurement, sync
TO pondok_app;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA core TO pondok_app;

-- No blanket default privileges are installed: new tables must receive
-- explicit runtime grants in their migration, so future global tables fail closed.

-- Global RBAC dictionaries are read-only to the runtime. Membership role
-- assignment is performed only by the guarded SECURITY DEFINER bootstrap helper.
REVOKE INSERT, UPDATE, DELETE ON core.permissions, core.role_permissions, core.roles, core.membership_roles
FROM pondok_app;
REVOKE UPDATE, DELETE ON core.organizations, core.organization_memberships
FROM pondok_app;
REVOKE ALL ON core.schema_migrations FROM pondok_app;

-- The membership predicate must execute as the restricted role so its read of
-- organization_memberships is filtered by that table's direct self/tenant RLS.
GRANT CREATE ON SCHEMA core TO pondok_app;
ALTER FUNCTION core.has_active_tenant_membership(uuid) OWNER TO pondok_app;
REVOKE CREATE ON SCHEMA core FROM pondok_app;

REVOKE ALL ON FUNCTION core.has_active_tenant_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.has_active_tenant_membership(uuid) TO pondok_app;
REVOKE ALL ON FUNCTION core.first_organization_exists() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.first_organization_exists() TO pondok_app;
REVOKE ALL ON FUNCTION core.bootstrap_initial_owner_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.bootstrap_initial_owner_role(uuid) TO pondok_app;

DO $validation$
DECLARE
  app_role record;
  predicate_owner text;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit
  INTO app_role
  FROM pg_roles
  WHERE rolname = 'pondok_app';

  IF NOT FOUND OR app_role.rolsuper OR app_role.rolbypassrls
     OR app_role.rolcreatedb OR app_role.rolcreaterole OR app_role.rolinherit THEN
    RAISE EXCEPTION 'pondok_app must be a non-superuser, NOBYPASSRLS, non-admin, NOINHERIT role';
  END IF;

  SELECT r.rolname INTO predicate_owner
  FROM pg_proc p
  JOIN pg_roles r ON r.oid = p.proowner
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'core' AND p.proname = 'has_active_tenant_membership'
    AND pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid';

  IF predicate_owner IS DISTINCT FROM 'pondok_app' THEN
    RAISE EXCEPTION 'Tenant membership predicate must be owned by pondok_app, found %', predicate_owner;
  END IF;
END
$validation$;

COMMIT;
