BEGIN;

-- RLS checks both the requested organization and the authenticated user's active membership.
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
      AND NOT (n.nspname = 'core' AND c.relname = 'organization_memberships')
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
    IF target.schema_name = 'core' AND target.table_name = 'roles' THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I.%I USING (organization_id IS NULL OR (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND core.has_active_tenant_membership(organization_id))) WITH CHECK (organization_id IS NOT NULL AND organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND core.has_active_tenant_membership(organization_id))',
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

-- Fail the migration if a tenant-owned table was missed or policy wiring is incomplete.
DO $validation$
DECLARE
  unsafe_count integer;
BEGIN
  SELECT count(*) INTO unsafe_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('academic', 'admissions', 'assets', 'audit', 'boarding', 'cms', 'config', 'core', 'crm', 'finance', 'hr', 'inventory', 'library', 'procurement', 'sync')
    AND c.relkind = 'r'
    AND NOT (n.nspname = 'core' AND c.relname = 'organization_memberships')
    AND EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attname = 'organization_id'
        AND a.attnum > 0 AND NOT a.attisdropped
    )
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR NOT EXISTS (
      SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
    ));
  IF unsafe_count <> 0 THEN
    RAISE EXCEPTION 'Tenant RLS validation failed for % table(s)', unsafe_count;
  END IF;
END
$validation$;

COMMIT;
