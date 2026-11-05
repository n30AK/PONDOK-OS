-- Procurement, inventory ledger and fixed-asset foundation for Central Command.
-- Stock and receipt evidence is append-only; quantities are derived from the immutable movement ledger.
BEGIN;

CREATE TABLE IF NOT EXISTS platform.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_code text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  display_name text NOT NULL,
  tax_id text,
  email text,
  phone text,
  website text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(address)='object'),
  payment_terms_days integer NOT NULL DEFAULT 0 CHECK (payment_terms_days BETWEEN 0 AND 365),
  currency char(3) NOT NULL DEFAULT 'IDR',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','suspended','blacklisted','archived')),
  risk_level text NOT NULL DEFAULT 'unassessed' CHECK (risk_level IN ('unassessed','low','medium','high','critical')),
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_vendors_status_name ON platform.vendors(status,display_name);

CREATE TABLE IF NOT EXISTS platform.vendor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES platform.vendors(id),
  full_name text NOT NULL,
  position_title text,
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_vendor_one_primary_contact ON platform.vendor_contacts(vendor_id) WHERE is_primary;

CREATE TABLE IF NOT EXISTS platform.purchase_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_number text NOT NULL UNIQUE,
  requested_by uuid NOT NULL,
  department text,
  purpose text NOT NULL,
  required_on date,
  currency char(3) NOT NULL DEFAULT 'IDR',
  estimated_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (estimated_total >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','approved','rejected','cancelled','ordered','partially_received','received','closed')),
  approval_request_id uuid REFERENCES platform.approval_requests(id),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);
CREATE INDEX IF NOT EXISTS platform_purchase_requisitions_status ON platform.purchase_requisitions(status,created_at DESC);

CREATE TABLE IF NOT EXISTS platform.purchase_requisition_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES platform.purchase_requisitions(id),
  product_id uuid REFERENCES platform.product_catalog(id),
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  estimated_unit_price numeric(18,2) NOT NULL DEFAULT 0 CHECK (estimated_unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.request_for_quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number text NOT NULL UNIQUE,
  requisition_id uuid NOT NULL REFERENCES platform.purchase_requisitions(id),
  title text NOT NULL,
  instructions text,
  currency char(3) NOT NULL DEFAULT 'IDR',
  issued_at timestamptz,
  closes_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed','evaluating','awarded','cancelled')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at IS NULL OR issued_at IS NULL OR closes_at > issued_at)
);
CREATE TABLE IF NOT EXISTS platform.rfq_vendor_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES platform.request_for_quotations(id),
  vendor_id uuid NOT NULL REFERENCES platform.vendors(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  response_status text NOT NULL DEFAULT 'invited' CHECK (response_status IN ('invited','viewed','declined','submitted','withdrawn')),
  UNIQUE (rfq_id,vendor_id)
);
CREATE TABLE IF NOT EXISTS platform.vendor_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES platform.request_for_quotations(id),
  vendor_id uuid NOT NULL REFERENCES platform.vendors(id),
  quote_reference text,
  currency char(3) NOT NULL DEFAULT 'IDR',
  subtotal numeric(18,2) NOT NULL CHECK (subtotal >= 0),
  tax_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  shipping_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  grand_total numeric(18,2) GENERATED ALWAYS AS (subtotal+tax_total+shipping_total) STORED,
  valid_until date,
  delivery_days integer CHECK (delivery_days IS NULL OR delivery_days >= 0),
  terms jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(terms)='object'),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','accepted','rejected','expired','withdrawn')),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfq_id,vendor_id)
);
CREATE TABLE IF NOT EXISTS platform.vendor_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_quote_id uuid NOT NULL REFERENCES platform.vendor_quotes(id),
  requisition_line_id uuid REFERENCES platform.purchase_requisition_lines(id),
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total numeric(18,2) GENERATED ALWAYS AS (quantity*unit_price+tax_amount) STORED
);

