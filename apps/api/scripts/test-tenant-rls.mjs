import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for tenant RLS tests");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  const result = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name,
           c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
           EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation') AS has_tenant_policy
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('academic','finance','hr','inventory','sync')
      AND c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0 AND NOT a.attisdropped)
    ORDER BY n.nspname,c.relname
  `);
  assert.ok(result.rowCount > 0, "expected tenant-owned domain tables");
  for (const table of result.rows) {
    assert.equal(table.rls_enabled, true, `${table.schema_name}.${table.table_name}: RLS enabled`);
    assert.equal(table.rls_forced, true, `${table.schema_name}.${table.table_name}: FORCE RLS enabled`);
    assert.equal(table.has_tenant_policy, true, `${table.schema_name}.${table.table_name}: tenant policy exists`);
  }

  await client.query("BEGIN");
  await client.query("SELECT set_config('app.organization_id', '', true)");
  const noContext = await client.query("SELECT count(*)::int AS count FROM academic.student_profiles");
  assert.equal(noContext.rows[0].count, 0, "missing tenant context must see no tenant rows");
  await client.query("ROLLBACK");
  process.stdout.write(`Tenant RLS catalog checks passed for ${result.rowCount} tables; missing context is fail-closed.\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
