BEGIN;

-- The API must never connect as neondb_owner: that managed owner role has
-- BYPASSRLS. This role is created NOLOGIN in CI; Neon development can create
-- the same role as LOGIN through Neon before applying this migration.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pondok_app') THEN
    CREATE ROLE pondok_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pondok_rls_owner') THEN
    CREATE ROLE pondok_rls_owner NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
END
$role$;

ALTER ROLE pondok_app
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
ALTER ROLE pondok_rls_owner
  NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;

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

-- The membership predicate is owned by a dedicated NOLOGIN/NOBYPASSRLS role,
-- not the API role. Its only table privilege is SELECT on the membership
-- authority, whose direct self/tenant policy still applies under FORCE RLS.
GRANT USAGE ON SCHEMA core TO pondok_rls_owner;
GRANT SELECT ON core.organization_memberships TO pondok_rls_owner;
GRANT CREATE ON SCHEMA core TO pondok_rls_owner;
DO $ownership$
DECLARE
  migration_role text := current_user;
  migration_is_superuser boolean;
  added_membership boolean := false;
BEGIN
  SELECT rolsuper INTO migration_is_superuser
  FROM pg_roles WHERE rolname = migration_role;

  IF NOT migration_is_superuser AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles granted_role ON granted_role.oid = m.roleid
    JOIN pg_roles member_role ON member_role.oid = m.member
    WHERE granted_role.rolname = 'pondok_rls_owner'
      AND member_role.rolname = migration_role
  ) THEN
    EXECUTE format('GRANT pondok_rls_owner TO %I', migration_role);
    added_membership := true;
  END IF;

  EXECUTE 'ALTER FUNCTION core.has_active_tenant_membership(uuid) OWNER TO pondok_rls_owner';

  IF added_membership THEN
    EXECUTE format('REVOKE pondok_rls_owner FROM %I', migration_role);
  END IF;
END
$ownership$;
REVOKE CREATE ON SCHEMA core FROM pondok_rls_owner;

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
  predicate_role record;
BEGIN
  SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit
  INTO app_role
  FROM pg_roles
  WHERE rolname = 'pondok_app';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pondok_app role was not created';
  END IF;
  IF app_role.rolsuper OR app_role.rolbypassrls
     OR app_role.rolcreatedb OR app_role.rolcreaterole OR app_role.rolinherit THEN
    RAISE EXCEPTION 'pondok_app must be a non-superuser, NOBYPASSRLS, non-admin, NOINHERIT role';
  END IF;

  SELECT r.rolname, r.rolsuper, r.rolbypassrls, r.rolcanlogin, r.rolcreatedb, r.rolcreaterole, r.rolinherit
  INTO predicate_role
  FROM pg_proc p
  JOIN pg_roles r ON r.oid = p.proowner
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'core' AND p.proname = 'has_active_tenant_membership'
    AND p.pronargs = 1 AND p.proargtypes[0] = 'uuid'::regtype;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant membership predicate function was not created';
  END IF;
  predicate_owner := predicate_role.rolname;

  IF predicate_owner IS DISTINCT FROM 'pondok_rls_owner'
     OR predicate_role.rolsuper OR predicate_role.rolbypassrls
     OR predicate_role.rolcanlogin OR predicate_role.rolcreatedb
     OR predicate_role.rolcreaterole OR predicate_role.rolinherit THEN
    RAISE EXCEPTION 'Tenant membership predicate must be owned by a NOLOGIN/NOBYPASSRLS helper role, found %', predicate_owner;
  END IF;
END
$validation$;

COMMIT;
