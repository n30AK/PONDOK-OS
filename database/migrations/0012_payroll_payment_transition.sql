-- Permit the single approved -> paid transition while preserving payroll immutability.
BEGIN;
CREATE OR REPLACE FUNCTION hr.prevent_approved_payroll_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
  IF TG_TABLE_NAME = 'payroll_runs' THEN
    IF OLD.status = 'paid' THEN
      RAISE EXCEPTION 'paid payroll runs are immutable; create an adjustment run'
        USING ERRCODE = '55000';
    END IF;
    IF OLD.status = 'approved' THEN
      IF TG_OP = 'DELETE' OR NEW.status <> 'paid'
        OR (NEW.id, NEW.organization_id, NEW.payroll_period_id, NEW.run_number,
            NEW.run_type, NEW.approved_by, NEW.approved_at, NEW.created_at)
           IS DISTINCT FROM
           (OLD.id, OLD.organization_id, OLD.payroll_period_id, OLD.run_number,
            OLD.run_type, OLD.approved_by, OLD.approved_at, OLD.created_at) THEN
        RAISE EXCEPTION 'approved payroll runs only allow the paid status transition'
          USING ERRCODE = '55000';
      END IF;
      RETURN NEW;
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
COMMIT;
