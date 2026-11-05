-- Central Command company HR, internal operations and document metadata foundation.
BEGIN;

CREATE TABLE IF NOT EXISTS platform.company_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_code text NOT NULL UNIQUE,
  department_name text NOT NULL,
  parent_department_id uuid REFERENCES platform.company_departments(id),
  manager_employee_id uuid,
  cost_center text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_department_id IS NULL OR parent_department_id <> id)
);

CREATE TABLE IF NOT EXISTS platform.company_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_number text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  preferred_name text,
  work_email text,
  work_phone text,
  employment_type text NOT NULL CHECK (employment_type IN ('permanent','contract','probation','intern','part_time','consultant')),
  employment_status text NOT NULL DEFAULT 'active' CHECK (employment_status IN ('draft','active','on_leave','suspended','resigned','terminated')),
  hire_date date NOT NULL,
  termination_date date,
  tax_id_ciphertext text,
  bank_account_ciphertext text,
  emergency_contact_ciphertext text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (termination_date IS NULL OR termination_date >= hire_date)
);
CREATE INDEX IF NOT EXISTS platform_company_employees_status ON platform.company_employees(employment_status,legal_name);

CREATE TABLE IF NOT EXISTS platform.company_employee_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES platform.company_employees(id),
  department_id uuid NOT NULL REFERENCES platform.company_departments(id),
  position_title text NOT NULL,
  employment_grade text,
  starts_on date NOT NULL,
  ends_on date,
  is_primary boolean NOT NULL DEFAULT true,
  manager_employee_id uuid REFERENCES platform.company_employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_company_employee_active_primary
  ON platform.company_employee_assignments(employee_id) WHERE is_primary AND ends_on IS NULL;

CREATE TABLE IF NOT EXISTS platform.company_attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES platform.company_employees(id),
  work_date date NOT NULL,
  check_in_at timestamptz,
  check_out_at timestamptz,
  attendance_status text NOT NULL CHECK (attendance_status IN ('present','late','absent','leave','holiday','remote','field_work')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','device','approved_remote','import')),
  note text,
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id,work_date),
  CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at)
);

CREATE TABLE IF NOT EXISTS platform.company_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE,
  employee_id uuid NOT NULL REFERENCES platform.company_employees(id),
  leave_type text NOT NULL CHECK (leave_type IN ('annual','sick','maternity','paternity','marriage','bereavement','unpaid','other')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  requested_days numeric(6,2) NOT NULL CHECK (requested_days > 0),
  reason text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','approved','rejected','cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK ((decided_by IS NULL) = (decided_at IS NULL))
);

CREATE TABLE IF NOT EXISTS platform.company_payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_code text NOT NULL UNIQUE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  payment_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','calculating','review','approved','paid','closed')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);

CREATE TABLE IF NOT EXISTS platform.company_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_period_id uuid NOT NULL REFERENCES platform.company_payroll_periods(id),
  run_number integer NOT NULL CHECK (run_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','calculating','review','approved','paid','cancelled')),
  employee_count integer NOT NULL DEFAULT 0 CHECK (employee_count >= 0),
  gross_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (gross_total >= 0),
  deduction_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (deduction_total >= 0),
  net_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (net_total >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_period_id,run_number),
  CHECK (net_total <= gross_total),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);

CREATE TABLE IF NOT EXISTS platform.company_payroll_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL REFERENCES platform.company_payroll_runs(id),
  employee_id uuid NOT NULL REFERENCES platform.company_employees(id),
  basic_pay numeric(18,2) NOT NULL DEFAULT 0 CHECK (basic_pay >= 0),
  allowances numeric(18,2) NOT NULL DEFAULT 0 CHECK (allowances >= 0),
  overtime_pay numeric(18,2) NOT NULL DEFAULT 0 CHECK (overtime_pay >= 0),
  gross_pay numeric(18,2) NOT NULL CHECK (gross_pay >= 0),
  tax_withheld numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_withheld >= 0),
  bpjs_employee numeric(18,2) NOT NULL DEFAULT 0 CHECK (bpjs_employee >= 0),
  bpjs_employer numeric(18,2) NOT NULL DEFAULT 0 CHECK (bpjs_employer >= 0),
  other_deductions numeric(18,2) NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
  net_pay numeric(18,2) NOT NULL CHECK (net_pay >= 0),
  calculation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(calculation_snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id,employee_id),
  CHECK (net_pay <= gross_pay)
);

