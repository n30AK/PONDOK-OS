-- Boarding, procurement and fixed-asset operational foundations.
BEGIN;
CREATE SCHEMA IF NOT EXISTS boarding;
CREATE SCHEMA IF NOT EXISTS procurement;
CREATE SCHEMA IF NOT EXISTS assets;
CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE IF NOT EXISTS boarding.dormitories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  campus_id uuid,
  dormitory_code text NOT NULL,
  dormitory_name text NOT NULL,
  gender_policy text NOT NULL DEFAULT 'mixed' CHECK (gender_policy IN ('male','female','mixed')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, dormitory_code),
  FOREIGN KEY (organization_id, campus_id) REFERENCES core.campuses (organization_id, id)
);
CREATE TABLE IF NOT EXISTS boarding.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  dormitory_id uuid NOT NULL,
  room_code text NOT NULL,
  floor_label text,
  capacity integer NOT NULL CHECK (capacity > 0 AND capacity <= 100),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, dormitory_id, room_code),
  FOREIGN KEY (organization_id, dormitory_id) REFERENCES boarding.dormitories (organization_id, id)
);
CREATE TABLE IF NOT EXISTS boarding.beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  room_id uuid NOT NULL,
  bed_code text NOT NULL,
  bed_status text NOT NULL DEFAULT 'available' CHECK (bed_status IN ('available','occupied','maintenance','reserved')),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, room_id, bed_code),
  FOREIGN KEY (organization_id, room_id) REFERENCES boarding.rooms (organization_id, id)
);
CREATE TABLE IF NOT EXISTS boarding.bed_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  bed_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assigned_from date NOT NULL,
  assigned_until date,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, bed_id) REFERENCES boarding.beds (organization_id, id),
  FOREIGN KEY (organization_id, student_id) REFERENCES academic.student_profiles (organization_id, id),
  CHECK (assigned_until IS NULL OR assigned_until >= assigned_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_boarding_active_bed
  ON boarding.bed_assignments (organization_id, bed_id) WHERE assigned_until IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boarding_active_student
  ON boarding.bed_assignments (organization_id, student_id) WHERE assigned_until IS NULL;

CREATE TABLE IF NOT EXISTS boarding.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  student_id uuid NOT NULL,
  requested_from timestamptz NOT NULL,
  requested_until timestamptz NOT NULL,
  destination text,
  reason text NOT NULL,
  guardian_approval_status text NOT NULL DEFAULT 'pending' CHECK (guardian_approval_status IN ('pending','approved','rejected','not_required')),
  decision_status text NOT NULL DEFAULT 'pending' CHECK (decision_status IN ('pending','approved','rejected','cancelled','returned')),
  decided_by uuid,
  decided_at timestamptz,
  actual_returned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, student_id) REFERENCES academic.student_profiles (organization_id, id),
  CHECK (requested_until > requested_from)
);
CREATE TABLE IF NOT EXISTS boarding.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  student_id uuid NOT NULL,
  incident_type text NOT NULL,
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  description text NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL,
  follow_up_status text NOT NULL DEFAULT 'open' CHECK (follow_up_status IN ('open','in_progress','resolved','closed')),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, student_id) REFERENCES academic.student_profiles (organization_id, id)
);

CREATE TABLE IF NOT EXISTS procurement.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  supplier_code text NOT NULL,
  supplier_name text NOT NULL,
  tax_number text,
  email text,
  phone text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, supplier_code)
);
CREATE TABLE IF NOT EXISTS procurement.purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  campus_id uuid,
  request_number text NOT NULL,
  requested_by uuid NOT NULL,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  required_by date,
  purpose text NOT NULL,
  request_status text NOT NULL DEFAULT 'draft'
    CHECK (request_status IN ('draft','submitted','approved','rejected','ordered','cancelled','fulfilled')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, request_number),
  FOREIGN KEY (organization_id, campus_id) REFERENCES core.campuses (organization_id, id),
  CHECK (required_by IS NULL OR required_by >= request_date)
);
CREATE TABLE IF NOT EXISTS procurement.purchase_request_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  request_id uuid NOT NULL,
  item_id uuid,
  description text NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  estimated_unit_cost numeric(18,2) CHECK (estimated_unit_cost IS NULL OR estimated_unit_cost >= 0),
  FOREIGN KEY (organization_id, request_id) REFERENCES procurement.purchase_requests (organization_id, id),
  FOREIGN KEY (organization_id, item_id) REFERENCES inventory.items (organization_id, id)
);
CREATE TABLE IF NOT EXISTS procurement.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  request_id uuid,
  order_number text NOT NULL,
  ordered_on date NOT NULL DEFAULT CURRENT_DATE,
  expected_on date,
  order_status text NOT NULL DEFAULT 'draft' CHECK (order_status IN ('draft','approved','sent','partially_received','received','cancelled')),
  total_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, order_number),
  FOREIGN KEY (organization_id, supplier_id) REFERENCES procurement.suppliers (organization_id, id),
  FOREIGN KEY (organization_id, request_id) REFERENCES procurement.purchase_requests (organization_id, id),
  CHECK (expected_on IS NULL OR expected_on >= ordered_on)
);
CREATE TABLE IF NOT EXISTS procurement.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  purchase_order_id uuid NOT NULL,
  item_id uuid,
  description text NOT NULL,
  quantity numeric(18,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(18,2) NOT NULL CHECK (unit_cost >= 0),
  FOREIGN KEY (organization_id, purchase_order_id) REFERENCES procurement.purchase_orders (organization_id, id),
  FOREIGN KEY (organization_id, item_id) REFERENCES inventory.items (organization_id, id)
);

