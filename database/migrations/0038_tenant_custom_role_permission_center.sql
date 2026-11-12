-- Tenant-scoped custom roles and server-authorized permission matrix.
-- Additive migration. Apply to Neon Development first; never run against Production without approval.
BEGIN;

INSERT INTO core.permissions(permission_key,description)
VALUES ('core.roles.manage','Create and manage tenant-specific roles and permission grants')
ON CONFLICT(permission_key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO core.role_permissions(role_id,permission_key)
SELECT r.id,'core.roles.manage'
FROM core.roles r
WHERE r.organization_id IS NULL AND r.role_key IN ('institution_owner','institution_admin')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION core.save_tenant_role(
  p_role_id uuid,
  p_role_key text,
  p_role_name text,
  p_permission_keys text[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, audit
AS $function$
DECLARE
  v_actor uuid := nullif(current_setting('app.user_id',true),'')::uuid;
  v_org uuid := nullif(current_setting('app.organization_id',true),'')::uuid;
  v_role_id uuid;
  v_role_key text := lower(trim(coalesce(p_role_key,'')));
  v_role_name text := trim(coalesce(p_role_name,''));
  v_permission_keys text[] := coalesce(p_permission_keys,ARRAY[]::text[]);
BEGIN
  IF v_actor IS NULL OR v_org IS NULL OR NOT core.has_active_tenant_membership(v_org) THEN
    RAISE EXCEPTION 'active_tenant_membership_required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM core.organization_memberships om
    JOIN core.membership_roles mr ON mr.membership_id=om.id
    JOIN core.role_permissions rp ON rp.role_id=mr.role_id
    WHERE om.organization_id=v_org AND om.user_id=v_actor
      AND om.membership_status='active' AND rp.permission_key='core.roles.manage'
  ) THEN
    RAISE EXCEPTION 'role_management_permission_required' USING ERRCODE='42501';
  END IF;
  IF length(v_role_name)<2 OR length(v_role_name)>100
     OR cardinality(v_permission_keys)>100
     OR cardinality(v_permission_keys)<>(SELECT count(DISTINCT x) FROM unnest(v_permission_keys) x) THEN
    RAISE EXCEPTION 'invalid_role_definition' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_permission_keys) requested(permission_key)
    LEFT JOIN core.permissions p ON p.permission_key=requested.permission_key
    WHERE p.permission_key IS NULL
       OR requested.permission_key IN (
         'core.roles.manage','core.members.manage','core.organization.manage',
         'core.campus.manage','settings.manage','sync.devices.manage','sync.conflicts.resolve'
       )
  ) THEN
    RAISE EXCEPTION 'permission_not_assignable_to_custom_role' USING ERRCODE='22023';
  END IF;

  IF p_role_id IS NULL THEN
    IF v_role_key !~ '^custom_[a-z0-9_]{2,55}$' THEN
      RAISE EXCEPTION 'invalid_custom_role_key' USING ERRCODE='22023';
    END IF;
    INSERT INTO core.roles(organization_id,role_key,role_name,is_system)
    VALUES(v_org,v_role_key,v_role_name,false)
    RETURNING id INTO v_role_id;
  ELSE
    SELECT r.id INTO v_role_id
    FROM core.roles r
    WHERE r.id=p_role_id AND r.organization_id=v_org AND r.is_system=false
    FOR UPDATE;
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'custom_role_not_found' USING ERRCODE='P0002';
    END IF;
    UPDATE core.roles SET role_name=v_role_name
    WHERE id=v_role_id AND organization_id=v_org AND is_system=false;
  END IF;

  DELETE FROM core.role_permissions WHERE role_id=v_role_id;
  INSERT INTO core.role_permissions(role_id,permission_key)
  SELECT v_role_id,requested.permission_key
  FROM unnest(v_permission_keys) requested(permission_key);

  INSERT INTO audit.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  VALUES(v_org,v_actor,CASE WHEN p_role_id IS NULL THEN 'tenant.role.created' ELSE 'tenant.role.permissions.updated' END,
    'role',v_role_id::text,jsonb_build_object('roleKey',CASE WHEN p_role_id IS NULL THEN v_role_key ELSE NULL END,
    'roleName',v_role_name,'permissionKeys',to_jsonb(v_permission_keys)));

  RETURN v_role_id;
END
$function$;

