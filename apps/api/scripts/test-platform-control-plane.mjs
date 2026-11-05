import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for platform control-plane tests");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const admin = "11111111-1111-4111-8111-111111111111";

try {
  const relations = await client.query(`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='platform' AND c.relname = ANY($1::text[])
  `, [[
    "crm_leads","customers","customer_contacts","product_catalog","quotes","quote_lines",
    "contracts","subscriptions","invoices","invoice_lines","payments","support_cases",
    "installations","agent_runs","security_findings","remote_jobs","module_catalog",
    "module_entitlements","approval_requests","report_exports",
  ]]);
  assert.equal(relations.rowCount, 20, "all platform ERP/fleet relations must exist");
  for (const relation of relations.rows) {
    assert.equal(relation.relrowsecurity, true, `${relation.relname}: RLS enabled`);
    assert.equal(relation.relforcerowsecurity, true, `${relation.relname}: FORCE RLS enabled`);
  }

  const role = await client.query("SELECT rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname='pondok_platform_runtime'");
  assert.equal(role.rowCount, 1);
  assert.equal(role.rows[0].rolcanlogin, false);
  assert.equal(role.rows[0].rolbypassrls, false);
  const privileges = await client.query(`
    SELECT has_table_privilege('pondok_platform_runtime','platform.agent_runs','UPDATE') AS agent_update,
           has_table_privilege('pondok_platform_runtime','platform.agent_runs','DELETE') AS agent_delete,
           has_table_privilege('pondok_platform_runtime','platform.security_findings','UPDATE') AS finding_update,
           has_table_privilege('pondok_platform_runtime','platform.audit_events','DELETE') AS audit_delete
  `);
  assert.equal(privileges.rows[0].agent_update, false, "agent run history is append-only");
  assert.equal(privileges.rows[0].agent_delete, false, "agent run history cannot be deleted");
  assert.equal(privileges.rows[0].finding_update, false, "security finding history cannot be rewritten by runtime");
  assert.equal(privileges.rows[0].audit_delete, false, "platform audit cannot be deleted");

  await client.query("BEGIN");
  await client.query(
    "INSERT INTO platform.super_admins (user_id,email,display_name,status) VALUES ($1,'platform-ci@example.invalid','Platform CI Admin','active') ON CONFLICT (user_id) DO UPDATE SET status='active'",
    [admin],
  );
  await client.query("SET LOCAL ROLE pondok_platform_runtime");
  await client.query("SELECT set_config('app.user_id',$1,true)", [admin]);

  const lead = await client.query(
    `INSERT INTO platform.crm_leads (lead_number,organization_name,contact_name,email,stage)
     VALUES ('CI-LEAD-0001','Pondok CI','Admin CI','admin@example.invalid','qualified') RETURNING id`,
  );
  const customer = await client.query(
    `INSERT INTO platform.customers (customer_code,legal_name,display_name,source_lead_id,status)
     VALUES ('CI-CUST-0001','Yayasan CI','Yayasan CI',$1,'active') RETURNING id`,
    [lead.rows[0].id],
  );
  const product = await client.query(
    `INSERT INTO platform.product_catalog (product_code,product_name,base_price,billing_interval)
     VALUES ('CI-PLAN-001','PONDOK CI Plan',100000,'monthly') RETURNING id`,
  );
  const invoice = await client.query(
    `INSERT INTO platform.invoices
      (invoice_number,customer_id,status,issued_on,due_on,subtotal,discount_total,tax_total,grand_total,created_by)
     VALUES ('CI-INV-0001',$1,'issued',CURRENT_DATE,CURRENT_DATE+14,100000,0,0,100000,$2) RETURNING id`,
    [customer.rows[0].id, admin],
  );
  await client.query(
    `INSERT INTO platform.invoice_lines (invoice_id,product_id,description,quantity,unit_price,line_total)
     VALUES ($1,$2,'PONDOK CI Plan',1,100000,100000)`,
    [invoice.rows[0].id, product.rows[0].id],
  );
  await client.query(
    `INSERT INTO platform.installations
      (customer_id,installation_code,display_name,deployment_mode,environment)
     VALUES ($1,'CI-INSTALL-0001','CI Self Hosted','self_hosted','staging')`,
    [customer.rows[0].id],
  );
  await client.query(
    `INSERT INTO platform.agent_runs (agent_key,trigger_type,status,summary)
     VALUES ('fleet_observer','manual','succeeded','CI health observation')`,
  );
  await client.query(
    `INSERT INTO platform.security_findings (severity,category,title,description)
     VALUES ('info','test','CI finding','Synthetic test finding')`,
  );

  await client.query("SAVEPOINT invalid_remote_job");
  await assert.rejects(
    () => client.query(
      `INSERT INTO platform.remote_jobs
        (installation_id,job_type,safety_class,status,idempotency_key,requested_by,expires_at)
       SELECT id,'module_upgrade',2,'queued','ci-unsafe-job',$1,now()+interval '1 hour'
       FROM platform.installations WHERE installation_code='CI-INSTALL-0001'`,
      [admin],
    ),
    (error) => error?.code === "23514",
    "controlled remote jobs require explicit approval",
  );
  await client.query("ROLLBACK TO SAVEPOINT invalid_remote_job");
  await client.query("RELEASE SAVEPOINT invalid_remote_job");

  await client.query("SAVEPOINT append_only_agent_run");
  await assert.rejects(
    () => client.query("UPDATE platform.agent_runs SET summary='rewritten' WHERE summary='CI health observation'"),
    (error) => error?.code === "42501",
    "runtime cannot rewrite agent run history",
  );
  await client.query("ROLLBACK TO SAVEPOINT append_only_agent_run");
  await client.query("RELEASE SAVEPOINT append_only_agent_run");

  await client.query("ROLLBACK");
  process.stdout.write("Platform ERP/fleet foundation passed: 20 RLS-protected relations, restricted runtime, CRM/customer/invoice flow, installation/agent records, append-only agent history and approval-gated remote jobs.\n");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
