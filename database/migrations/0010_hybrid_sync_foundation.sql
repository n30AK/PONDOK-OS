-- Offline/hybrid device registry and idempotent sync inbox foundation.
BEGIN;
CREATE SCHEMA IF NOT EXISTS sync;

CREATE TABLE IF NOT EXISTS sync.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  device_key text NOT NULL,
  device_name text NOT NULL,
  device_type text NOT NULL CHECK (device_type IN ('server','desktop','mobile','kiosk')),
  device_secret_hash text,
  device_status text NOT NULL DEFAULT 'pending' CHECK (device_status IN ('pending','active','revoked','blocked')),
  registered_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, device_key),
  CHECK ((device_status = 'active' AND approved_at IS NOT NULL) OR device_status <> 'active')
);

CREATE TABLE IF NOT EXISTS sync.inbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  device_id uuid NOT NULL,
  event_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_type text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','accepted','conflict','rejected')),
  processing_error text,
  processed_at timestamptz,
  FOREIGN KEY (organization_id, device_id) REFERENCES sync.devices (organization_id, id),
  UNIQUE (organization_id, event_id),
  UNIQUE (organization_id, idempotency_key),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE IF NOT EXISTS sync.outbox_checkpoints (
  organization_id uuid NOT NULL,
  device_id uuid NOT NULL,
  stream_key text NOT NULL,
  last_received_at timestamptz,
  last_event_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, device_id, stream_key),
  FOREIGN KEY (organization_id, device_id) REFERENCES sync.devices (organization_id, id)
);

CREATE TABLE IF NOT EXISTS sync.conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  inbox_event_id uuid NOT NULL,
  conflict_code text NOT NULL,
  description text NOT NULL,
  conflict_status text NOT NULL DEFAULT 'open' CHECK (conflict_status IN ('open','resolved','rejected')),
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, inbox_event_id) REFERENCES sync.inbox_events (organization_id, id),
  CHECK ((conflict_status = 'open' AND resolved_at IS NULL) OR conflict_status <> 'open')
);

CREATE INDEX IF NOT EXISTS idx_sync_inbox_pending
  ON sync.inbox_events (organization_id, processing_status, received_at);
CREATE INDEX IF NOT EXISTS idx_sync_device_status
  ON sync.devices (organization_id, device_status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_open
  ON sync.conflicts (organization_id, conflict_status, created_at DESC);

INSERT INTO core.permissions (permission_key, description) VALUES
 ('sync.devices.manage','Register, approve, block and revoke sync devices'),
 ('sync.events.read','View synchronization events and status'),
 ('sync.events.submit','Submit idempotent synchronization events'),
 ('sync.conflicts.resolve','Resolve synchronization conflicts')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;
COMMIT;
