-- Member-level operational scope assignments.
-- DRAFT: must be reviewed and explicitly approved before applying to Neon Development.
-- Never apply this migration to Production as part of this change.
BEGIN;

-- Composite FK target for tenant-safe membership references.
ALTER TABLE core.organization_memberships
  ADD CONSTRAINT organization_memberships_organization_id_id_key
  UNIQUE (organization_id, id);

-- Keep each scope type FK-backed. Do not use a polymorphic scope_type/scope_id pair:
-- PostgreSQL cannot enforce tenant ownership of arbitrary polymorphic targets.
CREATE TABLE core.membership_campus_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  campus_id uuid NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  CONSTRAINT membership_campus_scopes_reason_check CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT membership_campus_scopes_dates_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT membership_campus_scopes_revocation_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT membership_campus_scopes_membership_fk FOREIGN KEY (organization_id,membership_id)
    REFERENCES core.organization_memberships(organization_id,id),
  CONSTRAINT membership_campus_scopes_campus_fk FOREIGN KEY (organization_id,campus_id)
    REFERENCES core.campuses(organization_id,id)
);

CREATE TABLE core.membership_department_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  department_id uuid NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  CONSTRAINT membership_department_scopes_reason_check CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT membership_department_scopes_dates_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT membership_department_scopes_revocation_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT membership_department_scopes_membership_fk FOREIGN KEY (organization_id,membership_id)
    REFERENCES core.organization_memberships(organization_id,id),
  CONSTRAINT membership_department_scopes_department_fk FOREIGN KEY (organization_id,department_id)
    REFERENCES hr.departments(organization_id,id)
);

CREATE TABLE core.membership_class_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  CONSTRAINT membership_class_scopes_reason_check CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT membership_class_scopes_dates_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT membership_class_scopes_revocation_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT membership_class_scopes_membership_fk FOREIGN KEY (organization_id,membership_id)
    REFERENCES core.organization_memberships(organization_id,id),
  CONSTRAINT membership_class_scopes_class_fk FOREIGN KEY (organization_id,class_group_id)
    REFERENCES academic.class_groups(organization_id,id)
);

-- A teacher's subject scope is tied to the actual class-subject offering,
-- not just a subject master record that may be taught in several classes.
CREATE TABLE core.membership_class_subject_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  class_subject_id uuid NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  CONSTRAINT membership_class_subject_scopes_reason_check CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT membership_class_subject_scopes_dates_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT membership_class_subject_scopes_revocation_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT membership_class_subject_scopes_membership_fk FOREIGN KEY (organization_id,membership_id)
    REFERENCES core.organization_memberships(organization_id,id),
  CONSTRAINT membership_class_subject_scopes_offering_fk FOREIGN KEY (organization_id,class_subject_id)
    REFERENCES academic.class_subjects(organization_id,id)
);

CREATE TABLE core.membership_dormitory_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  dormitory_id uuid NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  CONSTRAINT membership_dormitory_scopes_reason_check CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT membership_dormitory_scopes_dates_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT membership_dormitory_scopes_revocation_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT membership_dormitory_scopes_membership_fk FOREIGN KEY (organization_id,membership_id)
    REFERENCES core.organization_memberships(organization_id,id),
  CONSTRAINT membership_dormitory_scopes_dormitory_fk FOREIGN KEY (organization_id,dormitory_id)
    REFERENCES boarding.dormitories(organization_id,id)
);

CREATE TABLE core.membership_room_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  room_id uuid NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  reason text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid,
  CONSTRAINT membership_room_scopes_reason_check CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT membership_room_scopes_dates_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT membership_room_scopes_revocation_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT membership_room_scopes_membership_fk FOREIGN KEY (organization_id,membership_id)
    REFERENCES core.organization_memberships(organization_id,id),
  CONSTRAINT membership_room_scopes_room_fk FOREIGN KEY (organization_id,room_id)
    REFERENCES boarding.rooms(organization_id,id)
);

