-- PONDOK OS: normalized institutional master data and sensitive-record boundaries.
-- This migration is code-only until explicitly applied to Neon Development.
BEGIN;

ALTER TABLE academic.student_profiles
  ADD COLUMN IF NOT EXISTS birth_place text,
  ADD COLUMN IF NOT EXISTS citizenship_code char(2) NOT NULL DEFAULT 'ID',
  ADD COLUMN IF NOT EXISTS national_student_number text,
  ADD COLUMN IF NOT EXISTS entry_date date,
  ADD COLUMN IF NOT EXISTS previous_school_name text,
  ADD COLUMN IF NOT EXISTS current_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS permanent_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_phone text,
  ADD COLUMN IF NOT EXISTS primary_email text,
  ADD COLUMN IF NOT EXISTS photo_object_key text,
  ADD COLUMN IF NOT EXISTS profile_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_verified_by uuid,
  ADD CONSTRAINT student_profiles_address_objects CHECK (
    jsonb_typeof(current_address) = 'object' AND jsonb_typeof(permanent_address) = 'object'
  );

CREATE UNIQUE INDEX IF NOT EXISTS academic_students_nisn_unique
  ON academic.student_profiles (organization_id, national_student_number)
  WHERE national_student_number IS NOT NULL AND national_student_number <> '';

ALTER TABLE academic.guardians
  ADD COLUMN IF NOT EXISTS relationship_default text,
  ADD COLUMN IF NOT EXISTS phone_primary text,
  ADD COLUMN IF NOT EXISTS phone_alternate text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS address jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS preferred_contact_channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS consent_status text NOT NULL DEFAULT 'pending',
  ADD CONSTRAINT guardians_address_object CHECK (jsonb_typeof(address) = 'object'),
  ADD CONSTRAINT guardians_contact_channel_check CHECK (preferred_contact_channel IN ('whatsapp','phone','email','letter','none')),
  ADD CONSTRAINT guardians_consent_status_check CHECK (consent_status IN ('pending','granted','withdrawn','not_required'));

ALTER TABLE academic.student_guardians
  ADD COLUMN IF NOT EXISTS is_legal_guardian boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_emergency_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_pickup_student boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valid_from date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_note text,
  ADD CONSTRAINT student_guardians_validity_check CHECK (valid_until IS NULL OR valid_until >= valid_from);

CREATE UNIQUE INDEX IF NOT EXISTS student_guardians_one_primary
  ON academic.student_guardians (organization_id, student_id)
  WHERE is_primary = true;

-- Medical details are stored separately from general student records.
-- Free-text medical history is encrypted by the application using envelope encryption;
-- raw medical text must never be written into profile_data or ordinary audit metadata.
CREATE TABLE IF NOT EXISTS academic.student_health_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  student_id uuid NOT NULL,
  blood_group_ciphertext bytea,
  allergy_data_ciphertext bytea,
  medical_history_ciphertext bytea,
  medication_data_ciphertext bytea,
  emergency_instructions_ciphertext bytea,
  encryption_key_version text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, student_id),
  FOREIGN KEY (organization_id, student_id)
    REFERENCES academic.student_profiles (organization_id, id),
  CHECK (
    (blood_group_ciphertext IS NULL AND allergy_data_ciphertext IS NULL AND medical_history_ciphertext IS NULL
      AND medication_data_ciphertext IS NULL AND emergency_instructions_ciphertext IS NULL)
    OR encryption_key_version IS NOT NULL
  )
);

-- NIK/KK/passport and other identity numbers are ciphertext only.
CREATE TABLE IF NOT EXISTS academic.student_identity_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  student_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('nik','kk','nisn','passport','birth_certificate','other')),
  document_number_ciphertext bytea NOT NULL,
  encryption_key_version text NOT NULL,
  issuer text,
  issued_on date,
  expires_on date,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, student_id)
    REFERENCES academic.student_profiles (organization_id, id)
);

CREATE INDEX IF NOT EXISTS student_health_profiles_student
  ON academic.student_health_profiles (organization_id, student_id);
CREATE INDEX IF NOT EXISTS student_identity_documents_student
  ON academic.student_identity_documents (organization_id, student_id, document_type);

-- An educator is an employee with a richer teaching/professional profile.
CREATE TABLE IF NOT EXISTS academic.instructors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  educator_number text,
  educator_type text NOT NULL DEFAULT 'teacher'
    CHECK (educator_type IN ('teacher','ustadz','musyrif','lecturer','trainer','counselor','other')),
  highest_qualification text,
  specialization text,
  certification_summary text,
  teaching_experience_years numeric(5,2) CHECK (teaching_experience_years IS NULL OR teaching_experience_years >= 0),
  employment_category text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, employee_id),
  UNIQUE (organization_id, educator_number),
  FOREIGN KEY (organization_id, employee_id)
    REFERENCES hr.employees (organization_id, id)
);

-- Departments form the institution's organizational tree. Employee assignments are temporal,
-- preserving who held which office and reporting line at any point in time.
ALTER TABLE hr.departments
  ADD COLUMN IF NOT EXISTS parent_department_id uuid,
  ADD COLUMN IF NOT EXISTS head_employee_id uuid,
  ADD COLUMN IF NOT EXISTS campus_id uuid,
  ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS effective_until date,
  ADD CONSTRAINT hr_departments_parent_fk
    FOREIGN KEY (organization_id, parent_department_id)
    REFERENCES hr.departments (organization_id, id),
  ADD CONSTRAINT hr_departments_head_fk
    FOREIGN KEY (organization_id, head_employee_id)
    REFERENCES hr.employees (organization_id, id),
  ADD CONSTRAINT hr_departments_campus_fk
    FOREIGN KEY (organization_id, campus_id)
    REFERENCES core.campuses (organization_id, id),
  ADD CONSTRAINT hr_departments_dates_check
    CHECK (effective_until IS NULL OR effective_until >= effective_from);

