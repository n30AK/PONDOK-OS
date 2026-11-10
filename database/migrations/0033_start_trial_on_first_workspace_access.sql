-- Start the tenant's 14-day trial on its first authenticated workspace access.
-- A pending trial has no expiry until the first tenant workspace context is opened.
BEGIN;

ALTER POLICY tenant_licenses_trial_issue
  ON platform.tenant_licenses
  WITH CHECK (
    platform.is_active_super_admin()
    OR (
      status = 'trial'
      AND plan_code = 'trial-14d'
      AND trial_granted_to = nullif(current_setting('app.user_id', true), '')::uuid
      AND ends_at IS NULL
      AND platform.can_issue_trial_license_for_org(organization_id, trial_granted_to)
    )
  );

CREATE OR REPLACE FUNCTION platform.start_tenant_trial_on_first_access(p_organization_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, core
AS $function$
DECLARE
  v_user_id uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  v_organization_id uuid := nullif(current_setting('app.organization_id', true), '')::uuid;
  v_started_at timestamptz;
BEGIN
  IF p_organization_id IS NULL OR p_organization_id <> v_organization_id OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'tenant trial can only start inside its authenticated tenant context';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM core.organization_memberships om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = v_user_id
      AND om.membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'active tenant membership required to start trial';
  END IF;

  UPDATE platform.tenant_licenses
     SET starts_at = now(),
         ends_at = now() + interval '14 days',
         updated_at = now()
   WHERE organization_id = p_organization_id
     AND status = 'trial'
     AND plan_code = 'trial-14d'
     AND ends_at IS NULL;

  SELECT l.starts_at INTO v_started_at
    FROM platform.tenant_licenses l
   WHERE l.organization_id = p_organization_id
     AND l.status = 'trial'
     AND l.plan_code = 'trial-14d';

  RETURN v_started_at;
END
$function$;

REVOKE ALL ON FUNCTION platform.start_tenant_trial_on_first_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.start_tenant_trial_on_first_access(uuid) TO pondok_runtime;

COMMIT;
