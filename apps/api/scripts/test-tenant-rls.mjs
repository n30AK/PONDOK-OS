import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for tenant RLS tests");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query("CREATE ROLE pondok_rls_test NOLOGIN").catch((error) => {
    if (error?.code !== "42710") throw error;
  });
  await client.query("GRANT USAGE ON SCHEMA academic, admissions, assets, audit, boarding, cms, config, core, crm, finance, hr, inventory, library, procurement, sync TO pondok_rls_test");
  await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA academic, admissions, assets, audit, boarding, cms, config, crm, finance, hr, inventory, library, procurement, sync TO pondok_rls_test");
  await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON core.campuses, core.roles TO pondok_rls_test");
  const result = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name,
           c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
           EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation') AS has_tenant_policy
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('academic','admissions','assets','audit','boarding','cms','config','core','crm','finance','hr','inventory','library','procurement','sync')
      AND c.relkind = 'r'
      AND NOT (n.nspname = 'core' AND c.relname = 'organization_memberships')
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
  await client.query("SET LOCAL ROLE pondok_rls_test");
  await client.query("SELECT set_config('app.organization_id', '', true)");
  const noContext = await client.query("SELECT count(*)::int AS count FROM academic.student_profiles");
  assert.equal(noContext.rows[0].count, 0, "missing tenant context must see no tenant rows");
  await client.query("ROLLBACK");

  const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const accountA = "aaaaaaaa-0001-4000-8000-000000000001";
  const userA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const userB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const accountB = "bbbbbbbb-0001-4000-8000-000000000001";
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO core.organizations (id, slug, name, organization_type, status) VALUES ($1,$2,$3,'pesantren','active'),($4,$5,$6,'pesantren','active')",
    [tenantA, "rls-ci-tenant-a", "RLS CI Tenant A", tenantB, "rls-ci-tenant-b", "RLS CI Tenant B"],
  );
  await client.query(
    "INSERT INTO core.organization_memberships (organization_id, user_id, membership_status) VALUES ($1,$2,'active'),($3,$4,'active')",
    [tenantA, userA, tenantB, userB],
  );
  await client.query("SET LOCAL ROLE pondok_rls_test");
  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userA, tenantA]);
  await client.query(
    "INSERT INTO finance.accounts (id, organization_id, account_code, account_name, account_type) VALUES ($1,$2,'RLS-A','Tenant A account','asset')",
    [accountA, tenantA],
  );
  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userB, tenantB]);
  await client.query(
    "INSERT INTO finance.accounts (id, organization_id, account_code, account_name, account_type) VALUES ($1,$2,'RLS-B','Tenant B account','asset')",
    [accountB, tenantB],
  );

  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userA, tenantA]);
  const tenantAOwn = await client.query("SELECT id FROM finance.accounts WHERE id = $1", [accountA]);
  const tenantASeesB = await client.query("SELECT id FROM finance.accounts WHERE id = $1", [accountB]);
  assert.equal(tenantAOwn.rowCount, 1, "tenant A must read its own account");
  assert.equal(tenantASeesB.rowCount, 0, "tenant A must not read tenant B data");
  await client.query("SAVEPOINT cross_tenant_write");
  await assert.rejects(
    () => client.query(
      "INSERT INTO finance.accounts (organization_id, account_code, account_name, account_type) VALUES ($1,'RLS-X','Cross-tenant insert','asset')",
      [tenantB],
    ),
    (error) => error && error.code === "42501",
    "tenant A must not insert rows for tenant B",
  );
  await client.query("ROLLBACK TO SAVEPOINT cross_tenant_write");
  await client.query("RELEASE SAVEPOINT cross_tenant_write");

  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userA, tenantB]);
  const tenantAWithWrongOrg = await client.query("SELECT id FROM finance.accounts WHERE id = $1", [accountB]);
  assert.equal(tenantAWithWrongOrg.rowCount, 0, "user A must not access tenant B even when the requested organization header is B");

  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userB, tenantB]);
  const tenantBOwn = await client.query("SELECT id FROM finance.accounts WHERE id = $1", [accountB]);
  const tenantBSeesA = await client.query("SELECT id FROM finance.accounts WHERE id = $1", [accountA]);
  assert.equal(tenantBOwn.rowCount, 1, "tenant B must read its own account");
  assert.equal(tenantBSeesA.rowCount, 0, "tenant B must not read tenant A data");
  await client.query("ROLLBACK");

  // Exercise the first-install sequence after RLS is already enabled:
  // create the organization and membership as the bootstrap DB role, then
  // switch to the restricted application role and create tenant-owned rows.
  const bootstrapTenant = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const bootstrapUser = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const bootstrapCampus = "eeeeeeee-0001-4000-8000-000000000001";
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO core.organizations (id, slug, name, organization_type, status) VALUES ($1,'rls-bootstrap-ci','RLS Bootstrap CI','pesantren','active')",
    [bootstrapTenant],
  );
  await client.query(
    "INSERT INTO core.organization_memberships (organization_id, user_id, membership_status) VALUES ($1,$2,'active')",
    [bootstrapTenant, bootstrapUser],
  );
  await client.query("SET LOCAL ROLE pondok_rls_test");
  await client.query(
    "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)",
    [bootstrapUser, bootstrapTenant],
  );
  await client.query(
    "INSERT INTO core.campuses (id, organization_id, code, name, campus_type, status) VALUES ($1,$2,'UTAMA','Kampus Utama','main','active')",
    [bootstrapCampus, bootstrapTenant],
  );
  await client.query(
    "INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1,$2,'organization.bootstrap','organization',$1::text,'{}'::jsonb)",
    [bootstrapTenant, bootstrapUser],
  );
  const bootstrapCampusVisible = await client.query(
    "SELECT id FROM core.campuses WHERE id = $1",
    [bootstrapCampus],
  );
  const bootstrapAuditVisible = await client.query(
    "SELECT id FROM audit.audit_events WHERE organization_id = $1",
    [bootstrapTenant],
  );
  assert.equal(bootstrapCampusVisible.rowCount, 1, "first bootstrap must create its campus under FORCE RLS");
  assert.equal(bootstrapAuditVisible.rowCount, 1, "first bootstrap must write its audit event under FORCE RLS");
  await client.query("ROLLBACK");

  process.stdout.write(`Tenant RLS passed: ${result.rowCount} protected tables, fail-closed context, bidirectional tenant isolation, and RLS-compatible first bootstrap.\\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
