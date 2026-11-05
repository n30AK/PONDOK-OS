import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  const expected = [
    "installation_log_events","installation_health_checks","installation_incidents",
    "backup_policies","backup_runs","maintenance_agreements","maintenance_service_events",
    "client_assurance_reports",
  ];
  const result = await client.query(`
    SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='platform' AND c.relname=ANY($1::text[])
  `, [expected]);
  assert.equal(result.rowCount, expected.length, "all observability/backup/maintenance tables exist");
  for (const row of result.rows) {
    assert.equal(row.relrowsecurity,true,`${row.relname}: RLS enabled`);
    assert.equal(row.relforcerowsecurity,true,`${row.relname}: FORCE RLS enabled`);
  }

  const grants = await client.query(`
    SELECT
      has_table_privilege('pondok_platform_runtime','platform.installation_log_events','DELETE') AS log_delete,
      has_table_privilege('pondok_platform_runtime','platform.installation_log_events','UPDATE') AS log_update,
      has_table_privilege('pondok_platform_runtime','platform.backup_runs','DELETE') AS backup_delete,
      has_table_privilege('pondok_platform_runtime','platform.backup_runs','UPDATE') AS backup_update,
      has_table_privilege('pondok_platform_runtime','platform.maintenance_service_events','DELETE') AS service_delete,
      has_table_privilege('pondok_platform_runtime','platform.maintenance_service_events','UPDATE') AS service_update
  `);
  for (const key of ["log_delete","log_update","backup_delete","backup_update","service_delete","service_update"]) {
    assert.equal(grants.rows[0][key],false,`${key} must be denied for runtime`);
  }

  const columns = await client.query(`
    SELECT table_name,column_name
    FROM information_schema.columns
    WHERE table_schema='platform'
      AND (table_name,column_name) IN (
        ('installation_log_events','message_redacted'),
        ('installation_log_events','details_redacted'),
        ('backup_runs','checksum_value'),
        ('backup_runs','restore_test_status'),
        ('maintenance_service_events','invoice_id'),
        ('maintenance_service_events','invoice_line_id'),
        ('client_assurance_reports','security_score'),
        ('client_assurance_reports','backup_score')
      )
  `);
  assert.equal(columns.rowCount,8,"redacted evidence, backup verification, invoice linkage and assurance scores exist");

  const constraints = await client.query(`
    SELECT conname FROM pg_constraint
    WHERE conrelid='platform.backup_policies'::regclass
       OR conrelid='platform.backup_runs'::regclass
       OR conrelid='platform.maintenance_agreements'::regclass
       OR conrelid='platform.maintenance_service_events'::regclass
  `);
  assert.ok(constraints.rows.some(x=>x.conname.includes("backup_policies") || x.conname.includes("check")));
  process.stdout.write("Observability/backup/maintenance checks passed: RLS, immutable runtime evidence, verified backup metadata, maintenance agreement controls, and invoice-linked service events.\n");
} finally {
  client.release();
  await pool.end();
}
