-- Keep platform-wide license visibility scoped to the platform runtime.
-- Tenant runtime reads only its own license and never needs super-admin authority checks.
BEGIN;

DROP POLICY IF EXISTS tenant_licenses_admin_select ON platform.tenant_licenses;
CREATE POLICY tenant_licenses_admin_select
  ON platform.tenant_licenses
  FOR SELECT TO pondok_platform_runtime
  USING (platform.is_active_super_admin());

CREATE OR REPLACE FUNCTION platform.tenant_license_summary(p_organization_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT jsonb_build_object(
    'status', l.status,
    'planCode', l.plan_code,
    'startsAt', l.starts_at,
    'endsAt', l.ends_at
  )
  FROM platform.tenant_licenses l
  WHERE l.organization_id = p_organization_id
    AND p_organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
  LIMIT 1
$function$;

COMMIT;