CREATE TABLE IF NOT EXISTS assets.asset_register (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  campus_id uuid,
  asset_code text NOT NULL,
  asset_name text NOT NULL,
  category text NOT NULL,
  acquisition_date date,
  acquisition_cost numeric(18,2) NOT NULL DEFAULT 0 CHECK (acquisition_cost >= 0),
  useful_life_months integer CHECK (useful_life_months IS NULL OR useful_life_months > 0),
  asset_status text NOT NULL DEFAULT 'active' CHECK (asset_status IN ('active','maintenance','disposed','lost')),
  location_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, asset_code),
  FOREIGN KEY (organization_id, campus_id) REFERENCES core.campuses (organization_id, id)
);
CREATE TABLE IF NOT EXISTS assets.asset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('assigned','moved','maintenance','disposed','status_changed','audited')),
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  FOREIGN KEY (organization_id, asset_id) REFERENCES assets.asset_register (organization_id, id)
);

CREATE TABLE IF NOT EXISTS crm.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  contact_type text NOT NULL CHECK (contact_type IN ('guardian','alumni','donor','partner','prospect','other')),
  display_name text NOT NULL,
  email text,
  phone text,
  organization_name text,
  consent_status text NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown','granted','withdrawn')),
  consent_recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);
CREATE TABLE IF NOT EXISTS crm.interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('phone','email','whatsapp','meeting','letter','other')),
  subject text NOT NULL,
  notes text,
  interaction_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  FOREIGN KEY (organization_id, contact_id) REFERENCES crm.contacts (organization_id, id)
);
CREATE TABLE IF NOT EXISTS crm.donor_pledges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  pledge_reference text NOT NULL,
  pledged_amount numeric(18,2) NOT NULL CHECK (pledged_amount > 0),
  currency_code char(3) NOT NULL DEFAULT 'IDR',
  pledged_on date NOT NULL DEFAULT CURRENT_DATE,
  expected_on date,
  pledge_status text NOT NULL DEFAULT 'pledged' CHECK (pledge_status IN ('pledged','partially_received','received','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, pledge_reference),
  FOREIGN KEY (organization_id, contact_id) REFERENCES crm.contacts (organization_id, id)
);

CREATE INDEX IF NOT EXISTS idx_boarding_leave_status
  ON boarding.leave_requests (organization_id, decision_status, requested_from);
CREATE INDEX IF NOT EXISTS idx_procurement_requests_status
  ON procurement.purchase_requests (organization_id, request_status, request_date DESC);
CREATE INDEX IF NOT EXISTS idx_assets_campus_status
  ON assets.asset_register (organization_id, campus_id, asset_status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_type
  ON crm.contacts (organization_id, contact_type, display_name);

INSERT INTO core.permissions (permission_key, description) VALUES
 ('boarding.rooms.manage','Manage dormitories, rooms and beds'),
 ('boarding.assignments.manage','Assign students to boarding beds'),
 ('boarding.leave.read','View student leave requests'),
 ('boarding.leave.decide','Approve or reject student leave requests'),
 ('boarding.incidents.read','View student incident records'),
 ('boarding.incidents.write','Record and manage student incident follow-up'),
 ('procurement.suppliers.manage','Manage suppliers'),
 ('procurement.requests.read','View purchase requests'),
 ('procurement.requests.write','Create purchase requests'),
 ('procurement.requests.approve','Approve purchase requests'),
 ('procurement.orders.manage','Manage purchase orders'),
 ('assets.register.read','View fixed assets'),
 ('assets.register.write','Manage fixed assets and lifecycle events'),
 ('crm.contacts.read','View CRM contacts'),
 ('crm.contacts.write','Manage CRM contacts and interactions'),
 ('crm.donations.manage','Manage donor pledges')
ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description;
COMMIT;
