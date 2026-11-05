-- Central Command platform business and fleet control-plane foundation.
-- Platform-owned records only; institution operational data remains in tenant schemas.
BEGIN;

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_number text NOT NULL UNIQUE,
  organization_name text NOT NULL,
  contact_name text NOT NULL,
  email text,
  phone text,
  source text NOT NULL DEFAULT 'manual',
  stage text NOT NULL DEFAULT 'new' CHECK (stage IN ('new','qualified','discovery','demo','proposal','negotiation','won','lost','dormant')),
  estimated_value numeric(18,2) CHECK (estimated_value IS NULL OR estimated_value >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  owner_user_id uuid,
  consent_status text NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown','granted','withdrawn','not_required')),
  next_follow_up_at timestamptz,
  lost_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_crm_leads_stage_created ON platform.crm_leads(stage, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_crm_leads_follow_up ON platform.crm_leads(next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  display_name text NOT NULL,
  entity_type text NOT NULL DEFAULT 'institution' CHECK (entity_type IN ('institution','foundation','company','individual','government','other')),
  tax_identifier_ciphertext bytea,
  tax_key_version text,
  billing_email text,
  billing_phone text,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(billing_address) = 'object'),
  status text NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','active','suspended','former')),
  source_lead_id uuid REFERENCES platform.crm_leads(id),
  account_owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((tax_identifier_ciphertext IS NULL) = (tax_key_version IS NULL))
);
CREATE INDEX IF NOT EXISTS platform_customers_status_name ON platform.customers(status, display_name);

CREATE TABLE IF NOT EXISTS platform.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  full_name text NOT NULL,
  position_title text,
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  contact_preferences jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(contact_preferences) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_customer_one_primary_contact
  ON platform.customer_contacts(customer_id) WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS platform.product_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code text NOT NULL UNIQUE,
  product_name text NOT NULL,
  description text,
  product_type text NOT NULL DEFAULT 'subscription' CHECK (product_type IN ('subscription','one_time','service','module')),
  base_price numeric(18,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  billing_interval text CHECK (billing_interval IS NULL OR billing_interval IN ('monthly','quarterly','yearly','one_time')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','accepted','expired','cancelled')),
  currency char(3) NOT NULL DEFAULT 'IDR',
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  valid_until date,
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (grand_total = subtotal - discount_total + tax_total)
);
CREATE TABLE IF NOT EXISTS platform.quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES platform.quotes(id),
  product_id uuid REFERENCES platform.product_catalog(id),
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total numeric(18,2) NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX IF NOT EXISTS platform_quote_lines_quote ON platform.quote_lines(quote_id);

CREATE TABLE IF NOT EXISTS platform.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  quote_id uuid REFERENCES platform.quotes(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','active','expired','terminated','cancelled')),
  starts_on date,
  ends_on date,
  renewal_mode text NOT NULL DEFAULT 'manual' CHECK (renewal_mode IN ('manual','automatic','none')),
  document_object_key text,
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS platform.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  contract_id uuid REFERENCES platform.contracts(id),
  product_id uuid NOT NULL REFERENCES platform.product_catalog(id),
  status text NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','grace','suspended','expired','cancelled')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  next_billing_at timestamptz,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX IF NOT EXISTS platform_subscriptions_customer_status ON platform.subscriptions(customer_id, status);

CREATE TABLE IF NOT EXISTS platform.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  contract_id uuid REFERENCES platform.contracts(id),
  subscription_id uuid REFERENCES platform.subscriptions(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partially_paid','paid','overdue','void','credited')),
  currency char(3) NOT NULL DEFAULT 'IDR',
  issued_on date,
  due_on date,
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (grand_total = subtotal - discount_total + tax_total),
  amount_paid numeric(18,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0 AND amount_paid <= grand_total),
  created_by uuid NOT NULL,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_on IS NULL OR issued_on IS NULL OR due_on >= issued_on)
);
CREATE INDEX IF NOT EXISTS platform_invoices_customer_due ON platform.invoices(customer_id, due_on DESC);
CREATE INDEX IF NOT EXISTS platform_invoices_open_due ON platform.invoices(due_on) WHERE status IN ('issued','partially_paid','overdue');

CREATE TABLE IF NOT EXISTS platform.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES platform.invoices(id),
  product_id uuid REFERENCES platform.product_catalog(id),
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  discount_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total numeric(18,2) NOT NULL CHECK (line_total >= 0)
);
CREATE INDEX IF NOT EXISTS platform_invoice_lines_invoice ON platform.invoice_lines(invoice_id);

CREATE TABLE IF NOT EXISTS platform.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_reference text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  invoice_id uuid REFERENCES platform.invoices(id),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  payment_method text NOT NULL CHECK (payment_method IN ('bank_transfer','cash','payment_gateway','other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected','refunded')),
  paid_at timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  external_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status <> 'verified') OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS platform_payments_customer_date ON platform.payments(customer_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS platform.support_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES platform.customers(id),
  installation_id uuid,
  subject text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'normal' CHECK (severity IN ('low','normal','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','waiting_customer','resolved','closed')),
  assigned_to uuid,
  sla_due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  installation_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  deployment_mode text NOT NULL CHECK (deployment_mode IN ('cloud','self_hosted','offline')),
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('development','staging','production')),
  status text NOT NULL DEFAULT 'pending_enrollment' CHECK (status IN ('pending_enrollment','online','degraded','offline','suspended','revoked')),
  app_version text,
  connector_version text,
  last_heartbeat_at timestamptz,
  last_backup_at timestamptz,
  telemetry_policy jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(telemetry_policy) = 'object'),
  enrolled_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_installations_customer_status ON platform.installations(customer_id, status);
CREATE INDEX IF NOT EXISTS platform_installations_heartbeat ON platform.installations(last_heartbeat_at);

