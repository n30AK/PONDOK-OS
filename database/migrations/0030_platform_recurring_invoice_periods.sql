-- Idempotent billing periods for recurring subscriptions.
-- Draft invoices remain unposted; issue/payment approval continues through the existing billing workflow.
BEGIN;

ALTER TABLE platform.invoices
  ADD COLUMN IF NOT EXISTS billing_period_start date,
  ADD COLUMN IF NOT EXISTS billing_period_end date;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM platform.invoices
    WHERE (billing_period_start IS NULL) <> (billing_period_end IS NULL)
       OR (billing_period_start IS NOT NULL AND billing_period_end < billing_period_start)
  ) THEN
    RAISE EXCEPTION 'Existing invoice billing-period data is inconsistent; refusing migration';
  END IF;
END
$preflight$;

ALTER TABLE platform.invoices
  DROP CONSTRAINT IF EXISTS invoices_billing_period_pair_check,
  ADD CONSTRAINT invoices_billing_period_pair_check
    CHECK (
      (billing_period_start IS NULL AND billing_period_end IS NULL)
      OR (billing_period_start IS NOT NULL AND billing_period_end IS NOT NULL
          AND billing_period_end >= billing_period_start)
    );

CREATE UNIQUE INDEX IF NOT EXISTS platform_invoices_one_per_subscription_period
  ON platform.invoices(subscription_id, billing_period_start)
  WHERE subscription_id IS NOT NULL AND billing_period_start IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_invoices_one_open_per_subscription
  ON platform.invoices(subscription_id)
  WHERE subscription_id IS NOT NULL
    AND status IN ('draft','issued','partially_paid','overdue');

COMMENT ON COLUMN platform.invoices.billing_period_start IS
  'Inclusive start date of the recurring subscription billing period; null for non-recurring contract invoices.';
COMMENT ON COLUMN platform.invoices.billing_period_end IS
  'Inclusive end date of the recurring subscription billing period; null for non-recurring contract invoices.';

COMMIT;
