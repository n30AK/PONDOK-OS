-- PONDOK OS observability, backup, maintenance and client assurance foundation.
-- Metadata/control plane only. Backup bytes remain on client-owned or explicitly contracted storage.
BEGIN;

CREATE TABLE IF NOT EXISTS platform.installation_log_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES platform.installations(id),
  event_time timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('api','web','worker','database','connector','security','backup','sync','user_report')),
  severity text NOT NULL CHECK (severity IN ('debug','info','warning','error','critical')),
  category text NOT NULL,
  event_code text NOT NULL,
  message_redacted text NOT NULL,
  details_redacted jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details_redacted) = 'object'),
  trace_id text,
  request_id text,
  correlation_id text,
  fingerprint text,
  app_version text,
  connector_version text,
  environment text NOT NULL CHECK (environment IN ('development','staging','production','offline')),
  contains_personal_data boolean NOT NULL DEFAULT false,
  redaction_profile text NOT NULL DEFAULT 'pondok-redaction-v1',
  source_sequence bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_installation_logs_time ON platform.installation_log_events(installation_id,event_time DESC);
CREATE INDEX IF NOT EXISTS platform_installation_logs_severity ON platform.installation_log_events(severity,event_time DESC) WHERE severity IN ('error','critical');
CREATE INDEX IF NOT EXISTS platform_installation_logs_fingerprint ON platform.installation_log_events(installation_id,fingerprint,event_time DESC) WHERE fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_installation_logs_trace ON platform.installation_log_events(trace_id) WHERE trace_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS platform.installation_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES platform.installations(id),
  check_type text NOT NULL CHECK (check_type IN ('heartbeat','api','database','storage','queue','security','backup','integrity','performance','version_compatibility','offline_sync','full')),
  status text NOT NULL CHECK (status IN ('healthy','degraded','unhealthy','unknown','skipped')),
  score smallint CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  checked_at timestamptz NOT NULL,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metrics_redacted jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics_redacted) = 'object'),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(findings) = 'array'),
  agent_run_id uuid REFERENCES platform.agent_runs(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_health_checks_latest ON platform.installation_health_checks(installation_id,check_type,checked_at DESC);

CREATE TABLE IF NOT EXISTS platform.installation_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_number text NOT NULL UNIQUE,
  installation_id uuid NOT NULL REFERENCES platform.installations(id),
  support_case_id uuid REFERENCES platform.support_cases(id),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected','triaged','investigating','mitigating','monitoring','resolved','closed','false_positive')),
  title text NOT NULL,
  summary text NOT NULL,
  root_cause text,
  impact_summary text,
  first_seen_at timestamptz NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_summary text,
  recurrence_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_incidents_open ON platform.installation_incidents(severity,detected_at DESC) WHERE status NOT IN ('resolved','closed','false_positive');
CREATE INDEX IF NOT EXISTS platform_incidents_installation ON platform.installation_incidents(installation_id,detected_at DESC);

CREATE TABLE IF NOT EXISTS platform.backup_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES platform.installations(id),
  policy_name text NOT NULL,
  backup_scope text NOT NULL CHECK (backup_scope IN ('database','uploads','configuration','application_artifacts','full')),
  frequency text NOT NULL CHECK (frequency IN ('hourly','daily','weekly','monthly','before_upgrade','on_demand')),
  retention_days integer NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  target_type text NOT NULL CHECK (target_type IN ('client_local','client_s3_compatible','client_network_storage','contracted_cloud')),
  target_reference text NOT NULL,
  encryption_required boolean NOT NULL DEFAULT true CHECK (encryption_required = true),
  checksum_required boolean NOT NULL DEFAULT true CHECK (checksum_required = true),
  offsite_copy_required boolean NOT NULL DEFAULT false,
  immutable_copy_required boolean NOT NULL DEFAULT false,
  recovery_point_objective_minutes integer CHECK (recovery_point_objective_minutes IS NULL OR recovery_point_objective_minutes > 0),
  recovery_time_objective_minutes integer CHECK (recovery_time_objective_minutes IS NULL OR recovery_time_objective_minutes > 0),
  is_enabled boolean NOT NULL DEFAULT true,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((approved_by IS NOT NULL AND approved_at IS NOT NULL) OR is_enabled = false)
);
CREATE INDEX IF NOT EXISTS platform_backup_policy_active ON platform.backup_policies(installation_id) WHERE is_enabled = true;

