-- Protect the membership authority table without breaking controlled onboarding.
BEGIN;

CREATE OR REPLACE FUNCTION platform.can_activate_membership_for_org(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM platform.activation_requests r
    JOIN platform.activation_tokens t ON t.request_id = r.id
    WHERE r.organization_id = p_organization_id
      AND r.requested_by = nullif(current_setting('app.user_id', true), '')::uuid
      AND r.status = 'activated'
      AND t.requested_by = r.requested_by
      AND t.consumed_at IS NOT NULL
  )
$function$;

REVOKE ALL ON FUNCTION platform.can_activate_membership_for_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.can_activate_membership_for_org(uuid) TO pondok_platform_runtime;

ALTER TABLE core.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.organization_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_memberships_tenant_self_read ON core.organization_memberships;
DROP POLICY IF EXISTS organization_memberships_platform_self_or_admin_read ON core.organization_memberships;
DROP POLICY IF EXISTS organization_memberships_platform_controlled_insert ON core.organization_memberships;

CREATE POLICY organization_memberships_tenant_self_read
  ON core.organization_memberships
  FOR SELECT TO pondok_runtime
  USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    AND organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND membership_status = 'active'
  );

CREATE POLICY organization_memberships_platform_self_or_admin_read
  ON core.organization_memberships
  FOR SELECT TO pondok_platform_runtime
  USING (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
    OR platform.is_active_super_admin()
  );

CREATE POLICY organization_memberships_platform_controlled_insert
  ON core.organization_memberships
  FOR INSERT TO pondok_platform_runtime
  WITH CHECK (
    platform.is_active_super_admin()
    OR (
      user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND platform.can_activate_membership_for_org(organization_id)
    )
  );

DO $validation$
DECLARE
  policy_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'core.organization_memberships'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'core.organization_memberships must enable and force RLS';
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policy
  WHERE polrelid = 'core.organization_memberships'::regclass
    AND polname IN (
      'organization_memberships_tenant_self_read',
      'organization_memberships_platform_self_or_admin_read',
      'organization_memberships_platform_controlled_insert'
    );
  IF policy_count <> 3 THEN
    RAISE EXCEPTION 'core.organization_memberships policy validation failed';
  END IF;
END
$validation$;

COMMIT;
