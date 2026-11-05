-- Central Command double-entry ledger for module sales, maintenance and service billing.
-- Journal postings are immutable; corrections are recorded as reversals, never edits.
BEGIN;

CREATE TABLE IF NOT EXISTS platform.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code text NOT NULL UNIQUE,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  parent_account_id uuid REFERENCES platform.chart_of_accounts(id),
  is_control_account boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_account_id IS NULL OR parent_account_id <> id)
);

CREATE TABLE IF NOT EXISTS platform.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number text NOT NULL UNIQUE,
  entry_date date NOT NULL,
  description text NOT NULL,
  currency char(3) NOT NULL DEFAULT 'IDR',
  source_type text NOT NULL CHECK (source_type IN ('invoice','payment','module_order','maintenance_service','repair','credit_note','manual_adjustment','reversal')),
  source_id uuid,
  posting_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','reversed')),
  total_debit numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_debit >= 0),
  total_credit numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_credit >= 0),
  reverses_entry_id uuid REFERENCES platform.journal_entries(id),
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_debit = total_credit),
  CHECK (status <> 'posted' OR (posted_by IS NOT NULL AND posted_at IS NOT NULL)),
  CHECK (status <> 'reversed' OR reverses_entry_id IS NOT NULL),
  CHECK (reverses_entry_id IS NULL OR reverses_entry_id <> id)
);
CREATE INDEX IF NOT EXISTS platform_journal_entries_date ON platform.journal_entries(entry_date DESC,status);
CREATE INDEX IF NOT EXISTS platform_journal_entries_source ON platform.journal_entries(source_type,source_id);

CREATE TABLE IF NOT EXISTS platform.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES platform.journal_entries(id),
  line_number integer NOT NULL CHECK (line_number > 0),
  account_id uuid NOT NULL REFERENCES platform.chart_of_accounts(id),
  description text,
  debit numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  customer_id uuid REFERENCES platform.customers(id),
  installation_id uuid REFERENCES platform.installations(id),
  invoice_id uuid REFERENCES platform.invoices(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (journal_entry_id,line_number),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE INDEX IF NOT EXISTS platform_journal_lines_account ON platform.journal_lines(account_id,journal_entry_id);
CREATE INDEX IF NOT EXISTS platform_journal_lines_customer ON platform.journal_lines(customer_id,journal_entry_id);

CREATE OR REPLACE FUNCTION platform.assert_journal_entry_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE target_id uuid; expected_debit numeric(18,2); expected_credit numeric(18,2);
        actual_debit numeric(18,2); actual_credit numeric(18,2); line_count integer;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    target_id := COALESCE(NEW.id, OLD.id);
  ELSE
    target_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
  END IF;
  SELECT total_debit,total_credit INTO expected_debit,expected_credit
  FROM platform.journal_entries WHERE id=target_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(sum(debit),0),COALESCE(sum(credit),0),count(*)
    INTO actual_debit,actual_credit,line_count
  FROM platform.journal_lines WHERE journal_entry_id=target_id;
  IF actual_debit <> expected_debit OR actual_credit <> expected_credit OR actual_debit <> actual_credit THEN
    RAISE EXCEPTION 'Journal entry % is not balanced: lines debit %, credit %, header debit %, credit %',
      target_id,actual_debit,actual_credit,expected_debit,expected_credit;
  END IF;
  IF (SELECT status='posted' FROM platform.journal_entries WHERE id=target_id) AND line_count < 2 THEN
    RAISE EXCEPTION 'Posted journal entry % must contain at least two lines',target_id;
  END IF;
  RETURN NULL;
END
$function$;

CREATE CONSTRAINT TRIGGER platform_journal_lines_balanced
AFTER INSERT OR UPDATE OR DELETE ON platform.journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION platform.assert_journal_entry_balanced();

CREATE CONSTRAINT TRIGGER platform_journal_header_balanced
AFTER INSERT OR UPDATE ON platform.journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION platform.assert_journal_entry_balanced();

ALTER TABLE platform.invoices
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES platform.journal_entries(id);
ALTER TABLE platform.payments
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES platform.journal_entries(id);

DO $security$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chart_of_accounts','journal_entries','journal_lines'] LOOP
    EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE platform.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY platform_admin_access ON platform.%I USING (platform.is_active_super_admin()) WITH CHECK (platform.is_active_super_admin())',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON platform.%I TO pondok_platform_runtime',t);
  END LOOP;
END
$security$;

REVOKE DELETE ON ALL TABLES IN SCHEMA platform FROM pondok_platform_runtime;
REVOKE UPDATE,DELETE ON platform.journal_entries,platform.journal_lines FROM pondok_platform_runtime;
GRANT SELECT,INSERT ON platform.journal_entries,platform.journal_lines TO pondok_platform_runtime;
REVOKE UPDATE,DELETE ON platform.audit_events FROM pondok_platform_runtime;

DO $validation$
DECLARE protected_count integer;
BEGIN
  SELECT count(*) INTO protected_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='platform' AND c.relname=ANY(ARRAY['chart_of_accounts','journal_entries','journal_lines'])
    AND c.relrowsecurity AND c.relforcerowsecurity;
  IF protected_count <> 3 THEN
    RAISE EXCEPTION 'Central Command accounting ledger RLS validation failed: % of 3 tables protected',protected_count;
  END IF;
END
$validation$;

COMMIT;