CREATE TABLE IF NOT EXISTS platform.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid REFERENCES platform.backup_policies(id),
  installation_id uuid NOT NULL REFERENCES platform.installations(id),
  trigger_type text NOT NULL CHECK (trigger_type IN ('scheduled','manual','before_upgrade','incident')),
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','verified','restore_tested','expired')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  backup_target_reference text NOT NULL,
  object_reference text,
  encrypted boolean NOT NULL DEFAULT false,
  checksum_algorithm text,
  checksum_value text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  database_consistent boolean,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','passed','failed','not_tested')),
  restore_tested_at timestamptz,
  restore_test_status text CHECK (restore_test_status IS NULL OR restore_test_status IN ('passed','failed')),
  initiated_by text NOT NULL CHECK (initiated_by IN ('connector','agent','administrator','scheduler')),
  failure_code text,
  failure_summary_redacted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (finished_at IS NULL OR finished_at >= started_at),
  CHECK (status NOT IN ('verified','restore_tested') OR (verification_status = 'passed' AND checksum_value IS NOT NULL)),
  CHECK (restore_test_status IS NULL OR restore_tested_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS platform_backup_runs_latest ON platform.backup_runs(installation_id,started_at DESC);
CREATE INDEX IF NOT EXISTS platform_backup_runs_failures ON platform.backup_runs(status,started_at DESC) WHERE status = 'failed';

CREATE TABLE IF NOT EXISTS platform.maintenance_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  installation_id uuid REFERENCES platform.installations(id),
  contract_id uuid REFERENCES platform.contracts(id),
  agreement_code text NOT NULL UNIQUE,
  service_tier text NOT NULL CHECK (service_tier IN ('basic','standard','premium','enterprise','custom')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','active','suspended','expired','terminated')),
  starts_on date NOT NULL,
  ends_on date,
  billing_mode text NOT NULL CHECK (billing_mode IN ('fixed_recurring','usage_based','hybrid','included_in_subscription')),
  currency char(3) NOT NULL DEFAULT 'IDR',
  recurring_fee numeric(18,2) NOT NULL DEFAULT 0 CHECK (recurring_fee >= 0),
  billing_interval text CHECK (billing_interval IS NULL OR billing_interval IN ('monthly','quarterly','yearly')),
  included_hours numeric(8,2) NOT NULL DEFAULT 0 CHECK (included_hours >= 0),
  overage_hourly_rate numeric(18,2) NOT NULL DEFAULT 0 CHECK (overage_hourly_rate >= 0),
  sla_policy jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sla_policy) = 'object'),
  scope jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scope) = 'object'),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (status <> 'active' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS platform_maintenance_agreements_customer ON platform.maintenance_agreements(customer_id,status);

CREATE TABLE IF NOT EXISTS platform.maintenance_service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  installation_id uuid REFERENCES platform.installations(id),
  agreement_id uuid REFERENCES platform.maintenance_agreements(id),
  incident_id uuid REFERENCES platform.installation_incidents(id),
  service_code text NOT NULL,
  description text NOT NULL,
  service_category text NOT NULL CHECK (service_category IN ('monitoring','diagnostics','incident_response','backup','restore_test','security_review','update','preventive_maintenance','support','other')),
  performed_by_type text NOT NULL CHECK (performed_by_type IN ('agent','staff','system')),
  performed_by_reference text,
  quantity numeric(14,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'service',
  billable boolean NOT NULL DEFAULT false,
  unit_price numeric(18,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  currency char(3) NOT NULL DEFAULT 'IDR',
  service_started_at timestamptz NOT NULL,
  service_finished_at timestamptz,
  evidence_reference text,
  approval_status text NOT NULL DEFAULT 'not_required' CHECK (approval_status IN ('not_required','pending','approved','rejected')),
  invoice_id uuid REFERENCES platform.invoices(id),
  invoice_line_id uuid REFERENCES platform.invoice_lines(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (service_finished_at IS NULL OR service_finished_at >= service_started_at),
  CHECK (NOT billable OR (agreement_id IS NOT NULL AND unit_price >= 0)),
  CHECK (invoice_line_id IS NULL OR invoice_id IS NOT NULL),
  CHECK (NOT billable OR approval_status IN ('pending','approved'))
);
CREATE INDEX IF NOT EXISTS platform_maintenance_events_customer ON platform.maintenance_service_events(customer_id,service_started_at DESC);
CREATE INDEX IF NOT EXISTS platform_maintenance_events_uninvoiced ON platform.maintenance_service_events(customer_id,service_started_at) WHERE billable = true AND invoice_id IS NULL AND approval_status = 'approved';

CREATE TABLE IF NOT EXISTS platform.client_assurance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES platform.customers(id),
  installation_id uuid REFERENCES platform.installations(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','delivered','superseded')),
  overall_status text NOT NULL CHECK (overall_status IN ('healthy','attention_required','critical','insufficient_data')),
  health_score smallint CHECK (health_score IS NULL OR health_score BETWEEN 0 AND 100),
  security_score smallint CHECK (security_score IS NULL OR security_score BETWEEN 0 AND 100),
  backup_score smallint CHECK (backup_score IS NULL OR backup_score BETWEEN 0 AND 100),
  availability_percent numeric(7,4) CHECK (availability_percent IS NULL OR availability_percent BETWEEN 0 AND 100),
  incident_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(incident_summary) = 'object'),
  maintenance_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(maintenance_summary) = 'object'),
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recommendations) = 'array'),
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
CREATE INDEX IF NOT EXISTS platform_assurance_reports_customer_period ON platform.client_assurance_reports(customer_id,period_end DESC);

