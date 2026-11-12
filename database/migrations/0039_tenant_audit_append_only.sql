-- Make tenant audit events append-only for the restricted application runtime.
-- Tenant runtime may read and append its own events, but cannot rewrite history.
-- Apply to Neon Development first; Production is out of scope.
BEGIN;

REVOKE UPDATE, DELETE, REFERENCES, TRIGGER
  ON audit.audit_events FROM pondok_runtime;

GRANT SELECT, INSERT ON audit.audit_events TO pondok_runtime;

DO $validation$
BEGIN
  IF has_table_privilege('pondok_runtime','audit.audit_events','UPDATE')
     OR has_table_privilege('pondok_runtime','audit.audit_events','DELETE')
     OR has_table_privilege('pondok_runtime','audit.audit_events','REFERENCES')
     OR has_table_privilege('pondok_runtime','audit.audit_events','TRIGGER') THEN
    RAISE EXCEPTION 'tenant_audit_runtime_must_be_append_only';
  END IF;

  IF NOT has_table_privilege('pondok_runtime','audit.audit_events','SELECT')
     OR NOT has_table_privilege('pondok_runtime','audit.audit_events','INSERT') THEN
    RAISE EXCEPTION 'tenant_audit_runtime_read_insert_privileges_required';
  END IF;
END
$validation$;

COMMIT;
