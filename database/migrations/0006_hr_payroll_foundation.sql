-- PONDOK OS HR, employment and payroll foundation.
-- Payroll approvals are immutable snapshots; corrections use a new adjustment run.
BEGIN;

CREATE SCHEMA IF NOT EXISTS hr;

CREATE TABLE IF NOT EXISTS hr.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  department_code text NOT NULL,
  department_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, department_code)
);

CREATE TABLE IF NOT EXISTS hr.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  position_code text NOT NULL,
  position_name text NOT NULL,
  department_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, position_code),
  FOREIGN KEY (organization_id, department_id)
    REFERENCES hr.departments (organization_id, id)
);

CREATE TABLE IF NOT EXISTS hr.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  campus_id uuid,
  employee_number text NOT NULL,
  legal_name text NOT NULL,
  preferred_name text,
  email text,
  phone text,
  date_of_birth date,
  joined_on date NOT NULL,
  employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active','on_leave','resigned','terminated','retired')),
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, employee_number),
  FOREIGN KEY (organization_id, campus_id)
    REFERENCES core.campuses (organization_id, id)
);

CREATE TABLE IF NOT EXISTS hr.employment_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  position_id uuid,
  contract_type text NOT NULL CHECK (contract_type IN ('permanent','fixed_term','part_time','honorary','volunteer')),
  starts_on date NOT NULL,
  ends_on date,
  base_salary numeric(18,2) NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
  currency_code char(3) NOT NULL DEFAULT 'IDR',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','ended','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, employee_id) REFERENCES hr.employees (organization_id, id),
  FOREIGN KEY (organization_id, position_id) REFERENCES hr.positions (organization_id, id),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS hr.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  period_code text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  pay_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, period_code),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS hr.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  payroll_period_id uuid NOT NULL,
  run_number text NOT NULL,
  run_type text NOT NULL DEFAULT 'regular' CHECK (run_type IN ('regular','bonus','adjustment')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  paid_by uuid,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, run_number),
  FOREIGN KEY (organization_id, payroll_period_id)
    REFERENCES hr.payroll_periods (organization_id, id),
  CHECK ((status IN ('approved','paid') AND approved_at IS NOT NULL) OR status NOT IN ('approved','paid')),
  CHECK ((status = 'paid' AND paid_at IS NOT NULL) OR status <> 'paid')
);

CREATE TABLE IF NOT EXISTS hr.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  payroll_run_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  component_code text NOT NULL,
  component_name text NOT NULL,
  component_type text NOT NULL CHECK (component_type IN ('earning','deduction')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, payroll_run_id)
    REFERENCES hr.payroll_runs (organization_id, id),
  FOREIGN KEY (organization_id, employee_id)
    REFERENCES hr.employees (organization_id, id),
  UNIQUE (organization_id, payroll_run_id, employee_id, component_code)
);

CREATE INDEX IF NOT EXISTS idx_hr_employees_org_status
  ON hr.employees (organization_id, employment_status);
CREATE INDEX IF NOT EXISTS idx_hr_contracts_employee_dates
  ON hr.employment_contracts (organization_id, employee_id, starts_on DESC);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_runs_period
  ON hr.payroll_runs (organization_id, payroll_period_id, status);
CREATE INDEX IF NOT EXISTS idx_hr_payroll_lines_employee
  ON hr.payroll_lines (organization_id, employee_id, payroll_run_id);

CREATE OR REPLACE FUNCTION hr.validate_payroll_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE employee_count integer; net_total numeric(18,2);
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    SELECT COUNT(DISTINCT employee_id),
           COALESCE(SUM(CASE WHEN component_type = 'earning' THEN amount ELSE -amount END),0)
      INTO employee_count, net_total
      FROM hr.payroll_lines
     WHERE organization_id = NEW.organization_id AND payroll_run_id = NEW.id;
    IF employee_count < 1 OR net_total < 0 THEN
      RAISE EXCEPTION 'payroll run requires employee lines and non-negative net pay'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM hr.payroll_periods p
       WHERE p.organization_id = NEW.organization_id
         AND p.id = NEW.payroll_period_id AND p.status = 'open'
    ) THEN
      RAISE EXCEPTION 'payroll period must be open to approve a run'
        USING ERRCODE = '23514';
    END IF;
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    IF OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'only an approved payroll run can be marked paid'
        USING ERRCODE = '23514';
    END IF;
    NEW.paid_at := COALESCE(NEW.paid_at, now());
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION hr.prevent_approved_payroll_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
  IF TG_TABLE_NAME = 'payroll_runs' THEN
    IF OLD.status IN ('approved','paid') THEN
      RAISE EXCEPTION 'approved payroll runs are immutable; create an adjustment run'
        USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  SELECT status INTO current_status FROM hr.payroll_runs
   WHERE organization_id = OLD.organization_id AND id = OLD.payroll_run_id;
  IF current_status IN ('approved','paid') THEN
    RAISE EXCEPTION 'lines of approved payroll runs are immutable'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

DROP TRIGGER IF EXISTS trg_hr_payroll_validate_approval ON hr.payroll_runs;
CREATE TRIGGER trg_hr_payroll_validate_approval
BEFORE UPDATE OF status ON hr.payroll_runs
FOR EACH ROW EXECUTE FUNCTION hr.validate_payroll_approval();

DROP TRIGGER IF EXISTS trg_hr_payroll_run_immutable ON hr.payroll_runs;
CREATE TRIGGER trg_hr_payroll_run_immutable
BEFORE UPDATE OR DELETE ON hr.payroll_runs
FOR EACH ROW EXECUTE FUNCTION hr.prevent_approved_payroll_mutation();

DROP TRIGGER IF EXISTS trg_hr_payroll_line_immutable ON hr.payroll_lines;
CREATE TRIGGER trg_hr_payroll_line_immutable
BEFORE UPDATE OR DELETE ON hr.payroll_lines
FOR EACH ROW EXECUTE FUNCTION hr.prevent_approved_payroll_mutation();

INSERT INTO core.permissions (permission_key, description) VALUES
 ('hr.employees.read','View employee profiles'),
 ('hr.employees.write','Manage employee profiles'),
 ('hr.contracts.read','View employment contracts'),
 ('hr.contracts.write','Manage employment contracts'),
 ('hr.payroll.read','View payroll information'),
 ('hr.payroll.prepare','Prepare draft payroll runs'),
 ('hr.payroll.approve','Approve payroll runs'),
 ('hr.payroll.pay','Record payroll payment completion')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

COMMIT;