CREATE OR REPLACE FUNCTION core.delete_tenant_role(p_role_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, audit
AS $function$
DECLARE
  v_actor uuid := nullif(current_setting('app.user_id',true),'')::uuid;
  v_org uuid := nullif(current_setting('app.organization_id',true),'')::uuid;
  v_role_key text;
  v_role_name text;
BEGIN
  IF v_actor IS NULL OR v_org IS NULL OR NOT core.has_active_tenant_membership(v_org) THEN
    RAISE EXCEPTION 'active_tenant_membership_required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM core.organization_memberships om
    JOIN core.membership_roles mr ON mr.membership_id=om.id
    JOIN core.role_permissions rp ON rp.role_id=mr.role_id
    WHERE om.organization_id=v_org AND om.user_id=v_actor
      AND om.membership_status='active' AND rp.permission_key='core.roles.manage'
  ) THEN
    RAISE EXCEPTION 'role_management_permission_required' USING ERRCODE='42501';
  END IF;
  SELECT r.role_key,r.role_name INTO v_role_key,v_role_name
  FROM core.roles r
  WHERE r.id=p_role_id AND r.organization_id=v_org AND r.is_system=false
  FOR UPDATE;
  IF v_role_key IS NULL THEN RAISE EXCEPTION 'custom_role_not_found' USING ERRCODE='P0002'; END IF;
  IF EXISTS(SELECT 1 FROM core.membership_roles WHERE role_id=p_role_id) THEN
    RAISE EXCEPTION 'custom_role_in_use' USING ERRCODE='23503';
  END IF;
  DELETE FROM core.roles WHERE id=p_role_id AND organization_id=v_org AND is_system=false;
  INSERT INTO audit.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  VALUES(v_org,v_actor,'tenant.role.deleted','role',p_role_id::text,
    jsonb_build_object('roleKey',v_role_key,'roleName',v_role_name));
  RETURN true;
END
$function$;

-- Extend verified-account member addition to accept this tenant's custom roles.
CREATE OR REPLACE FUNCTION core.add_tenant_member_by_email(
  p_email text,
  p_role_keys text[]
)
RETURNS TABLE(outcome text,membership_id uuid,user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, neon_auth, audit
AS $function$
DECLARE
  v_actor uuid := nullif(current_setting('app.user_id',true),'')::uuid;
  v_org uuid := nullif(current_setting('app.organization_id',true),'')::uuid;
  v_email text := lower(trim(coalesce(p_email,'')));
  v_user_id uuid;
  v_membership_id uuid;
  v_role_id uuid;
  v_key text;
BEGIN
  IF v_actor IS NULL OR v_org IS NULL OR NOT core.has_active_tenant_membership(v_org) THEN
    RAISE EXCEPTION 'active_tenant_membership_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM core.organization_memberships om
    JOIN core.membership_roles mr ON mr.membership_id=om.id
    JOIN core.role_permissions rp ON rp.role_id=mr.role_id
    WHERE om.organization_id=v_org AND om.user_id=v_actor
      AND om.membership_status='active' AND rp.permission_key='core.members.manage'
  ) THEN RAISE EXCEPTION 'member_management_permission_required'; END IF;
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR p_role_keys IS NULL OR cardinality(p_role_keys)<1 OR cardinality(p_role_keys)>12
     OR cardinality(p_role_keys)<>(SELECT count(DISTINCT x) FROM unnest(p_role_keys) x)
     OR EXISTS (
       SELECT 1 FROM unnest(p_role_keys) requested(role_key)
       WHERE requested.role_key IN ('institution_owner','institution_admin')
          OR NOT EXISTS (SELECT 1 FROM core.roles r WHERE r.role_key=requested.role_key
            AND ((r.organization_id IS NULL AND r.is_system=true)
              OR (r.organization_id=v_org AND r.is_system=false)))
     ) THEN RAISE EXCEPTION 'invalid_member_invitation'; END IF;

  SELECT u.id INTO v_user_id FROM neon_auth."user" u
  WHERE lower(u.email)=v_email AND u."emailVerified"=true
    AND coalesce(u.banned,false)=false AND (u."banExpires" IS NULL OR u."banExpires"<now())
  LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 'account_not_found_or_unverified'::text,NULL::uuid,NULL::uuid; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM core.organization_memberships om WHERE om.organization_id=v_org AND om.user_id=v_user_id) THEN
    RETURN QUERY SELECT 'already_member'::text,NULL::uuid,v_user_id; RETURN;
  END IF;
  INSERT INTO core.organization_memberships(organization_id,user_id,membership_status)
  VALUES(v_org,v_user_id,'active') RETURNING id INTO v_membership_id;
  FOREACH v_key IN ARRAY p_role_keys LOOP
    SELECT r.id INTO v_role_id FROM core.roles r
    WHERE r.role_key=v_key AND ((r.organization_id IS NULL AND r.is_system=true)
      OR (r.organization_id=v_org AND r.is_system=false));
    IF v_role_id IS NULL THEN RAISE EXCEPTION 'role_definition_not_found'; END IF;
    INSERT INTO core.membership_roles(membership_id,role_id) VALUES(v_membership_id,v_role_id);
  END LOOP;
  INSERT INTO audit.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  VALUES(v_org,v_actor,'tenant.member.added','membership',v_membership_id::text,
    jsonb_build_object('target_user_id',v_user_id::text,'email',v_email,'role_keys',to_jsonb(p_role_keys)));
  RETURN QUERY SELECT 'created'::text,v_membership_id,v_user_id;
END
$function$;

REVOKE ALL ON FUNCTION core.save_tenant_role(uuid,text,text,text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.delete_tenant_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.add_tenant_member_by_email(text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.save_tenant_role(uuid,text,text,text[]) TO pondok_runtime;
GRANT EXECUTE ON FUNCTION core.delete_tenant_role(uuid) TO pondok_runtime;
GRANT EXECUTE ON FUNCTION core.add_tenant_member_by_email(text,text[]) TO pondok_runtime;

COMMIT;
