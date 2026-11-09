-- Bind each recurring subscription to one approved contract quote line.
-- Snapshot the recurring billing interval and all quoted line amounts to prevent price drift.
BEGIN;

ALTER TABLE platform.subscriptions
  ADD COLUMN IF NOT EXISTS quote_line_id uuid
    REFERENCES platform.quote_lines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS billing_interval text
    CHECK (billing_interval IS NULL OR billing_interval IN ('monthly','quarterly','yearly')),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(18,2) NOT NULL DEFAULT 0
    CHECK (discount_amount >= 0),
  ADD COLUMN IF NOT EXISTS tax_amount numeric(18,2) NOT NULL DEFAULT 0
    CHECK (tax_amount >= 0),
  ADD COLUMN IF NOT EXISTS line_total numeric(18,2) NOT NULL DEFAULT 0
    CHECK (line_total >= 0);

ALTER TABLE platform.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE platform.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trial','scheduled','active','grace','suspended','expired','cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS platform_subscriptions_one_per_quote_line
  ON platform.subscriptions(quote_line_id)
  WHERE quote_line_id IS NOT NULL;

COMMENT ON COLUMN platform.subscriptions.quote_line_id IS
  'Approved quote line that originated this recurring subscription; unique to make contract conversion idempotent.';
COMMENT ON COLUMN platform.subscriptions.billing_interval IS
  'Immutable billing interval snapshot from the product catalog at contract conversion.';
COMMENT ON COLUMN platform.subscriptions.line_total IS
  'Quoted recurring line total snapshot, including the quoted discount and tax amounts.';

COMMIT;
