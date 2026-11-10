-- Harden pending trial access: only the verified trial recipient may start it.
-- Tenants without a license are not entitled to workspace access.
-- Apply to Neon Development first; never apply to Production without separate approval.
BEGIN;

CREATE OR REPLACE FUNCTION platform.tenant_license_allows_access(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM platform.tenant_licenses l
    WHERE l.organization_id = p_organization_id
      AND (
        l.status = 'active'
        OR (
          l.status = 'trial'
          AND (
            l.ends_at > now()
            OR (
              l.ends_at IS NULL
              AND l.trial_granted_to = nullif(current_setting('app.user_id', true), '')::uuid
            )
          )
        )
      )
  )
$function$;

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
  v_trial_ends_at timestamptz;
  v_trial_owner uuid;
BEGIN
  IF p_organization_id IS NULL
     OR p_organization_id <> v_organization_id
     OR v_user_id IS NULL THEN
    RAISE EXCEPTION 'tenant trial can only start inside its authenticated tenant context';
  END IF;

  -- Paid/active tenants and already-started trials do not need a start transition.
  SELECT l.starts_at, l.ends_at, l.trial_granted_to
    INTO v_started_at, v_trial_ends_at, v_trial_owner
    FROM platform.tenant_licenses l
   WHERE l.organization_id = p_organization_id
     AND l.status = 'trial'
     AND l.plan_code = 'trial-14d';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_trial_ends_at IS NOT NULL THEN
    RETURN v_started_at;
  END IF;

  IF v_trial_owner IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'only the verified trial recipient can start this trial';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM core.organization_memberships om
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
     AND trial_granted_to = v_user_id
     AND ends_at IS NULL;

  SELECT l.starts_at INTO v_started_at
    FROM platform.tenant_licenses l
   WHERE l.organization_id = p_organization_id
     AND l.status = 'trial'
     AND l.plan_code = 'trial-14d'
     AND l.trial_granted_to = v_user_id;

  RETURN v_started_at;
END
$function$;

REVOKE ALL ON FUNCTION platform.tenant_license_allows_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.start_tenant_trial_on_first_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.tenant_license_allows_access(uuid) TO pondok_runtime;
GRANT EXECUTE ON FUNCTION platform.start_tenant_trial_on_first_access(uuid) TO pondok_runtime;

COMMIT;
