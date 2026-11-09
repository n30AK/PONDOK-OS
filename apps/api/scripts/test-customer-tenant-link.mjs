import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for customer/tenant link tests");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const admin = "11111111-1111-4111-8111-111111111111";
const organization = "22222222-2222-4222-8222-222222222222";

try {
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO platform.super_admins (user_id,email,display_name,status) VALUES ($1,'customer-link-ci@example.invalid','Customer Link CI Admin','active') ON CONFLICT (user_id) DO UPDATE SET status='active'",
    [admin],
  );
  await client.query(
    "INSERT INTO core.organizations (id,slug,name,organization_type,status) VALUES ($1,'customer-link-ci-tenant','Customer Link CI Tenant','pesantren','active')",
    [organization],
  );

  const column = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='platform' AND table_name='customers' AND column_name='tenant_id'",
  );
  assert.equal(column.rowCount, 1, "platform.customers.tenant_id must exist");
  const index = await client.query(
    "SELECT indexdef FROM pg_indexes WHERE schemaname='platform' AND indexname='platform_customers_one_per_tenant'",
  );
  assert.equal(index.rowCount, 1, "one customer per tenant must be enforced by a unique index");
  assert.equal(
    (await client.query("SELECT has_table_privilege('pondok_platform_runtime','core.organizations','SELECT') AS allowed")).rows[0].allowed,
    true,
    "platform runtime must be able to resolve tenant names for Super Admin CRM views",
  );

  const leadIndex = await client.query(
    "SELECT indexdef FROM pg_indexes WHERE schemaname='platform' AND indexname='platform_customers_one_per_source_lead'",
  );
  assert.equal(leadIndex.rowCount, 1, "a CRM lead can be converted to at most one customer");

  await client.query("SET LOCAL ROLE pondok_platform_runtime");
  await client.query("SELECT set_config('app.user_id',$1,true)", [admin]);

  const customer = await client.query(
    "INSERT INTO platform.customers (customer_code,legal_name,display_name,status,tenant_id) VALUES ('CI-CUSTOMER-LINK-1','Yayasan CI','Yayasan CI','prospect',$1::uuid) RETURNING id,tenant_id",
    [organization],
  );
  assert.equal(customer.rowCount, 1);
  assert.equal(customer.rows[0].tenant_id, organization);

  const joined = await client.query(
    "SELECT c.id,o.name,o.slug FROM platform.customers c JOIN core.organizations o ON o.id=c.tenant_id WHERE c.id=$1::uuid",
    [customer.rows[0].id],
  );
  assert.equal(joined.rowCount, 1);
  assert.equal(joined.rows[0].name, "Customer Link CI Tenant");
  assert.equal(joined.rows[0].slug, "customer-link-ci-tenant");

  await client.query("SAVEPOINT duplicate_tenant_customer");
  await assert.rejects(
    () => client.query(
      "INSERT INTO platform.customers (customer_code,legal_name,display_name,status,tenant_id) VALUES ('CI-CUSTOMER-LINK-2','Duplicate CI','Duplicate CI','prospect',$1::uuid)",
      [organization],
    ),
    (error) => error?.code === "23505",
    "a tenant cannot have more than one commercial customer",
  );
  await client.query("ROLLBACK TO SAVEPOINT duplicate_tenant_customer");
  await client.query("RELEASE SAVEPOINT duplicate_tenant_customer");

  await client.query("SAVEPOINT invalid_tenant_customer");
  await assert.rejects(
    () => client.query(
      "INSERT INTO platform.customers (customer_code,legal_name,display_name,status,tenant_id) VALUES ('CI-CUSTOMER-LINK-3','Invalid CI','Invalid CI','prospect','99999999-9999-4999-8999-999999999999'::uuid)",
    ),
    (error) => error?.code === "23503",
    "a customer tenant link must reference a real institution",
  );
  await client.query("ROLLBACK TO SAVEPOINT invalid_tenant_customer");
  await client.query("RELEASE SAVEPOINT invalid_tenant_customer");


  const lead = await client.query(
    "INSERT INTO platform.crm_leads (lead_number,organization_name,contact_name,stage) VALUES ('CI-LEAD-CONVERT-1','Pondok CI','Admin CI','won') RETURNING id",
  );
  const sourceLeadId = lead.rows[0].id;
  await client.query(
    "INSERT INTO platform.customers (customer_code,legal_name,display_name,status,source_lead_id) VALUES ('CI-LEAD-CUSTOMER-1','Yayasan Lead CI','Pondok Lead CI','prospect',$1::uuid)",
    [sourceLeadId],
  );
  await client.query("SAVEPOINT duplicate_lead_conversion");
  await assert.rejects(
    () => client.query(
      "INSERT INTO platform.customers (customer_code,legal_name,display_name,status,source_lead_id) VALUES ('CI-LEAD-CUSTOMER-2','Yayasan Lead CI Duplikat','Pondok Lead CI Duplikat','prospect',$1::uuid)",
      [sourceLeadId],
    ),
    (error) => error?.code === "23505",
    "one won CRM lead cannot create duplicate customer records",
  );
  await client.query("ROLLBACK TO SAVEPOINT duplicate_lead_conversion");
  await client.query("RELEASE SAVEPOINT duplicate_lead_conversion");

  await client.query("ROLLBACK");
  process.stdout.write("Customer/tenant and CRM conversion integrity passed: FK, one-customer-per-tenant and one-customer-per-lead uniqueness, platform role read and tenant-name join.\n");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
