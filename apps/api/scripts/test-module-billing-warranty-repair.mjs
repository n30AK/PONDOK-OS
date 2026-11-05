import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  const expected = [
    "module_orders","module_lifecycle_events","warranty_agreements",
    "warranty_claims","client_repair_logs","stakeholder_service_reports",
  ];
  const tables = await client.query(`
    SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='platform' AND c.relname=ANY($1::text[])
  `, [expected]);
  assert.equal(tables.rowCount, expected.length, "all module billing/warranty/repair tables exist");
  for (const row of tables.rows) {
    assert.equal(row.relrowsecurity, true, `${row.relname}: RLS enabled`);
    assert.equal(row.relforcerowsecurity, true, `${row.relname}: FORCE RLS enabled`);
  }

  const columns = await client.query(`
    SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='platform' AND (table_name,column_name) IN (
      ('module_catalog','product_id'),
      ('module_orders','billing_mode'),
      ('module_orders','invoice_id'),
      ('module_orders','invoice_line_id'),
      ('module_orders','activation_status'),
      ('module_lifecycle_events','event_payload_redacted'),
      ('warranty_agreements','coverage_scope'),
      ('warranty_claims','eligibility_result'),
      ('client_repair_logs','root_cause'),
      ('client_repair_logs','client_visible_summary'),
      ('client_repair_logs','stakeholder_visible_summary'),
      ('client_repair_logs','invoice_line_id'),
      ('stakeholder_service_reports','financial_summary')
    )
  `);
  assert.equal(columns.rowCount, 13, "module pricing, invoice links, warranty, repair and report fields exist");

  const grants = await client.query(`
    SELECT
      has_table_privilege('pondok_platform_runtime','platform.module_lifecycle_events','UPDATE') AS module_event_update,
      has_table_privilege('pondok_platform_runtime','platform.module_lifecycle_events','DELETE') AS module_event_delete,
      has_table_privilege('pondok_platform_runtime','platform.client_repair_logs','UPDATE') AS repair_update,
      has_table_privilege('pondok_platform_runtime','platform.client_repair_logs','DELETE') AS repair_delete,
      has_table_privilege('pondok_platform_runtime','platform.module_orders','DELETE') AS order_delete
  `);
  for (const key of Object.keys(grants.rows[0])) {
    assert.equal(grants.rows[0][key], false, `${key} must be denied`);
  }

  const requiredConstraints = await client.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid IN (
      'platform.module_orders'::regclass,
      'platform.warranty_agreements'::regclass,
      'platform.warranty_claims'::regclass,
      'platform.client_repair_logs'::regclass
    )
  `);
  assert.ok(requiredConstraints.rows.length >= 20, "commercial, approval and warranty constraints exist");
  process.stdout.write("Module billing/warranty/repair checks passed: RLS, invoice linkage, approval gates, warranty evidence and immutable repair history.\\n");
} finally {
  client.release();
  await pool.end();
}
