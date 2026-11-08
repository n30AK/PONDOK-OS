-- Explicitly separate guardian/legal-authority verification from ordinary student record editing.
BEGIN;

ALTER TABLE academic.student_guardians
  ADD COLUMN IF NOT EXISTS verified_by uuid;

INSERT INTO core.permissions (permission_key, description)
VALUES ('academic.students.guardians.verify','Verify legal guardian and student pickup authority')
ON CONFLICT (permission_key) DO UPDATE SET description=EXCLUDED.description;

INSERT INTO core.role_permissions (role_id, permission_key)
SELECT r.id, 'academic.students.guardians.verify'
FROM core.roles r
WHERE r.organization_id IS NULL
  AND r.role_key IN ('institution_owner','institution_admin')
ON CONFLICT (role_id, permission_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS student_guardians_verification_audit
  ON academic.student_guardians (organization_id, verified_at DESC)
  WHERE verified_at IS NOT NULL;

DO $validation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM core.permissions
    WHERE permission_key='academic.students.guardians.verify'
  ) THEN
    RAISE EXCEPTION 'guardian verification permission missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid='academic.student_guardians'::regclass AND relrowsecurity AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'student guardian relationship must enforce tenant RLS';
  END IF;
END
$validation$;

COMMIT;