CREATE TABLE IF NOT EXISTS platform.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  vendor_id uuid NOT NULL REFERENCES platform.vendors(id),
  requisition_id uuid REFERENCES platform.purchase_requisitions(id),
  vendor_quote_id uuid REFERENCES platform.vendor_quotes(id),
  currency char(3) NOT NULL DEFAULT 'IDR',
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  shipping_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  grand_total numeric(18,2) GENERATED ALWAYS AS (subtotal+tax_total+shipping_total) STORED,
  ordered_on date NOT NULL DEFAULT CURRENT_DATE,
  expected_on date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','sent','acknowledged','partially_received','received','cancelled','closed')),
  approval_request_id uuid REFERENCES platform.approval_requests(id),
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expected_on IS NULL OR expected_on >= ordered_on),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);
CREATE INDEX IF NOT EXISTS platform_purchase_orders_vendor ON platform.purchase_orders(vendor_id,ordered_on DESC);
CREATE TABLE IF NOT EXISTS platform.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES platform.purchase_orders(id),
  requisition_line_id uuid REFERENCES platform.purchase_requisition_lines(id),
  product_id uuid REFERENCES platform.product_catalog(id),
  description text NOT NULL,
  quantity_ordered numeric(14,3) NOT NULL CHECK (quantity_ordered > 0),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total numeric(18,2) GENERATED ALWAYS AS (quantity_ordered*unit_price+tax_amount) STORED
);

CREATE TABLE IF NOT EXISTS platform.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code text NOT NULL UNIQUE,
  warehouse_name text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(address)='object'),
  manager_user_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  purchase_order_id uuid NOT NULL REFERENCES platform.purchase_orders(id),
  warehouse_id uuid NOT NULL REFERENCES platform.warehouses(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid NOT NULL,
  delivery_reference text,
  condition_notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','inspected','accepted','rejected','void')),
  inspected_by uuid,
  inspected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((inspected_by IS NULL) = (inspected_at IS NULL))
);
CREATE TABLE IF NOT EXISTS platform.goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES platform.goods_receipts(id),
  purchase_order_line_id uuid NOT NULL REFERENCES platform.purchase_order_lines(id),
  quantity_received numeric(14,3) NOT NULL CHECK (quantity_received > 0),
  quantity_accepted numeric(14,3) NOT NULL CHECK (quantity_accepted >= 0 AND quantity_accepted <= quantity_received),
  condition text NOT NULL DEFAULT 'good' CHECK (condition IN ('good','damaged','incomplete','quarantined')),
  notes text
);

CREATE TABLE IF NOT EXISTS platform.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_number text NOT NULL UNIQUE,
  warehouse_id uuid NOT NULL REFERENCES platform.warehouses(id),
  product_id uuid NOT NULL REFERENCES platform.product_catalog(id),
  movement_type text NOT NULL CHECK (movement_type IN ('opening','receipt','issue','transfer_in','transfer_out','adjustment_in','adjustment_out','return_in','return_out','write_off')),
  quantity_delta numeric(14,3) NOT NULL CHECK (quantity_delta <> 0),
  unit_cost numeric(18,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  reference_type text NOT NULL CHECK (reference_type IN ('goods_receipt','purchase_order','transfer','count','sale','return','manual','asset')),
  reference_id uuid,
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  notes text,
  CHECK ((movement_type IN ('opening','receipt','transfer_in','adjustment_in','return_in') AND quantity_delta > 0)
      OR (movement_type IN ('issue','transfer_out','adjustment_out','return_out','write_off') AND quantity_delta < 0))
);
CREATE INDEX IF NOT EXISTS platform_stock_movements_balance ON platform.stock_movements(warehouse_id,product_id,occurred_at);
CREATE INDEX IF NOT EXISTS platform_stock_movements_reference ON platform.stock_movements(reference_type,reference_id);
CREATE TABLE IF NOT EXISTS platform.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL UNIQUE,
  source_warehouse_id uuid NOT NULL REFERENCES platform.warehouses(id),
  destination_warehouse_id uuid NOT NULL REFERENCES platform.warehouses(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','in_transit','received','cancelled')),
  requested_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  dispatched_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_warehouse_id <> destination_warehouse_id),
  CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);