-- One active (not revoked) assignment per member and concrete target.
CREATE UNIQUE INDEX membership_campus_scopes_active_uq
  ON core.membership_campus_scopes(organization_id,membership_id,campus_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX membership_department_scopes_active_uq
  ON core.membership_department_scopes(organization_id,membership_id,department_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX membership_class_scopes_active_uq
  ON core.membership_class_scopes(organization_id,membership_id,class_group_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX membership_class_subject_scopes_active_uq
  ON core.membership_class_subject_scopes(organization_id,membership_id,class_subject_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX membership_dormitory_scopes_active_uq
  ON core.membership_dormitory_scopes(organization_id,membership_id,dormitory_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX membership_room_scopes_active_uq
  ON core.membership_room_scopes(organization_id,membership_id,room_id) WHERE revoked_at IS NULL;

CREATE INDEX membership_campus_scopes_member_idx ON core.membership_campus_scopes(organization_id,membership_id);
CREATE INDEX membership_department_scopes_member_idx ON core.membership_department_scopes(organization_id,membership_id);
CREATE INDEX membership_class_scopes_member_idx ON core.membership_class_scopes(organization_id,membership_id);
CREATE INDEX membership_class_subject_scopes_member_idx ON core.membership_class_subject_scopes(organization_id,membership_id);
CREATE INDEX membership_dormitory_scopes_member_idx ON core.membership_dormitory_scopes(organization_id,membership_id);
CREATE INDEX membership_room_scopes_member_idx ON core.membership_room_scopes(organization_id,membership_id);

-- Scope grants are immutable except for a one-way revocation. The actor may not
-- grant/revoke scope on their own membership. The API still enforces tenant role
-- permissions and writes the corresponding append-only audit event.
CREATE OR REPLACE FUNCTION core.guard_membership_scope_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, core
AS $function$
DECLARE
  actor_id uuid;
  target_user_id uuid;
BEGIN
  actor_id := nullif(current_setting('app.user_id', true), '')::uuid;
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'membership_scope_actor_required' USING ERRCODE = '42501';
  END IF;

  SELECT om.user_id INTO target_user_id
  FROM core.organization_memberships om
  WHERE om.organization_id = NEW.organization_id
    AND om.id = NEW.membership_id
    AND om.membership_status = 'active';

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'membership_scope_target_must_be_active' USING ERRCODE = '23503';
  END IF;
  IF target_user_id = actor_id THEN
    RAISE EXCEPTION 'membership_scope_self_change_forbidden' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by <> actor_id OR NEW.revoked_at IS NOT NULL OR NEW.revoked_by IS NOT NULL THEN
      RAISE EXCEPTION 'membership_scope_invalid_creator_or_initial_state' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.revoked_at IS NOT NULL
     OR NEW.revoked_at IS NULL
     OR NEW.revoked_by <> actor_id
     OR (to_jsonb(NEW) - ARRAY['revoked_at','revoked_by'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['revoked_at','revoked_by']) THEN
    RAISE EXCEPTION 'membership_scope_only_one_way_revocation_allowed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

-- A table-specific trigger wrapper is necessary because each table has a
-- different scope target column. The shared guard above is used for common
-- membership/actor invariants; immutable row checks are enforced by privileges.
DO $triggers$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'membership_campus_scopes',
    'membership_department_scopes',
    'membership_class_scopes',
    'membership_class_subject_scopes',
    'membership_dormitory_scopes',
    'membership_room_scopes'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER guard_scope_assignment BEFORE INSERT OR UPDATE ON core.%I FOR EACH ROW EXECUTE FUNCTION core.guard_membership_scope_assignment()',
      target_table
    );
  END LOOP;
END
$triggers$;

-- RLS defense-in-depth: only the active tenant context can see or mutate assignments.
DO $rls$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'membership_campus_scopes',
    'membership_department_scopes',
    'membership_class_scopes',
    'membership_class_subject_scopes',
    'membership_dormitory_scopes',
    'membership_room_scopes'
  ] LOOP
    EXECUTE format('ALTER TABLE core.%I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE core.%I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE format('CREATE POLICY tenant_isolation ON core.%I USING (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid AND core.has_active_tenant_membership(organization_id)) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'',true),'''')::uuid AND core.has_active_tenant_membership(organization_id))', target_table);
  END LOOP;
END
$rls$;

-- Runtime can read/create and revoke (only revocation columns are updateable).
DO $grants$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'membership_campus_scopes',
    'membership_department_scopes',
    'membership_class_scopes',
    'membership_class_subject_scopes',
    'membership_dormitory_scopes',
    'membership_room_scopes'
  ] LOOP
    EXECUTE format('REVOKE ALL ON core.%I FROM PUBLIC', target_table);
    EXECUTE format('GRANT SELECT, INSERT ON core.%I TO pondok_runtime', target_table);
    EXECUTE format('GRANT UPDATE (revoked_at,revoked_by) ON core.%I TO pondok_runtime', target_table);
  END LOOP;
END
$grants$;

REVOKE ALL ON FUNCTION core.guard_membership_scope_assignment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.guard_membership_scope_assignment() TO pondok_runtime;

COMMENT ON TABLE core.membership_campus_scopes IS 'Explicit campus scope assignments for tenant memberships; rows are revoked, not deleted.';
COMMENT ON TABLE core.membership_department_scopes IS 'Explicit HR department/unit scope assignments for tenant memberships; rows are revoked, not deleted.';
COMMENT ON TABLE core.membership_class_scopes IS 'Explicit class-group scope assignments for tenant memberships; rows are revoked, not deleted.';
COMMENT ON TABLE core.membership_class_subject_scopes IS 'Explicit class-subject offering scope assignments for tenant memberships; rows are revoked, not deleted.';
COMMENT ON TABLE core.membership_dormitory_scopes IS 'Explicit dormitory scope assignments for tenant memberships; rows are revoked, not deleted.';
COMMENT ON TABLE core.membership_room_scopes IS 'Explicit room scope assignments for tenant memberships; rows are revoked, not deleted.';

-- Validate RLS and runtime grants before allowing the migration to complete.
DO $validation$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'membership_campus_scopes',
    'membership_department_scopes',
    'membership_class_scopes',
    'membership_class_subject_scopes',
    'membership_dormitory_scopes',
    'membership_room_scopes'
  ] LOOP
    IF NOT (SELECT c.relrowsecurity AND c.relforcerowsecurity
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='core' AND c.relname=target_table) THEN
      RAISE EXCEPTION 'membership_scope_rls_missing_for_%', target_table;
    END IF;
    IF NOT has_table_privilege('pondok_runtime',format('core.%I',target_table),'SELECT')
       OR NOT has_table_privilege('pondok_runtime',format('core.%I',target_table),'INSERT')
       OR has_table_privilege('pondok_runtime',format('core.%I',target_table),'DELETE') THEN
      RAISE EXCEPTION 'membership_scope_runtime_grants_invalid_for_%', target_table;
    END IF;
  END LOOP;
END
$validation$;

COMMIT;
