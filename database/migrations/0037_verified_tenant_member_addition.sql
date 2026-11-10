-- Safely add an already-registered, verified account to the active tenant.
-- SECURITY DEFINER keeps neon_auth.user and membership inserts outside the runtime role's direct grants.
BEGIN;

CREATE OR REPLACE FUNCTION core.add_tenant_member_by_email(
  p_email text,
  p_role_keys text[]
)
RETURNS TABLE(outcome text, membership_id uuid, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, neon_auth, audit
AS $function$
DECLARE
  v_actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  v_org uuid := nullif(current_setting('app.organization_id', true), '')::uuid;
  v_email text := lower(trim(coalesce(p_email,'')));
  v_user_id uuid;
  v_membership_id uuid;
  v_role_id uuid;
  v_key text;
  v_allowed text[] := ARRAY[
    'foundation_chair','foundation_secretary','foundation_treasurer',
    'pondok_leader','pondok_deputy','pondok_secretary','pondok_treasurer',
    'academic_coordinator','student_affairs_coordinator','school_principal',
    'homeroom_teacher','teacher','musyrif','finance_cashier','finance_verifier',
    'procurement_officer','warehouse_staff','hr_officer','librarian',
    'admission_officer','inventory_manager','boarding_supervisor',
    'safeguarding_officer','cms_editor','read_only_auditor'
  ];
BEGIN
  IF v_actor IS NULL OR v_org IS NULL OR NOT core.has_active_tenant_membership(v_actor) THEN
    RAISE EXCEPTION 'active_tenant_membership_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM core.organization_memberships om
    JOIN core.membership_roles mr ON mr.membership_id=om.id
    JOIN core.role_permissions rp ON rp.role_id=mr.role_id
    WHERE om.organization_id=v_org AND om.user_id=v_actor
      AND om.membership_status='active'
      AND rp.permission_key='core.members.manage'
  ) THEN
    RAISE EXCEPTION 'member_management_permission_required';
  END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR p_role_keys IS NULL OR cardinality(p_role_keys)<1 OR cardinality(p_role_keys)>12
     OR cardinality(p_role_keys)<>(SELECT count(DISTINCT x) FROM unnest(p_role_keys) x)
     OR EXISTS (SELECT 1 FROM unnest(p_role_keys) x WHERE NOT (x=ANY(v_allowed))) THEN
    RAISE EXCEPTION 'invalid_member_invitation';
  END IF;

  SELECT u.id INTO v_user_id
    FROM neon_auth."user" u
   WHERE lower(u.email)=v_email
     AND u."emailVerified"=true
     AND coalesce(u.banned,false)=false
     AND (u."banExpires" IS NULL OR u."banExpires"<now())
   LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 'account_not_found_or_unverified'::text,NULL::uuid,NULL::uuid;
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM core.organization_memberships om
    WHERE om.organization_id=v_org AND om.user_id=v_user_id
  ) THEN
    RETURN QUERY SELECT 'already_member'::text,NULL::uuid,v_user_id;
    RETURN;
  END IF;

  INSERT INTO core.organization_memberships(organization_id,user_id,membership_status)
  VALUES(v_org,v_user_id,'active') RETURNING id INTO v_membership_id;

  FOREACH v_key IN ARRAY p_role_keys LOOP
    SELECT r.id INTO v_role_id FROM core.roles r
     WHERE r.organization_id IS NULL AND r.is_system=true AND r.role_key=v_key;
    IF v_role_id IS NULL THEN RAISE EXCEPTION 'role_definition_not_found'; END IF;
    INSERT INTO core.membership_roles(membership_id,role_id)
    VALUES(v_membership_id,v_role_id);
  END LOOP;

  INSERT INTO audit.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  VALUES(v_org,v_actor,'tenant.member.added','membership',v_membership_id::text,
    jsonb_build_object('target_user_id',v_user_id::text,'email',v_email,'role_keys',to_jsonb(p_role_keys)));

  RETURN QUERY SELECT 'created'::text,v_membership_id,v_user_id;
END
$function$;

REVOKE ALL ON FUNCTION core.add_tenant_member_by_email(text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.add_tenant_member_by_email(text,text[]) TO pondok_runtime;

COMMIT;
