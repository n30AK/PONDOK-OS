-- PONDOK OS Module Registry
-- Persistent publisher allowlist, immutable submission snapshots, and append-only review evidence.
-- Prepared for Development review only. Do not apply to any Neon branch without explicit approval.
BEGIN;

CREATE TABLE IF NOT EXISTS platform.module_publishers (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  granted_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK ((status = 'active' AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS platform.module_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  module_id text NOT NULL CHECK (length(module_id) BETWEEN 5 AND 160),
  module_version text NOT NULL CHECK (length(module_version) BETWEEN 5 AND 80),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  manifest_digest bytea NOT NULL CHECK (octet_length(manifest_digest) = 32),
  submitted_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','approved','rejected','installing','installed','failed','rollback_pending','rolled_back')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 128),
  CONSTRAINT module_requests_no_self_review CHECK (reviewed_by IS NULL OR reviewed_by <> submitted_by),
  CONSTRAINT module_requests_submitter_idempotency UNIQUE (submitted_by, idempotency_key)
);

CREATE INDEX IF NOT EXISTS module_requests_status_created
  ON platform.module_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS module_requests_org_created
  ON platform.module_requests (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS module_requests_module_version
  ON platform.module_requests (module_id, module_version);

CREATE TABLE IF NOT EXISTS platform.module_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES platform.module_requests(id),
  actor_user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('submit','approve','reject','begin_install','mark_installed','mark_failed','request_rollback','complete_rollback')),
  from_status text NOT NULL CHECK (from_status IN ('draft','submitted','approved','rejected','installing','installed','failed','rollback_pending','rolled_back')),
  to_status text NOT NULL CHECK (to_status IN ('draft','submitted','approved','rejected','installing','installed','failed','rollback_pending','rolled_back')),
  note text CHECK (note IS NULL OR length(note) <= 1000),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS module_request_events_request_time
  ON platform.module_request_events (request_id, occurred_at, id);

CREATE OR REPLACE FUNCTION platform.is_active_module_publisher()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM platform.module_publishers p
    WHERE p.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND p.status = 'active'
  )
$function$;

CREATE OR REPLACE FUNCTION platform.guard_module_request_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, platform
AS $function$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.module_id IS DISTINCT FROM OLD.module_id
    OR NEW.module_version IS DISTINCT FROM OLD.module_version
    OR NEW.manifest IS DISTINCT FROM OLD.manifest
    OR NEW.manifest_digest IS DISTINCT FROM OLD.manifest_digest
    OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'module request submission snapshot is immutable'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by = NEW.submitted_by THEN
    RAISE EXCEPTION 'module request submitter cannot review their own request'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS module_request_snapshot_immutable ON platform.module_requests;
CREATE TRIGGER module_request_snapshot_immutable
  BEFORE UPDATE ON platform.module_requests
  FOR EACH ROW EXECUTE FUNCTION platform.guard_module_request_snapshot();

REVOKE ALL ON FUNCTION platform.is_active_module_publisher() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.guard_module_request_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.is_active_module_publisher() TO pondok_platform_runtime;

GRANT USAGE ON SCHEMA platform TO pondok_platform_runtime;
GRANT SELECT, INSERT, UPDATE ON platform.module_publishers TO pondok_platform_runtime;
GRANT SELECT, INSERT, UPDATE ON platform.module_requests TO pondok_platform_runtime;
GRANT SELECT, INSERT ON platform.module_request_events TO pondok_platform_runtime;

ALTER TABLE platform.module_publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.module_publishers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS module_publishers_super_admin_only ON platform.module_publishers;
CREATE POLICY module_publishers_super_admin_only ON platform.module_publishers
  FOR ALL
  USING (platform.is_active_super_admin())
  WITH CHECK (platform.is_active_super_admin());

ALTER TABLE platform.module_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.module_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS module_requests_select_owner_or_admin ON platform.module_requests;
DROP POLICY IF EXISTS module_requests_submit_publisher ON platform.module_requests;
DROP POLICY IF EXISTS module_requests_review_admin_only ON platform.module_requests;
CREATE POLICY module_requests_select_owner_or_admin ON platform.module_requests
  FOR SELECT
  USING (
    submitted_by = nullif(current_setting('app.user_id', true), '')::uuid
    OR platform.is_active_super_admin()
  );
CREATE POLICY module_requests_submit_publisher ON platform.module_requests
  FOR INSERT
  WITH CHECK (
    submitted_by = nullif(current_setting('app.user_id', true), '')::uuid
    AND status = 'submitted'
    AND platform.is_active_module_publisher()
  );
CREATE POLICY module_requests_review_admin_only ON platform.module_requests
  FOR UPDATE
  USING (platform.is_active_super_admin())
  WITH CHECK (
    platform.is_active_super_admin()
    AND (reviewed_by IS NULL OR reviewed_by <> submitted_by)
  );

ALTER TABLE platform.module_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.module_request_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS module_request_events_select_owner_or_admin ON platform.module_request_events;
DROP POLICY IF EXISTS module_request_events_insert_submitter_or_admin ON platform.module_request_events;
CREATE POLICY module_request_events_select_owner_or_admin ON platform.module_request_events
  FOR SELECT
  USING (
    platform.is_active_super_admin()
    OR EXISTS (
      SELECT 1 FROM platform.module_requests r
      WHERE r.id = request_id
        AND r.submitted_by = nullif(current_setting('app.user_id', true), '')::uuid
    )
  );
CREATE POLICY module_request_events_insert_submitter_or_admin ON platform.module_request_events
  FOR INSERT
  WITH CHECK (
    platform.is_active_super_admin()
    OR (
      actor_user_id = nullif(current_setting('app.user_id', true), '')::uuid
      AND action = 'submit'
      AND from_status = 'draft'
      AND to_status = 'submitted'
      AND EXISTS (
        SELECT 1 FROM platform.module_requests r
        WHERE r.id = request_id
          AND r.submitted_by = actor_user_id
          AND r.status = 'submitted'
      )
    )
  );

DO $validation$
DECLARE target record;
BEGIN
  FOR target IN
    SELECT unnest(ARRAY[
      'platform.module_publishers',
      'platform.module_requests',
      'platform.module_request_events'
    ]) AS table_name
  LOOP
    IF NOT (
      SELECT c.relrowsecurity AND c.relforcerowsecurity
      FROM pg_class c WHERE c.oid = target.table_name::regclass
    ) THEN
      RAISE EXCEPTION 'Module Registry table must enforce RLS: %', target.table_name;
    END IF;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'pondok_platform_runtime'
      AND NOT rolcanlogin AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'pondok_platform_runtime must remain NOLOGIN and NOBYPASSRLS';
  END IF;
END
$validation$;

COMMIT;
