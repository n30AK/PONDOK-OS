-- Prevent duplicate CRM customer records for a single converted lead.
-- A lead can produce at most one commercial customer; manual customers remain unrestricted.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS platform_customers_one_per_source_lead
  ON platform.customers(source_lead_id)
  WHERE source_lead_id IS NOT NULL;

COMMENT ON INDEX platform.platform_customers_one_per_source_lead IS
  'Ensures a CRM lead is converted to no more than one commercial customer record.';

COMMIT;