CREATE TABLE IF NOT EXISTS platform.internal_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_code text NOT NULL UNIQUE,
  department_id uuid REFERENCES platform.company_departments(id),
  fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
  fiscal_period text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'IDR',
  allocated_amount numeric(18,2) NOT NULL CHECK (allocated_amount >= 0),
  revised_amount numeric(18,2) NOT NULL CHECK (revised_amount >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','locked','closed')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);

CREATE TABLE IF NOT EXISTS platform.internal_expense_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number text NOT NULL UNIQUE,
  employee_id uuid NOT NULL REFERENCES platform.company_employees(id),
  department_id uuid REFERENCES platform.company_departments(id),
  expense_date date NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  document_id uuid,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','review','approved','rejected','paid','cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);

CREATE TABLE IF NOT EXISTS platform.company_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL UNIQUE,
  asset_name text NOT NULL,
  category text NOT NULL,
  serial_number text,
  acquisition_date date,
  acquisition_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK (acquisition_cost >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','assigned','maintenance','disposed','lost')),
  department_id uuid REFERENCES platform.company_departments(id),
  custodian_employee_id uuid REFERENCES platform.company_employees(id),
  document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_company_assets_serial_unique
  ON platform.company_assets(serial_number) WHERE serial_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform.company_asset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES platform.company_assets(id),
  event_type text NOT NULL CHECK (event_type IN ('registered','assigned','transferred','maintenance_started','maintenance_completed','disposed','lost','found')),
  event_summary text NOT NULL,
  from_employee_id uuid REFERENCES platform.company_employees(id),
  to_employee_id uuid REFERENCES platform.company_employees(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  evidence_reference text
);

CREATE TABLE IF NOT EXISTS platform.document_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text NOT NULL UNIQUE,
  document_type text NOT NULL,
  title text NOT NULL,
  description text,
  classification text NOT NULL DEFAULT 'internal' CHECK (classification IN ('public','internal','confidential','restricted')),
  related_entity_type text,
  related_entity_id uuid,
  storage_provider text,
  storage_reference text,
  checksum_sha256 text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  retention_until date,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('draft','registered','approved','archived','disposed')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_document_registry_type_status ON platform.document_registry(document_type,status,created_at DESC);

CREATE TABLE IF NOT EXISTS platform.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES platform.document_registry(id),
  version_number integer NOT NULL CHECK (version_number > 0),
  storage_reference text NOT NULL,
  checksum_sha256 text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id,version_number)
);

CREATE TABLE IF NOT EXISTS platform.document_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES platform.document_registry(id),
  actor_user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('view_metadata','download_requested','upload_version','approved','archived','exported')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id text
);

DO $security$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'company_departments','company_employees','company_employee_assignments','company_attendance_records',
    'company_leave_requests','company_payroll_periods','company_payroll_runs','company_payroll_items',
    'internal_budgets','internal_expense_claims','company_assets','company_asset_events',
    'document_registry','document_versions','document_access_events'
  ] LOOP
    EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE platform.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY platform_admin_access ON platform.%I USING (platform.is_active_super_admin()) WITH CHECK (platform.is_active_super_admin())',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON platform.%I TO pondok_platform_runtime',t);
  END LOOP;
END
$security$;

REVOKE DELETE ON ALL TABLES IN SCHEMA platform FROM pondok_platform_runtime;
REVOKE UPDATE,DELETE ON platform.company_asset_events,platform.document_access_events FROM pondok_platform_runtime;
GRANT SELECT,INSERT ON platform.company_asset_events,platform.document_access_events TO pondok_platform_runtime;

DO $validation$
DECLARE expected integer; protected integer;
BEGIN
  expected := 15;
  SELECT count(*) INTO protected FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='platform' AND c.relname=ANY(ARRAY[
    'company_departments','company_employees','company_employee_assignments','company_attendance_records',
    'company_leave_requests','company_payroll_periods','company_payroll_runs','company_payroll_items',
    'internal_budgets','internal_expense_claims','company_assets','company_asset_events',
    'document_registry','document_versions','document_access_events'
  ]) AND c.relrowsecurity AND c.relforcerowsecurity;
  IF protected <> expected THEN RAISE EXCEPTION 'Company HR/internal/documents RLS validation failed: % of %',protected,expected; END IF;
END
$validation$;

COMMIT;
