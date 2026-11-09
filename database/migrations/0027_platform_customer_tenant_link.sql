-- Link the commercial customer registry to the institution tenant registry.
-- A tenant may have at most one commercial customer record; prospect records may remain unlinked.
BEGIN;

ALTER TABLE platform.customers
  ADD COLUMN IF NOT EXISTS tenant_id uuid
    REFERENCES core.organizations(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS platform_customers_one_per_tenant
  ON platform.customers(tenant_id)
  WHERE tenant_id IS NOT NULL;

COMMENT ON COLUMN platform.customers.tenant_id IS
  'Optional link to the institution tenant. Null is allowed for an unqualified CRM prospect; once linked, the customer is the commercial record for that tenant.';

COMMIT;
