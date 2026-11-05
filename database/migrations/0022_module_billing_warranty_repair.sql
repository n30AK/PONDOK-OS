-- Central Command module monetization, warranty and client repair history.
-- Every commercial change is auditable and invoice-linked; no automatic production activation.
BEGIN;

ALTER TABLE platform.module_catalog
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES platform.product_catalog(id),
  ADD COLUMN IF NOT EXISTS default_billing_mode text NOT NULL DEFAULT 'included'
    CHECK (default_billing_mode IN ('one_time','recurring','included','complimentary','trial')),
  ADD COLUMN IF NOT EXISTS requires_commercial_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requires_activation_approval boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS platform_module_catalog_product_unique
  ON platform.module_catalog(product_id) WHERE product_id IS NOT NULL;

ALTER TABLE platform.module_entitlements
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS source_contract_id uuid REFERENCES platform.contracts(id),
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'included'
    CHECK (billing_mode IN ('one_time','recurring','included','complimentary','trial')),
  ADD COLUMN IF NOT EXISTS last_change_at timestamptz;

CREATE TABLE IF NOT EXISTS platform.module_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  installation_id uuid NOT NULL REFERENCES platform.installations(id),
  module_id uuid NOT NULL REFERENCES platform.module_catalog(id),
  entitlement_id uuid REFERENCES platform.module_entitlements(id),
  contract_id uuid REFERENCES platform.contracts(id),
  subscription_id uuid REFERENCES platform.subscriptions(id),
  action text NOT NULL CHECK (action IN ('add','activate','upgrade','downgrade','renew','suspend','resume','remove')),
  requested_version text,
  previous_version text,
  billing_mode text NOT NULL CHECK (billing_mode IN ('one_time','recurring','included','complimentary','trial')),
  quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  billing_period_start date,
  billing_period_end date,
  billing_status text NOT NULL DEFAULT 'pending'
    CHECK (billing_status IN ('not_billable','pending_approval','ready','invoiced','paid','waived','void')),
  activation_status text NOT NULL DEFAULT 'requested'
    CHECK (activation_status IN ('requested','pending_approval','approved','provisioning','active','failed','cancelled')),
  invoice_id uuid REFERENCES platform.invoices(id),
  invoice_line_id uuid REFERENCES platform.invoice_lines(id),
  requested_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  activated_at timestamptz,
  completed_at timestamptz,
  approval_request_id uuid REFERENCES platform.approval_requests(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (billing_period_end IS NULL OR billing_period_start IS NULL OR billing_period_end >= billing_period_start),
  CHECK (invoice_line_id IS NULL OR invoice_id IS NOT NULL),
  CHECK (billing_status NOT IN ('invoiced','paid') OR (invoice_id IS NOT NULL AND invoice_line_id IS NOT NULL)),
  CHECK (activation_status NOT IN ('approved','provisioning','active') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (billing_mode NOT IN ('included','complimentary','trial') OR billing_status = 'not_billable' OR billing_status IN ('waived','void')),
  CHECK (billing_mode <> 'one_time' OR billing_status NOT IN ('paid') OR invoice_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS platform_module_orders_customer_time ON platform.module_orders(customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS platform_module_orders_pending_billing ON platform.module_orders(billing_status,created_at) WHERE billing_status IN ('pending_approval','ready');
CREATE INDEX IF NOT EXISTS platform_module_orders_pending_activation ON platform.module_orders(activation_status,created_at) WHERE activation_status IN ('requested','pending_approval','approved','provisioning');

CREATE TABLE IF NOT EXISTS platform.module_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES platform.module_orders(id),
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  installation_id uuid NOT NULL REFERENCES platform.installations(id),
  module_id uuid NOT NULL REFERENCES platform.module_catalog(id),
  event_type text NOT NULL CHECK (event_type IN ('requested','approved','invoice_created','payment_confirmed','provision_started','activated','upgrade_applied','downgrade_applied','suspended','resumed','removed','failed','cancelled','waived')),
  actor_type text NOT NULL CHECK (actor_type IN ('customer','staff','agent','system')),
  actor_reference text,
  event_payload_redacted jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_payload_redacted) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  correlation_id text
);
CREATE INDEX IF NOT EXISTS platform_module_lifecycle_order ON platform.module_lifecycle_events(order_id,occurred_at);
CREATE INDEX IF NOT EXISTS platform_module_lifecycle_customer ON platform.module_lifecycle_events(customer_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS platform.warranty_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  installation_id uuid NOT NULL REFERENCES platform.installations(id),
  contract_id uuid REFERENCES platform.contracts(id),
  coverage_type text NOT NULL CHECK (coverage_type IN ('software_defect','implementation','hardware','comprehensive','custom')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','expired','void','claimed')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  response_target_hours numeric(8,2),
  resolution_target_hours numeric(8,2),
  coverage_scope jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(coverage_scope) = 'object'),
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exclusions) = 'array'),
  terms_version text NOT NULL,
  document_reference text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK (status NOT IN ('active','claimed') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS platform_warranty_customer_period ON platform.warranty_agreements(customer_id,starts_on,ends_on);

CREATE TABLE IF NOT EXISTS platform.warranty_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number text NOT NULL UNIQUE,
  warranty_id uuid NOT NULL REFERENCES platform.warranty_agreements(id),
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  installation_id uuid NOT NULL REFERENCES platform.installations(id),
  support_case_id uuid REFERENCES platform.support_cases(id),
  incident_id uuid REFERENCES platform.installation_incidents(id),
  subject text NOT NULL,
  fault_description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low','normal','high','critical')),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','eligibility_review','accepted','rejected','in_repair','waiting_customer','resolved','closed')),
  eligibility_result text CHECK (eligibility_result IS NULL OR eligibility_result IN ('covered','excluded','expired','needs_review')),
  eligibility_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  resolved_at timestamptz,
  resolution_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('accepted','rejected','in_repair','resolved','closed') OR (decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS platform_warranty_claims_customer ON platform.warranty_claims(customer_id,submitted_at DESC);
CREATE INDEX IF NOT EXISTS platform_warranty_claims_open ON platform.warranty_claims(status,submitted_at) WHERE status NOT IN ('resolved','closed','rejected');

CREATE TABLE IF NOT EXISTS platform.client_repair_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  installation_id uuid NOT NULL REFERENCES platform.installations(id),
  warranty_claim_id uuid REFERENCES platform.warranty_claims(id),
  support_case_id uuid REFERENCES platform.support_cases(id),
  incident_id uuid REFERENCES platform.installation_incidents(id),
  service_event_id uuid REFERENCES platform.maintenance_service_events(id),
  repair_category text NOT NULL CHECK (repair_category IN ('application','database','infrastructure','network','security','backup_restore','integration','module','data_recovery','other')),
  severity text NOT NULL CHECK (severity IN ('low','normal','high','critical')),
  status text NOT NULL DEFAULT 'opened'
    CHECK (status IN ('opened','diagnosing','awaiting_approval','in_progress','testing','resolved','closed','reopened')),
  problem_summary text NOT NULL,
  root_cause text,
  diagnostic_steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(diagnostic_steps) = 'array'),
  repair_actions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(repair_actions) = 'array'),
  before_state_reference text,
  after_state_reference text,
  evidence_manifest jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence_manifest) = 'object'),
  performed_by_type text NOT NULL CHECK (performed_by_type IN ('staff','agent','vendor','system')),
  performed_by_reference text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  downtime_minutes integer CHECK (downtime_minutes IS NULL OR downtime_minutes >= 0),
  billable boolean NOT NULL DEFAULT false,
  billable_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (billable_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  invoice_id uuid REFERENCES platform.invoices(id),
  invoice_line_id uuid REFERENCES platform.invoice_lines(id),
  client_visible_summary text,
  stakeholder_visible_summary text,
  client_acknowledged_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (finished_at IS NULL OR finished_at >= started_at),
  CHECK (invoice_line_id IS NULL OR invoice_id IS NOT NULL),
  CHECK (NOT billable OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS platform_repair_customer_time ON platform.client_repair_logs(customer_id,started_at DESC);
CREATE INDEX IF NOT EXISTS platform_repair_installation_time ON platform.client_repair_logs(installation_id,started_at DESC);
CREATE INDEX IF NOT EXISTS platform_repair_open ON platform.client_repair_logs(status,started_at) WHERE status NOT IN ('resolved','closed');

CREATE TABLE IF NOT EXISTS platform.stakeholder_service_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES platform.customers(id),
  installation_id uuid REFERENCES platform.installations(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  audience text NOT NULL CHECK (audience IN ('client','internal_management','board','auditor')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','delivered','superseded')),
  executive_summary text NOT NULL,
  service_metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(service_metrics) = 'object'),
  warranty_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(warranty_summary) = 'object'),
  repair_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(repair_summary) = 'object'),
  financial_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(financial_summary) = 'object'),
  risk_register jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(risk_register) = 'array'),
  evidence_manifest jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence_manifest) = 'object'),
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  delivered_at timestamptz,
  document_reference text,
  CHECK (period_end >= period_start),
  CHECK (status NOT IN ('approved','delivered') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (status <> 'delivered' OR delivered_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS platform_stakeholder_reports_period ON platform.stakeholder_service_reports(period_end DESC,audience);

-- Append-only operational and commercial evidence. The API mediates all reads/writes.
DO $security$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'module_orders','module_lifecycle_events','warranty_agreements','warranty_claims',
    'client_repair_logs','stakeholder_service_reports'
  ] LOOP
    EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE platform.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY platform_admin_access ON platform.%I USING (platform.is_active_super_admin()) WITH CHECK (platform.is_active_super_admin())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON platform.%I TO pondok_platform_runtime', t);
  END LOOP;
END
$security$;

REVOKE DELETE ON ALL TABLES IN SCHEMA platform FROM pondok_platform_runtime;
REVOKE UPDATE, DELETE ON platform.module_lifecycle_events FROM pondok_platform_runtime;
GRANT SELECT, INSERT ON platform.module_lifecycle_events TO pondok_platform_runtime;
REVOKE UPDATE, DELETE ON platform.client_repair_logs FROM pondok_platform_runtime;
GRANT SELECT, INSERT ON platform.client_repair_logs TO pondok_platform_runtime;

DO $validation$
DECLARE protected_count integer;
BEGIN
  SELECT count(*) INTO protected_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='platform' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
    AND c.relname = ANY(ARRAY[
      'module_orders','module_lifecycle_events','warranty_agreements','warranty_claims',
      'client_repair_logs','stakeholder_service_reports'
    ]);
  IF protected_count <> 6 THEN
    RAISE EXCEPTION 'Module billing/warranty/repair RLS validation failed: % of 6 tables protected', protected_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='pondok_platform_runtime' AND (rolcanlogin OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Platform runtime must remain NOLOGIN and NOBYPASSRLS';
  END IF;
END
$validation$;

COMMIT;