ALTER TABLE platform.installations
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_security_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_log_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_backup_at timestamptz;

ALTER TABLE platform.support_cases
  ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES platform.installation_incidents(id),
  ADD COLUMN IF NOT EXISTS source_channel text NOT NULL DEFAULT 'portal' CHECK (source_channel IN ('portal','email','phone','connector','agent','manual'));

-- Super Admin API service mediates ingestion, backup orchestration and report access.
-- Runtime roles never receive direct DELETE on operational evidence.
DO $security$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'installation_log_events','installation_health_checks','installation_incidents',
    'backup_policies','backup_runs','maintenance_agreements','maintenance_service_events',
    'client_assurance_reports'
  ] LOOP
    EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE platform.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY platform_admin_access ON platform.%I USING (platform.is_active_super_admin()) WITH CHECK (platform.is_active_super_admin())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON platform.%I TO pondok_platform_runtime', t);
  END LOOP;
END
$security$;

REVOKE DELETE ON ALL TABLES IN SCHEMA platform FROM pondok_platform_runtime;
REVOKE UPDATE, DELETE ON platform.installation_log_events, platform.installation_health_checks, platform.backup_runs, platform.maintenance_service_events FROM pondok_platform_runtime;
GRANT SELECT, INSERT ON platform.installation_log_events, platform.installation_health_checks, platform.backup_runs, platform.maintenance_service_events TO pondok_platform_runtime;
REVOKE UPDATE, DELETE ON platform.audit_events FROM pondok_platform_runtime;

DO $validation$
DECLARE protected_count integer;
BEGIN
  SELECT count(*) INTO protected_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='platform' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
    AND c.relname = ANY(ARRAY[
      'installation_log_events','installation_health_checks','installation_incidents',
      'backup_policies','backup_runs','maintenance_agreements','maintenance_service_events',
      'client_assurance_reports'
    ]);
  IF protected_count <> 8 THEN
    RAISE EXCEPTION 'Observability/backup/maintenance RLS validation failed: % of 8 tables protected', protected_count;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='pondok_platform_runtime' AND (rolcanlogin OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'Platform runtime must remain NOLOGIN and NOBYPASSRLS';
  END IF;
END
$validation$;

COMMIT;