CREATE TABLE IF NOT EXISTS platform.stock_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES platform.stock_transfers(id),
  product_id uuid NOT NULL REFERENCES platform.product_catalog(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS platform.fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code text NOT NULL UNIQUE,
  asset_name text NOT NULL,
  category text NOT NULL,
  serial_number text,
  acquisition_date date NOT NULL,
  acquisition_cost numeric(18,2) NOT NULL CHECK (acquisition_cost >= 0),
  residual_value numeric(18,2) NOT NULL DEFAULT 0 CHECK (residual_value >= 0 AND residual_value <= acquisition_cost),
  useful_life_months integer NOT NULL CHECK (useful_life_months > 0),
  depreciation_method text NOT NULL DEFAULT 'straight_line' CHECK (depreciation_method IN ('straight_line')),
  warehouse_id uuid REFERENCES platform.warehouses(id),
  custodian_user_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','under_maintenance','disposed','lost')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_fixed_assets_serial_unique ON platform.fixed_assets(serial_number) WHERE serial_number IS NOT NULL;
CREATE TABLE IF NOT EXISTS platform.asset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES platform.fixed_assets(id),
  event_type text NOT NULL CHECK (event_type IN ('acquired','assigned','transferred','maintenance_started','maintenance_completed','impaired','disposed','lost','found')),
  event_summary text NOT NULL,
  from_custodian_user_id uuid,
  to_custodian_user_id uuid,
  from_warehouse_id uuid REFERENCES platform.warehouses(id),
  to_warehouse_id uuid REFERENCES platform.warehouses(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  evidence_reference text
);
CREATE INDEX IF NOT EXISTS platform_asset_events_timeline ON platform.asset_events(asset_id,occurred_at DESC);

DO $security$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vendors','vendor_contacts','purchase_requisitions','purchase_requisition_lines','request_for_quotations',
    'rfq_vendor_invites','vendor_quotes','vendor_quote_lines','purchase_orders','purchase_order_lines',
    'warehouses','goods_receipts','goods_receipt_lines','stock_movements','stock_transfers',
    'stock_transfer_lines','fixed_assets','asset_events'
  ] LOOP
    EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE platform.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY platform_admin_access ON platform.%I USING (platform.is_active_super_admin()) WITH CHECK (platform.is_active_super_admin())',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON platform.%I TO pondok_platform_runtime',t);
  END LOOP;
END
$security$;

REVOKE DELETE ON ALL TABLES IN SCHEMA platform FROM pondok_platform_runtime;
REVOKE UPDATE,DELETE ON platform.stock_movements,platform.goods_receipt_lines,platform.asset_events FROM pondok_platform_runtime;
GRANT SELECT,INSERT ON platform.stock_movements,platform.goods_receipt_lines,platform.asset_events TO pondok_platform_runtime;

DO $validation$
DECLARE expected integer; protected integer;
BEGIN
  expected := 18;
  SELECT count(*) INTO protected FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='platform' AND c.relname=ANY(ARRAY[
    'vendors','vendor_contacts','purchase_requisitions','purchase_requisition_lines','request_for_quotations',
    'rfq_vendor_invites','vendor_quotes','vendor_quote_lines','purchase_orders','purchase_order_lines',
    'warehouses','goods_receipts','goods_receipt_lines','stock_movements','stock_transfers',
    'stock_transfer_lines','fixed_assets','asset_events'
  ]) AND c.relrowsecurity AND c.relforcerowsecurity;
  IF protected <> expected THEN RAISE EXCEPTION 'Procurement/inventory RLS validation failed: % of %',protected,expected; END IF;
END
$validation$;

COMMIT;
