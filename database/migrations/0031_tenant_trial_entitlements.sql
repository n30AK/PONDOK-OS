-- 14-day full-access tenant trial issued when an approved activation is redeemed.
-- Apply to Neon Development first; never apply to Production without separate approval.
BEGIN;

ALTER TABLE platform.tenant_licenses
  ADD COLUMN IF NOT EXISTS trial_granted_to uuid;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_licenses_one_trial_per_user
  ON platform.tenant_licenses(trial_granted_to)
  WHERE trial_granted_to IS NOT NULL;

CREATE OR REPLACE FUNCTION platform.can_issue_trial_license_for_org(
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT p_user_id = nullif(current_setting('app.user_id', true), '')::uuid
     AND EXISTS (
       SELECT 1
       FROM platform.activation_requests r
       WHERE r.organization_id = p_organization_id
         AND r.requested_by = p_user_id
         AND r.status = 'activated'
     )
$function$;

REVOKE ALL ON FUNCTION platform.can_issue_trial_license_for_org(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.can_issue_trial_license_for_org(uuid, uuid) TO pondok_platform_runtime;

GRANT INSERT ON platform.tenant_licenses TO pondok_platform_runtime;

DROP POLICY IF EXISTS tenant_licenses_admin_only ON platform.tenant_licenses;
CREATE POLICY tenant_licenses_admin_select
  ON platform.tenant_licenses
  FOR SELECT
  USING (platform.is_active_super_admin());

CREATE POLICY tenant_licenses_tenant_self_read
  ON platform.tenant_licenses
  FOR SELECT
  USING (organization_id = nullif(current_setting('app.organization_id', true), '')::uuid);

GRANT SELECT ON platform.tenant_licenses TO pondok_runtime;

CREATE POLICY tenant_licenses_trial_issue
  ON platform.tenant_licenses
  FOR INSERT
  WITH CHECK (
    platform.is_active_super_admin()
    OR (
      status = 'trial'
      AND plan_code = 'trial-14d'
      AND trial_granted_to = nullif(current_setting('app.user_id', true), '')::uuid
      AND ends_at = starts_at + interval '14 days'
      AND platform.can_issue_trial_license_for_org(organization_id, trial_granted_to)
    )
  );

CREATE OR REPLACE FUNCTION platform.tenant_license_allows_access(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM platform.tenant_licenses l
    WHERE l.organization_id = p_organization_id
  )
  OR EXISTS (
    SELECT 1
    FROM platform.tenant_licenses l
    WHERE l.organization_id = p_organization_id
      AND l.status IN ('trial','active')
      AND (l.ends_at IS NULL OR l.ends_at > now())
  )
$function$;

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
    AND (
      platform.is_active_super_admin()
      OR p_organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    )
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION platform.tenant_license_allows_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.tenant_license_summary(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA platform TO pondok_runtime;
GRANT EXECUTE ON FUNCTION platform.tenant_license_allows_access(uuid) TO pondok_runtime;
GRANT EXECUTE ON FUNCTION platform.tenant_license_summary(uuid) TO pondok_runtime;

COMMIT;
