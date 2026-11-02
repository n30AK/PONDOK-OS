-- PONDOK OS finance, accounting and inventory ledger foundation.
-- Additive, tenant-scoped, repeatable DDL. Never update posted accounting or stock ledgers in place.
BEGIN;

CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS inventory;

CREATE TABLE IF NOT EXISTS finance.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  account_code text NOT NULL,
  account_name text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
  parent_account_id uuid,
  is_control_account boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, account_code),
  FOREIGN KEY (organization_id, parent_account_id)
    REFERENCES finance.accounts (organization_id, id)
);

CREATE TABLE IF NOT EXISTS finance.fiscal_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code),
  CHECK (ends_on >= starts_on),
  CHECK ((status = 'open' AND closed_at IS NULL) OR (status = 'closed' AND closed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS finance.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  fiscal_period_id uuid NOT NULL,
  entry_number text NOT NULL,
  entry_date date NOT NULL,
  description text NOT NULL,
  source_module text,
  source_reference text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','reversed')),
  created_by uuid,
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, entry_number),
  FOREIGN KEY (organization_id, fiscal_period_id)
    REFERENCES finance.fiscal_periods (organization_id, id),
  CHECK ((status = 'posted' AND posted_at IS NOT NULL) OR status <> 'posted')
);

CREATE TABLE IF NOT EXISTS finance.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  account_id uuid NOT NULL,
  description text,
  debit numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, journal_entry_id, line_number),
  FOREIGN KEY (organization_id, journal_entry_id)
    REFERENCES finance.journal_entries (organization_id, id),
  FOREIGN KEY (organization_id, account_id)
    REFERENCES finance.accounts (organization_id, id),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE TABLE IF NOT EXISTS inventory.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_code text NOT NULL,
  item_name text NOT NULL,
  unit_code text NOT NULL,
  reorder_level numeric(18,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, item_code)
);

CREATE TABLE IF NOT EXISTS inventory.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  campus_id uuid,
  warehouse_code text NOT NULL,
  warehouse_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, warehouse_code),
  FOREIGN KEY (organization_id, campus_id)
    REFERENCES core.campuses (organization_id, id)
);

CREATE TABLE IF NOT EXISTS inventory.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  item_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  movement_group_id uuid,
  movement_type text NOT NULL CHECK (movement_type IN ('receipt','issue','transfer_in','transfer_out','adjustment')),
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  reference_type text,
  reference_id text,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, item_id)
    REFERENCES inventory.items (organization_id, id),
  FOREIGN KEY (organization_id, warehouse_id)
    REFERENCES inventory.warehouses (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_finance_journals_org_date
  ON finance.journal_entries (organization_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_journal_lines_entry
  ON finance.journal_lines (organization_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_time
  ON inventory.stock_movements (organization_id, item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_warehouse_time
  ON inventory.stock_movements (organization_id, warehouse_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION finance.assert_balanced_journal()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE debit_total numeric(18,2); credit_total numeric(18,2); line_count integer;
BEGIN
  IF NEW.status = 'posted' AND OLD.status IS DISTINCT FROM 'posted' THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*)
      INTO debit_total, credit_total, line_count
      FROM finance.journal_lines
     WHERE organization_id = NEW.organization_id AND journal_entry_id = NEW.id;
    IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
      RAISE EXCEPTION 'journal entry must contain at least two balanced lines before posting'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM finance.fiscal_periods fp
       WHERE fp.organization_id = NEW.organization_id
         AND fp.id = NEW.fiscal_period_id AND fp.status = 'open'
         AND NEW.entry_date BETWEEN fp.starts_on AND fp.ends_on
    ) THEN
      RAISE EXCEPTION 'journal entry date must fall within an open fiscal period'
        USING ERRCODE = '23514';
    END IF;
    NEW.posted_at := COALESCE(NEW.posted_at, now());
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION finance.prevent_posted_journal_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
  IF TG_TABLE_SCHEMA = 'finance' AND TG_TABLE_NAME = 'journal_entries' THEN
    IF OLD.status IN ('posted','reversed') THEN
      RAISE EXCEPTION 'posted journal entries are immutable; create a reversal or adjustment'
        USING ERRCODE = '55000';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT status INTO current_status FROM finance.journal_entries
   WHERE organization_id = OLD.organization_id AND id = OLD.journal_entry_id;
  IF current_status IN ('posted','reversed') THEN
    RAISE EXCEPTION 'lines of posted journal entries are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE OR REPLACE FUNCTION inventory.prevent_stock_movement_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock movements are append-only; record a compensating movement'
    USING ERRCODE = '55000';
END $$;

DROP TRIGGER IF EXISTS trg_finance_balance_before_post ON finance.journal_entries;
CREATE TRIGGER trg_finance_balance_before_post
BEFORE UPDATE OF status ON finance.journal_entries
FOR EACH ROW EXECUTE FUNCTION finance.assert_balanced_journal();

DROP TRIGGER IF EXISTS trg_finance_entry_immutable ON finance.journal_entries;
CREATE TRIGGER trg_finance_entry_immutable
BEFORE UPDATE OR DELETE ON finance.journal_entries
FOR EACH ROW EXECUTE FUNCTION finance.prevent_posted_journal_mutation();

DROP TRIGGER IF EXISTS trg_finance_line_immutable ON finance.journal_lines;
CREATE TRIGGER trg_finance_line_immutable
BEFORE UPDATE OR DELETE ON finance.journal_lines
FOR EACH ROW EXECUTE FUNCTION finance.prevent_posted_journal_mutation();

DROP TRIGGER IF EXISTS trg_inventory_movement_immutable ON inventory.stock_movements;
CREATE TRIGGER trg_inventory_movement_immutable
BEFORE UPDATE OR DELETE ON inventory.stock_movements
FOR EACH ROW EXECUTE FUNCTION inventory.prevent_stock_movement_mutation();

INSERT INTO core.permissions (permission_key, description) VALUES
 ('finance.accounts.read','View chart of accounts'),
 ('finance.accounts.write','Manage chart of accounts'),
 ('finance.journals.read','View journal entries'),
 ('finance.journals.write','Create draft journal entries'),
 ('finance.journals.post','Post balanced journal entries'),
 ('finance.periods.close','Close an open fiscal period'),
 ('inventory.items.read','View inventory items'),
 ('inventory.items.write','Manage inventory items'),
 ('inventory.movements.read','View stock movement ledger'),
 ('inventory.movements.write','Record stock movements')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;

COMMIT;