ALTER TABLE platform.support_cases
  ADD CONSTRAINT support_cases_installation_fk FOREIGN KEY (installation_id) REFERENCES platform.installations(id);

CREATE TABLE IF NOT EXISTS platform.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL CHECK (agent_key IN ('orchestrator','fleet_observer','security_sentinel','database_guardian','application_sre','release_steward','backup_recovery','compliance_librarian','finance_controller','payroll_auditor','customer_success','report_analyst','offline_sync_steward')),
  trigger_type text NOT NULL CHECK (trigger_type IN ('scheduled','event','manual','incident')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled','approval_required')),
  installation_id uuid REFERENCES platform.installations(id),
  summary text,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(findings) = 'array'),
  proposed_actions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(proposed_actions) = 'array'),
  model_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(model_metadata) = 'object'),
  estimated_cost numeric(14,6) NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_agent_runs_agent_time ON platform.agent_runs(agent_key, created_at DESC);

CREATE TABLE IF NOT EXISTS platform.security_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid REFERENCES platform.installations(id),
  severity text NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  category text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','contained','resolved','false_positive')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  evidence_reference text
);
CREATE INDEX IF NOT EXISTS platform_security_findings_open ON platform.security_findings(severity, detected_at DESC) WHERE status IN ('open','investigating','contained');

CREATE TABLE IF NOT EXISTS platform.remote_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES platform.installations(id),
  job_type text NOT NULL CHECK (job_type IN ('health_check','collect_redacted_diagnostics','restart_allowlisted_service','retry_idempotent_job','rebuild_cache','config_change','module_upgrade','database_migration','restore_backup','other')),
  safety_class smallint NOT NULL CHECK (safety_class BETWEEN 0 AND 3),
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval','queued','dispatched','running','succeeded','failed','expired','cancelled','rejected')),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(request_payload) = 'object'),
  result_summary text,
  idempotency_key text NOT NULL,
  requested_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  expires_at timestamptz NOT NULL,
  dispatched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installation_id, idempotency_key),
  CHECK (safety_class < 2 OR (approved_by IS NOT NULL AND approved_at IS NOT NULL) OR status IN ('pending_approval','rejected','cancelled','expired'))
);
CREATE INDEX IF NOT EXISTS platform_remote_jobs_queue ON platform.remote_jobs(status, expires_at) WHERE status IN ('queued','dispatched','running');

CREATE TABLE IF NOT EXISTS platform.module_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  current_version text,
  lifecycle_status text NOT NULL DEFAULT 'planned' CHECK (lifecycle_status IN ('planned','foundation','operational','verified','deprecated')),
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(manifest) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.module_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  installation_id uuid REFERENCES platform.installations(id),
  module_id uuid NOT NULL REFERENCES platform.module_catalog(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','enabled','suspended','revoked')),
  granted_at timestamptz,
  expires_at timestamptz,
  granted_by uuid,
  UNIQUE (customer_id, installation_id, module_id)
);

CREATE TABLE IF NOT EXISTS platform.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN ('quote_discount','contract_activation','invoice_writeoff','payment_verification','payroll_release','remote_job','module_release','production_deploy','access_change','other')),
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled','expired')),
  requested_by uuid NOT NULL,
  decided_by uuid,
  decision_note text,
  expires_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'pending' AND decided_by IS NULL AND decided_at IS NULL) OR (status <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS platform.report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key text NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parameters) = 'object'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed','expired')),
  object_key text,
  requested_by uuid NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- All platform business/fleet tables are protected by server-side Super Admin authorization.
-- Runtime role receives only the operations needed by authenticated API handlers.
DO $security$
DECLARE target record;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('crm_leads'),('customers'),('customer_contacts'),('product_catalog'),('quotes'),('quote_lines'),
    ('contracts'),('subscriptions'),('invoices'),('invoice_lines'),('payments'),('support_cases'),
    ('installations'),('agent_runs'),('security_findings'),('remote_jobs'),('module_catalog'),
    ('module_entitlements'),('approval_requests'),('report_exports')
  ) AS t(table_name)
  LOOP
    EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format('ALTER TABLE platform.%I FORCE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format('CREATE POLICY platform_admin_access ON platform.%I USING (platform.is_active_super_admin()) WITH CHECK (platform.is_active_super_admin())', target.table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON platform.%I TO pondok_platform_runtime', target.table_name);
  END LOOP;
END
$security$;

REVOKE DELETE ON ALL TABLES IN SCHEMA platform FROM pondok_platform_runtime;
REVOKE UPDATE, DELETE ON platform.agent_runs, platform.security_findings FROM pondok_platform_runtime;
GRANT SELECT, INSERT ON platform.agent_runs, platform.security_findings TO pondok_platform_runtime;
REVOKE UPDATE, DELETE ON platform.audit_events FROM pondok_platform_runtime;

DO $validation$
DECLARE relation_count integer;
BEGIN
  SELECT count(*) INTO relation_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'platform' AND c.relkind = 'r'
    AND c.relname IN (
      'crm_leads','customers','customer_contacts','product_catalog','quotes','quote_lines',
      'contracts','subscriptions','invoices','invoice_lines','payments','support_cases',
      'installations','agent_runs','security_findings','remote_jobs','module_catalog',
      'module_entitlements','approval_requests','report_exports'
    )
    AND c.relrowsecurity AND c.relforcerowsecurity;
  IF relation_count <> 20 THEN
    RAISE EXCEPTION 'Central Command platform RLS validation failed: % of 20 tables protected', relation_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('pondok_platform_runtime','pondok_runtime')
      AND (rolcanlogin OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Application runtime roles must remain NOLOGIN and NOBYPASSRLS';
  END IF;
END
$validation$;

COMMIT;
