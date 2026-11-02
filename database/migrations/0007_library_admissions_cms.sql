-- Library, admissions/PPDB and institutional CMS domain foundation.
BEGIN;
CREATE SCHEMA IF NOT EXISTS library;
CREATE SCHEMA IF NOT EXISTS admissions;
CREATE SCHEMA IF NOT EXISTS cms;

CREATE TABLE IF NOT EXISTS library.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  isbn text,
  item_code text NOT NULL,
  title text NOT NULL,
  subtitle text,
  authors text[] NOT NULL DEFAULT ARRAY[]::text[],
  publisher text,
  publication_year integer CHECK (publication_year IS NULL OR publication_year BETWEEN 1400 AND 2200),
  category text,
  language_code char(2),
  is_reference_only boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, item_code)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_isbn_unique
  ON library.catalog_items (organization_id, isbn) WHERE isbn IS NOT NULL;

CREATE TABLE IF NOT EXISTS library.copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  catalog_item_id uuid NOT NULL,
  campus_id uuid,
  barcode text NOT NULL,
  shelf_location text,
  copy_status text NOT NULL DEFAULT 'available'
    CHECK (copy_status IN ('available','on_loan','reserved','lost','damaged','withdrawn')),
  acquired_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, barcode),
  FOREIGN KEY (organization_id, catalog_item_id)
    REFERENCES library.catalog_items (organization_id, id),
  FOREIGN KEY (organization_id, campus_id)
    REFERENCES core.campuses (organization_id, id)
);
CREATE TABLE IF NOT EXISTS library.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  copy_id uuid NOT NULL,
  borrower_type text NOT NULL CHECK (borrower_type IN ('student','employee','guardian')),
  borrower_id uuid NOT NULL,
  checked_out_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  returned_at timestamptz,
  loan_status text NOT NULL DEFAULT 'open' CHECK (loan_status IN ('open','returned','lost','cancelled')),
  issued_by uuid,
  received_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, copy_id) REFERENCES library.copies (organization_id, id),
  CHECK (due_at > checked_out_at),
  CHECK ((loan_status = 'returned' AND returned_at IS NOT NULL) OR loan_status <> 'returned')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_one_open_loan_per_copy
  ON library.loans (organization_id, copy_id) WHERE loan_status = 'open';
CREATE INDEX IF NOT EXISTS idx_library_loans_borrower
  ON library.loans (organization_id, borrower_type, borrower_id, loan_status);

CREATE TABLE IF NOT EXISTS admissions.admission_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  campus_id uuid,
  academic_year_id uuid,
  period_code text NOT NULL,
  name text NOT NULL,
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  period_status text NOT NULL DEFAULT 'draft' CHECK (period_status IN ('draft','open','closed','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, period_code),
  FOREIGN KEY (organization_id, campus_id) REFERENCES core.campuses (organization_id, id),
  FOREIGN KEY (organization_id, academic_year_id) REFERENCES academic.academic_years (organization_id, id),
  CHECK (closes_at > opens_at)
);
CREATE TABLE IF NOT EXISTS admissions.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  admission_period_id uuid NOT NULL,
  application_number text NOT NULL,
  applicant_name text NOT NULL,
  applicant_birth_date date,
  applicant_gender_code text CHECK (applicant_gender_code IS NULL OR applicant_gender_code IN ('male','female','unspecified')),
  previous_school text,
  desired_program_id uuid,
  guardian_name text NOT NULL,
  guardian_email text,
  guardian_phone text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  application_status text NOT NULL DEFAULT 'draft'
    CHECK (application_status IN ('draft','submitted','under_review','accepted','waitlisted','rejected','withdrawn','enrolled')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  linked_student_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, application_number),
  FOREIGN KEY (organization_id, admission_period_id)
    REFERENCES admissions.admission_periods (organization_id, id),
  FOREIGN KEY (organization_id, desired_program_id)
    REFERENCES academic.programs (organization_id, id),
  FOREIGN KEY (organization_id, linked_student_id)
    REFERENCES academic.student_profiles (organization_id, id),
  CHECK ((application_status = 'draft' AND submitted_at IS NULL) OR application_status <> 'draft')
);
CREATE TABLE IF NOT EXISTS admissions.application_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  application_id uuid NOT NULL,
  document_type text NOT NULL,
  storage_key text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 20971520),
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, application_id)
    REFERENCES admissions.applications (organization_id, id)
);
CREATE TABLE IF NOT EXISTS admissions.application_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  application_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted','waitlisted','rejected','needs_information')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, application_id)
    REFERENCES admissions.applications (organization_id, id)
);

CREATE TABLE IF NOT EXISTS cms.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  campus_id uuid,
  slug text NOT NULL,
  title text NOT NULL,
  excerpt text,
  body_markdown text NOT NULL DEFAULT '',
  page_status text NOT NULL DEFAULT 'draft' CHECK (page_status IN ('draft','published','archived')),
  seo_title text,
  seo_description text,
  published_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, slug),
  FOREIGN KEY (organization_id, campus_id)
    REFERENCES core.campuses (organization_id, id),
  CHECK ((page_status = 'published' AND published_at IS NOT NULL) OR page_status <> 'published')
);
CREATE TABLE IF NOT EXISTS cms.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  campus_id uuid,
  title text NOT NULL,
  summary text,
  body_markdown text NOT NULL,
  audience text NOT NULL DEFAULT 'public' CHECK (audience IN ('public','parents','students','staff','internal')),
  announcement_status text NOT NULL DEFAULT 'draft' CHECK (announcement_status IN ('draft','scheduled','published','archived')),
  publish_at timestamptz,
  expire_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, campus_id)
    REFERENCES core.campuses (organization_id, id),
  CHECK (expire_at IS NULL OR publish_at IS NULL OR expire_at > publish_at)
);

CREATE INDEX IF NOT EXISTS idx_admissions_applications_period_status
  ON admissions.applications (organization_id, admission_period_id, application_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cms_pages_published
  ON cms.pages (organization_id, published_at DESC) WHERE page_status = 'published';
CREATE INDEX IF NOT EXISTS idx_cms_announcements_audience
  ON cms.announcements (organization_id, audience, publish_at DESC)
  WHERE announcement_status IN ('scheduled','published');

INSERT INTO core.permissions (permission_key, description) VALUES
 ('library.catalog.read','View library catalog'),
 ('library.catalog.write','Manage library catalog and copies'),
 ('library.loans.read','View library circulation'),
 ('library.loans.write','Issue and receive library loans'),
 ('admissions.periods.manage','Manage admissions periods'),
 ('admissions.applications.read','View PPDB applications'),
 ('admissions.applications.review','Review and decide PPDB applications'),
 ('admissions.applications.documents','Verify PPDB supporting documents'),
 ('cms.pages.manage','Create and publish institutional pages'),
 ('cms.announcements.manage','Create and publish institutional announcements')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;
COMMIT;
