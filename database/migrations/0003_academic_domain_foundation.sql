BEGIN;

CREATE SCHEMA IF NOT EXISTS academic;

CREATE TABLE IF NOT EXISTS academic.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS academic.academic_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, academic_year_id, code),
  FOREIGN KEY (organization_id, academic_year_id)
    REFERENCES academic.academic_years (organization_id, id),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS academic.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS academic.student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  campus_id uuid NOT NULL,
  student_number text NOT NULL,
  legal_name text NOT NULL,
  preferred_name text,
  birth_date date,
  gender_code text,
  status text NOT NULL DEFAULT 'applicant'
    CHECK (status IN ('applicant', 'active', 'graduated', 'withdrawn', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, campus_id, student_number),
  FOREIGN KEY (organization_id, campus_id)
    REFERENCES core.campuses (organization_id, id)
);

CREATE TABLE IF NOT EXISTS academic.guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS academic.student_guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  student_id uuid NOT NULL,
  guardian_id uuid NOT NULL,
  relationship_code text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, student_id, guardian_id),
  FOREIGN KEY (organization_id, student_id)
    REFERENCES academic.student_profiles (organization_id, id),
  FOREIGN KEY (organization_id, guardian_id)
    REFERENCES academic.guardians (organization_id, id)
);

CREATE TABLE IF NOT EXISTS academic.class_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  campus_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  program_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, campus_id, academic_year_id, code),
  FOREIGN KEY (organization_id, campus_id)
    REFERENCES core.campuses (organization_id, id),
  FOREIGN KEY (organization_id, academic_year_id)
    REFERENCES academic.academic_years (organization_id, id),
  FOREIGN KEY (organization_id, program_id)
    REFERENCES academic.programs (organization_id, id)
);

CREATE TABLE IF NOT EXISTS academic.enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  student_id uuid NOT NULL,
  academic_year_id uuid NOT NULL,
  class_group_id uuid,
  enrolled_on date NOT NULL DEFAULT CURRENT_DATE,
  ended_on date,
  status text NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled', 'completed', 'transferred', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, student_id, academic_year_id),
  FOREIGN KEY (organization_id, student_id)
    REFERENCES academic.student_profiles (organization_id, id),
  FOREIGN KEY (organization_id, academic_year_id)
    REFERENCES academic.academic_years (organization_id, id),
  FOREIGN KEY (organization_id, class_group_id)
    REFERENCES academic.class_groups (organization_id, id),
  CHECK (ended_on IS NULL OR ended_on >= enrolled_on)
);

CREATE TABLE IF NOT EXISTS academic.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  subject_type text NOT NULL DEFAULT 'general'
    CHECK (subject_type IN ('general', 'religious', 'language', 'vocational', 'other')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS academic.class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  weekly_periods smallint NOT NULL DEFAULT 1 CHECK (weekly_periods > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, class_group_id, subject_id),
  FOREIGN KEY (organization_id, class_group_id)
    REFERENCES academic.class_groups (organization_id, id),
  FOREIGN KEY (organization_id, subject_id)
    REFERENCES academic.subjects (organization_id, id)
);

CREATE TABLE IF NOT EXISTS academic.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  class_group_id uuid NOT NULL,
  session_date date NOT NULL,
  session_label text NOT NULL DEFAULT 'regular',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted', 'locked')),
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, class_group_id, session_date, session_label),
  FOREIGN KEY (organization_id, class_group_id)
    REFERENCES academic.class_groups (organization_id, id)
);

CREATE TABLE IF NOT EXISTS academic.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  attendance_session_id uuid NOT NULL,
  student_id uuid NOT NULL,
  attendance_status text NOT NULL
    CHECK (attendance_status IN ('present', 'excused', 'sick', 'absent', 'late')),
  note text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, attendance_session_id, student_id),
  FOREIGN KEY (organization_id, attendance_session_id)
    REFERENCES academic.attendance_sessions (organization_id, id),
  FOREIGN KEY (organization_id, student_id)
    REFERENCES academic.student_profiles (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_academic_years_org_status
  ON academic.academic_years (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_academic_students_campus_status
  ON academic.student_profiles (organization_id, campus_id, status);
CREATE INDEX IF NOT EXISTS idx_academic_enrollments_year_status
  ON academic.enrollments (organization_id, academic_year_id, status);
CREATE INDEX IF NOT EXISTS idx_academic_attendance_session_date
  ON academic.attendance_sessions (organization_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_academic_attendance_records_student
  ON academic.attendance_records (organization_id, student_id);

COMMIT;
