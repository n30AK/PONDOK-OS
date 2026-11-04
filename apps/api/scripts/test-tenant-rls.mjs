import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for tenant RLS tests");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  const runtimeRole = await client.query("SELECT rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = 'pondok_runtime'");
  assert.equal(runtimeRole.rowCount, 1, "restricted runtime role must exist");
  assert.equal(runtimeRole.rows[0].rolcanlogin, false, "runtime role must not allow login");
  assert.equal(runtimeRole.rows[0].rolbypassrls, false, "runtime role must not bypass RLS");
  const membershipSecurity = await client.query(`
    SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policy_count
    FROM pg_class c WHERE c.oid = 'core.organization_memberships'::regclass
  `);
  assert.equal(membershipSecurity.rows[0].rls_enabled, true, "membership authority RLS enabled");
  assert.equal(membershipSecurity.rows[0].rls_forced, true, "membership authority FORCE RLS enabled");
  assert.equal(Number(membershipSecurity.rows[0].policy_count), 3, "membership authority has only the three explicit access policies");
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
  await client.query("SET LOCAL ROLE pondok_runtime");
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
  await client.query("SET LOCAL ROLE pondok_runtime");
  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userA, tenantA]);
  const ownMembership = await client.query("SELECT organization_id FROM core.organization_memberships WHERE user_id = $1::uuid", [userA]);
  const otherMembership = await client.query("SELECT organization_id FROM core.organization_memberships WHERE user_id = $1::uuid", [userB]);
  assert.equal(ownMembership.rowCount, 1, "tenant runtime can read the authenticated user's active membership");
  assert.equal(otherMembership.rowCount, 0, "tenant runtime cannot read another user's membership");
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
  const bootstrapMembership = await client.query(
    "INSERT INTO core.organization_memberships (organization_id, user_id, membership_status) VALUES ($1,$2,'active') RETURNING id",
    [bootstrapTenant, bootstrapUser],
  );
  const ownerRole = await client.query(
    "SELECT id FROM core.roles WHERE organization_id IS NULL AND role_key = 'institution_owner' AND is_system = true LIMIT 1",
  );
  assert.ok(ownerRole.rows[0]?.id, "global institution owner role must exist");
  await client.query("SET LOCAL ROLE pondok_runtime");
  await client.query(
    "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)",
    [bootstrapUser, bootstrapTenant],
  );
  const visibleBootstrapMembership = await client.query(
    "SELECT id FROM core.organization_memberships WHERE user_id = $1::uuid",
    [bootstrapUser],
  );
  assert.equal(visibleBootstrapMembership.rowCount, 1, "tenant runtime can read its own bootstrap membership");
  await client.query(
    "INSERT INTO core.campuses (id, organization_id, code, name, campus_type, status) VALUES ($1,$2,'UTAMA','Kampus Utama','main','active')",
    [bootstrapCampus, bootstrapTenant],
  );
  await client.query(
    "INSERT INTO core.membership_roles (membership_id, role_id) VALUES ($1::uuid, $2::uuid)",
    [bootstrapMembership.rows[0].id, ownerRole.rows[0].id],
  );
  await client.query(
    "INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid,$2::uuid,'organization.bootstrap','organization',$3::text,'{}'::jsonb)",
    [bootstrapTenant, bootstrapUser, bootstrapTenant],
  );
  const bootstrapCampusVisible = await client.query(
    "SELECT id FROM core.campuses WHERE id = $1",
    [bootstrapCampus],
  );
  const bootstrapAuditVisible = await client.query(
    "SELECT id FROM audit.audit_events WHERE organization_id = $1",
    [bootstrapTenant],
  );
  const bootstrapRoleVisible = await client.query(
    "SELECT membership_id FROM core.membership_roles WHERE membership_id = $1::uuid",
    [bootstrapMembership.rows[0].id],
  );
  const bootstrapPermissionsVisible = await client.query(
    "SELECT permission_key FROM core.role_permissions WHERE role_id = $1::uuid",
    [ownerRole.rows[0].id],
  );
  assert.equal(bootstrapCampusVisible.rowCount, 1, "first bootstrap must create its campus under FORCE RLS");
  assert.equal(bootstrapAuditVisible.rowCount, 1, "first bootstrap must write its audit event under FORCE RLS");
  assert.equal(bootstrapRoleVisible.rowCount, 1, "first bootstrap must assign the owner role under RLS");
  assert.ok(bootstrapPermissionsVisible.rowCount > 0, "global owner permissions must remain visible under RLS");

  // Platform runtime can create the first membership only for an active Super Admin.
  const adminId = "11111111-1111-4111-8111-111111111111";
  const platformTenant = "22222222-2222-4222-8222-222222222222";
  const platformMember = "33333333-3333-4333-8333-333333333333";
  const unrelatedMember = "44444444-4444-4444-8444-444444444444";
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO core.organizations (id,slug,name,organization_type,status) VALUES ($1,'rls-platform-ci','RLS Platform CI','pesantren','active')",
    [platformTenant],
  );
  await client.query(
    "INSERT INTO core.organization_memberships (organization_id,user_id,membership_status) VALUES ($1,$2,'active'),($1,$3,'active')",
    [platformTenant, platformMember, unrelatedMember],
  );
  await client.query(
    "INSERT INTO platform.super_admins (user_id,email,display_name,status) VALUES ($1,'rls-admin@example.invalid','RLS CI Admin','active')",
    [adminId],
  );
  await client.query("SELECT set_config('app.user_id',$1,true)", [adminId]);
  await client.query("SET LOCAL ROLE pondok_platform_runtime");
  const adminVisibleMemberships = await client.query("SELECT id FROM core.organization_memberships");
  assert.equal(adminVisibleMemberships.rowCount, 2, "platform Super Admin can read membership registry");
  await client.query("ROLLBACK");

  // Normal applicants can only create a membership after their own activation
  // token has been consumed and the request is atomically bound to the new org.
  const applicantId = "55555555-5555-4555-8555-555555555555";
  const activationTenant = "66666666-6666-4666-8666-666666666666";
  const activationRequest = "77777777-7777-4777-8777-777777777777";
  const tokenHash = Buffer.from("88".repeat(32), "hex");
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO core.organizations (id,slug,name,organization_type,status) VALUES ($1,'rls-activation-ci','RLS Activation CI','pesantren','active')",
    [activationTenant],
  );
  await client.query(
    `INSERT INTO platform.activation_requests
      (id,requested_by,contact_email,contact_name,organization_name,organization_slug,organization_type,campus_code,campus_name,status)
     VALUES ($1,$2,'applicant@example.invalid','RLS Applicant','RLS Activation CI','rls-activation-ci','pesantren','UTAMA','Kampus Utama','approved')`,
    [activationRequest, applicantId],
  );
  await client.query(
    "INSERT INTO platform.activation_tokens (token_hash,request_id,requested_by,expires_at,created_by) VALUES ($1,$2,$3,now()+interval '1 day',$4)",
    [tokenHash, activationRequest, applicantId, adminId],
  );
  await client.query("SELECT set_config('app.user_id',$1,true)", [applicantId]);
  await client.query("SET LOCAL ROLE pondok_platform_runtime");
  await client.query("UPDATE platform.activation_tokens SET consumed_at=now() WHERE token_hash=$1", [tokenHash]);
  await client.query(
    "UPDATE platform.activation_requests SET status='activated',organization_id=$2::uuid,updated_at=now() WHERE id=$1::uuid",
    [activationRequest, activationTenant],
  );
  await client.query(
    "INSERT INTO core.organization_memberships (organization_id,user_id,membership_status) VALUES ($1::uuid,$2::uuid,'active')",
    [activationTenant, applicantId],
  );
  const applicantMembership = await client.query(
    "SELECT organization_id FROM core.organization_memberships WHERE user_id=$1::uuid",
    [applicantId],
  );
  assert.equal(applicantMembership.rowCount, 1, "applicant can create their membership after token consumption");
  await client.query("ROLLBACK");
  await client.query("ROLLBACK");

  process.stdout.write(`Tenant RLS passed: ${result.rowCount} protected tables, fail-closed context, bidirectional tenant isolation, and RLS-compatible first bootstrap.\\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