ALTER TABLE hr.positions
  ADD COLUMN IF NOT EXISTS parent_position_id uuid,
  ADD COLUMN IF NOT EXISTS job_family text,
  ADD COLUMN IF NOT EXISTS position_level smallint,
  ADD COLUMN IF NOT EXISTS job_description text,
  ADD COLUMN IF NOT EXISTS approval_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT hr_positions_parent_fk
    FOREIGN KEY (organization_id, parent_position_id)
    REFERENCES hr.positions (organization_id, id),
  ADD CONSTRAINT hr_positions_approval_scope_object
    CHECK (jsonb_typeof(approval_scope) = 'object'),
  ADD CONSTRAINT hr_positions_level_check
    CHECK (position_level IS NULL OR position_level BETWEEN 1 AND 20);

CREATE TABLE IF NOT EXISTS hr.employee_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  department_id uuid,
  position_id uuid,
  manager_employee_id uuid,
  assignment_type text NOT NULL DEFAULT 'primary'
    CHECK (assignment_type IN ('primary','secondary','acting','project','temporary')),
  starts_on date NOT NULL,
  ends_on date,
  is_primary boolean NOT NULL DEFAULT false,
  decision_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, employee_id) REFERENCES hr.employees (organization_id, id),
  FOREIGN KEY (organization_id, department_id) REFERENCES hr.departments (organization_id, id),
  FOREIGN KEY (organization_id, position_id) REFERENCES hr.positions (organization_id, id),
  FOREIGN KEY (organization_id, manager_employee_id) REFERENCES hr.employees (organization_id, id),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX IF NOT EXISTS hr_employee_one_active_primary_assignment
  ON hr.employee_assignments (organization_id, employee_id)
  WHERE is_primary = true AND ends_on IS NULL;
CREATE INDEX IF NOT EXISTS hr_employee_assignments_department
  ON hr.employee_assignments (organization_id, department_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS hr_departments_parent
  ON hr.departments (organization_id, parent_department_id);

-- Dedicated permissions for health and identity data. They are not included in broad student read.
INSERT INTO core.permissions (permission_key, description) VALUES
 ('academic.students.health.read','View restricted student health profile'),
 ('academic.students.health.write','Manage restricted student health profile'),
 ('academic.students.identity.read','View restricted student identity documents'),
 ('academic.students.identity.write','Manage restricted student identity documents'),
 ('hr.educators.read','View educator and teaching qualification profiles'),
 ('hr.educators.write','Manage educator and teaching qualification profiles'),
 ('hr.organization.read','View organizational structure and assignments'),
 ('hr.organization.write','Manage organizational structure and assignments')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO core.roles (organization_id, role_key, role_name, is_system) VALUES
 (NULL,'health_officer','Petugas Kesehatan Santri',true)
ON CONFLICT (organization_id, role_key) DO UPDATE SET role_name=EXCLUDED.role_name, is_system=true;

INSERT INTO core.role_permissions (role_id, permission_key)
SELECT r.id, p.permission_key
FROM core.roles r
JOIN core.permissions p ON (
  (r.role_key IN ('institution_owner','institution_admin') AND p.permission_key IN (
    'academic.students.health.read','academic.students.health.write',
    'academic.students.identity.read','academic.students.identity.write',
    'hr.educators.read','hr.educators.write','hr.organization.read','hr.organization.write'
  ))
  OR (r.role_key = 'academic_admin' AND p.permission_key IN (
    'hr.employees.read','hr.educators.read','hr.educators.write','hr.organization.read'
  ))
  OR (r.role_key = 'health_officer' AND p.permission_key IN (
    'academic.students.read','academic.students.health.read','academic.students.health.write'
  ))
  OR (r.role_key = 'hr_admin' AND p.permission_key IN (
    'hr.educators.read','hr.educators.write','hr.organization.read','hr.organization.write'
  ))
)
WHERE r.organization_id IS NULL
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- Enforce tenant isolation and restricted-runtime access for every newly created relation.
DO $security$
DECLARE target record;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('academic','student_health_profiles'),
    ('academic','student_identity_documents'),
    ('academic','instructors'),
    ('hr','employee_assignments')
  ) AS t(schema_name, table_name)
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target.schema_name, target.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', target.schema_name, target.table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I.%I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND core.has_active_tenant_membership(organization_id)) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), '''')::uuid AND core.has_active_tenant_membership(organization_id))', target.schema_name, target.table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I.%I TO pondok_runtime', target.schema_name, target.table_name);
  END LOOP;
END
$security$;

-- Sensitive health and identity tables are deliberately not available to the generic runtime role.
-- A dedicated envelope-encryption service must be implemented before granting access.
REVOKE ALL ON academic.student_identity_documents FROM pondok_runtime;

DO $validation$
BEGIN
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='academic.student_health_profiles'::regclass) THEN
    RAISE EXCEPTION 'student health profile must enforce tenant RLS';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='academic.student_identity_documents'::regclass) THEN
    RAISE EXCEPTION 'student identity documents must enforce tenant RLS';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='academic.instructors'::regclass) THEN
    RAISE EXCEPTION 'instructor profiles must enforce tenant RLS';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='hr.employee_assignments'::regclass) THEN
    RAISE EXCEPTION 'employee assignments must enforce tenant RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='pondok_runtime' AND (rolcanlogin OR rolbypassrls)) THEN
    RAISE EXCEPTION 'pondok_runtime must remain NOLOGIN and NOBYPASSRLS';
  END IF;
END
$validation$;

COMMIT;
