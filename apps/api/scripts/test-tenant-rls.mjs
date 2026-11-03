import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for tenant RLS tests");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  const appRole = await client.query(
    "SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit FROM pg_roles WHERE rolname = 'pondok_app'",
  );
  assert.equal(appRole.rowCount, 1, "migration must create pondok_app");
  assert.equal(appRole.rows[0].rolsuper, false, "pondok_app must not be superuser");
  assert.equal(appRole.rows[0].rolbypassrls, false, "pondok_app must not bypass RLS");
  assert.equal(appRole.rows[0].rolcreatedb, false, "pondok_app must not create databases");
  assert.equal(appRole.rows[0].rolcreaterole, false, "pondok_app must not create roles");
  assert.equal(appRole.rows[0].rolinherit, false, "pondok_app must not inherit other role privileges");

  const predicateRole = await client.query(
    "SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit FROM pg_roles WHERE rolname = 'pondok_rls_owner'",
  );
  assert.equal(predicateRole.rowCount, 1, "migration must create the RLS predicate helper role");
  assert.equal(predicateRole.rows[0].rolcanlogin, false, "predicate helper must not accept logins");
  assert.equal(predicateRole.rows[0].rolsuper, false, "predicate helper must not be superuser");
  assert.equal(predicateRole.rows[0].rolbypassrls, false, "predicate helper must not bypass RLS");
  assert.equal(predicateRole.rows[0].rolcreatedb, false, "predicate helper must not create databases");
  assert.equal(predicateRole.rows[0].rolcreaterole, false, "predicate helper must not create roles");
  assert.equal(predicateRole.rows[0].rolinherit, false, "predicate helper must not inherit role privileges");

  const result = await client.query(`
    SELECT n.nspname AS schema_name, c.relname AS table_name,
           c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced,
           EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation') AS has_tenant_policy
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('academic','admissions','assets','audit','boarding','cms','config','core','crm','finance','hr','inventory','library','procurement','sync')
      AND c.relkind = 'r'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0 AND NOT a.attisdropped)
    ORDER BY n.nspname,c.relname
  `);
  assert.equal(result.rowCount, 60, "expected all 60 organization-owned tables to be protected");
  for (const table of result.rows) {
    assert.equal(table.rls_enabled, true, `${table.schema_name}.${table.table_name}: RLS enabled`);
    assert.equal(table.rls_forced, true, `${table.schema_name}.${table.table_name}: FORCE RLS enabled`);
    assert.equal(table.has_tenant_policy, true, `${table.schema_name}.${table.table_name}: tenant policy exists`);
  }

  const authority = await client.query(`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
      array_agg(p.polname ORDER BY p.polname) FILTER (WHERE p.polname IS NOT NULL) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE n.nspname = 'core' AND c.relname IN ('organizations','organization_memberships','membership_roles')
    GROUP BY c.relname,c.relrowsecurity,c.relforcerowsecurity
  `);
  assert.equal(authority.rowCount, 3, "all tenant authority tables must be present");
  for (const table of authority.rows) {
    assert.equal(table.relrowsecurity, true, `core.${table.relname}: RLS enabled`);
    assert.equal(table.relforcerowsecurity, true, `core.${table.relname}: FORCE RLS enabled`);
  }
  const authorityByName = new Map(authority.rows.map((row) => [row.relname, row]));
  assert.ok(authorityByName.get("organizations").policies.includes("tenant_organization_select"));
  assert.ok(authorityByName.get("organizations").policies.includes("tenant_organization_insert"));
  assert.ok(authorityByName.get("organization_memberships").policies.includes("tenant_isolation"));
  assert.ok(authorityByName.get("organization_memberships").policies.includes("tenant_membership_self_insert"));
  assert.ok(authorityByName.get("membership_roles").policies.includes("tenant_membership_roles_select"));

  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE pondok_app");
  await client.query("SELECT set_config('app.user_id', '', true), set_config('app.organization_id', '', true)");
  const noContextStudents = await client.query("SELECT count(*)::int AS count FROM academic.student_profiles");
  const noContextMemberships = await client.query("SELECT count(*)::int AS count FROM core.organization_memberships");
  const noContextOrganizations = await client.query("SELECT count(*)::int AS count FROM core.organizations");
  const noContextRoleAssignments = await client.query("SELECT count(*)::int AS count FROM core.membership_roles");
  assert.equal(noContextStudents.rows[0].count, 0, "missing context must see no student rows");
  assert.equal(noContextMemberships.rows[0].count, 0, "missing context must see no membership rows");
  assert.equal(noContextOrganizations.rows[0].count, 0, "missing context must see no organization rows");
  assert.equal(noContextRoleAssignments.rows[0].count, 0, "missing context must see no role assignments");
  await client.query("ROLLBACK");

  const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const accountA = "aaaaaaaa-0001-4000-8000-000000000001";
  const accountB = "bbbbbbbb-0001-4000-8000-000000000001";
  const userA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const userB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  await client.query("BEGIN");
  await client.query(
    "INSERT INTO core.organizations (id, slug, name, organization_type, status) VALUES ($1,$2,$3,'pesantren','active'),($4,$5,$6,'pesantren','active')",
    [tenantA, "rls-ci-tenant-a", "RLS CI Tenant A", tenantB, "rls-ci-tenant-b", "RLS CI Tenant B"],
  );
  await client.query("SET LOCAL ROLE pondok_app");
  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userA, tenantA]);
  const membershipA = await client.query(
    "INSERT INTO core.organization_memberships (organization_id, user_id, membership_status) VALUES ($1,$2,'active') RETURNING id",
    [tenantA, userA],
  );
  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userB, tenantB]);
  const membershipB = await client.query(
    "INSERT INTO core.organization_memberships (organization_id, user_id, membership_status) VALUES ($1,$2,'active') RETURNING id",
    [tenantB, userB],
  );
  const membershipAId = membershipA.rows[0].id;
  const membershipBId = membershipB.rows[0].id;

  const ownerRoleA = await client.query("SELECT core.bootstrap_initial_owner_role($1::uuid) AS role_id", [membershipAId]);
  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userB, tenantB]);
  await client.query("SELECT core.bootstrap_initial_owner_role($1::uuid)", [membershipBId]);

  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userA, tenantA]);
  await client.query(
    "INSERT INTO finance.accounts (id, organization_id, account_code, account_name, account_type) VALUES ($1,$2,'RLS-A','Tenant A account','asset')",
    [accountA, tenantA],
  );
  const ownMembership = await client.query("SELECT id FROM core.organization_memberships WHERE id = $1", [membershipAId]);
  const foreignMembership = await client.query("SELECT id FROM core.organization_memberships WHERE id = $1", [membershipBId]);
  const ownOrganization = await client.query("SELECT id FROM core.organizations WHERE id = $1", [tenantA]);
  const foreignOrganization = await client.query("SELECT id FROM core.organizations WHERE id = $1", [tenantB]);
  const ownRoleAssignment = await client.query("SELECT role_id FROM core.membership_roles WHERE membership_id = $1", [membershipAId]);
  const foreignRoleAssignment = await client.query("SELECT role_id FROM core.membership_roles WHERE membership_id = $1", [membershipBId]);
  const ownAccount = await client.query("SELECT id FROM finance.accounts WHERE id = $1", [accountA]);
  await client.query("SAVEPOINT direct_role_assignment");
  await assert.rejects(
    () => client.query(
      "INSERT INTO core.membership_roles (membership_id, role_id) VALUES ($1,$2)",
      [membershipAId, ownerRoleA.rows[0].role_id],
    ),
    (error) => error && error.code === "42501",
    "runtime role must not directly assign or escalate membership roles",
  );
  await client.query("ROLLBACK TO SAVEPOINT direct_role_assignment");
  await client.query("RELEASE SAVEPOINT direct_role_assignment");
  assert.equal(ownMembership.rowCount, 1, "user A must read its own membership");
  assert.equal(foreignMembership.rowCount, 0, "user A must not read user B membership");
  assert.equal(ownOrganization.rowCount, 1, "user A must read its own organization");
  assert.equal(foreignOrganization.rowCount, 0, "user A must not read tenant B organization metadata");
  assert.equal(ownRoleAssignment.rowCount, 1, "user A must read its own role assignment");
  assert.equal(foreignRoleAssignment.rowCount, 0, "user A must not read user B role assignment");
  assert.equal(ownAccount.rowCount, 1, "user A must read its own finance row");

  await client.query("SAVEPOINT cross_tenant_membership");
  await assert.rejects(
    () => client.query(
      "INSERT INTO core.organization_memberships (organization_id, user_id, membership_status) VALUES ($1,$2,'active')",
      [tenantB, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"],
    ),
    (error) => error && error.code === "42501",
    "tenant A must not insert a membership for tenant B",
  );
  await client.query("ROLLBACK TO SAVEPOINT cross_tenant_membership");
  await client.query("RELEASE SAVEPOINT cross_tenant_membership");

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

  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userB, tenantB]);
  await client.query(
    "INSERT INTO finance.accounts (id, organization_id, account_code, account_name, account_type) VALUES ($1,$2,'RLS-B','Tenant B account','asset')",
    [accountB, tenantB],
  );

  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userA, tenantB]);
  const tenantAWithWrongOrg = await client.query("SELECT id FROM finance.accounts WHERE id = $1", [accountB]);
  const membershipWithWrongOrg = await client.query("SELECT id FROM core.organization_memberships WHERE id = $1", [membershipBId]);
  const roleWithWrongOrg = await client.query("SELECT role_id FROM core.membership_roles WHERE membership_id = $1", [membershipBId]);
  const organizationWithWrongOrg = await client.query("SELECT id FROM core.organizations WHERE id = $1", [tenantB]);
  assert.equal(tenantAWithWrongOrg.rowCount, 0, "user A must not access tenant B even when the organization header is spoofed");
  assert.equal(membershipWithWrongOrg.rowCount, 0, "user A must not access tenant B membership after organization spoofing");
  assert.equal(roleWithWrongOrg.rowCount, 0, "user A must not access tenant B role assignments after organization spoofing");
  assert.equal(organizationWithWrongOrg.rowCount, 0, "user A must not access tenant B organization metadata after organization spoofing");

  await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)", [userB, tenantB]);
  const tenantBOwn = await client.query("SELECT id FROM finance.accounts WHERE id = $1", [accountB]);
  const tenantBSeesA = await client.query("SELECT id FROM finance.accounts WHERE id = $1", [accountA]);
  assert.equal(tenantBOwn.rowCount, 1, "tenant B must read its own account");
  assert.equal(tenantBSeesA.rowCount, 0, "tenant B must not read tenant A data");
  await client.query("ROLLBACK");

  // Simulate the API first-organization bootstrap while using pondok_app.
  const bootstrapTenant = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const bootstrapUser = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const bootstrapCampus = "eeeeeeee-0001-4000-8000-000000000001";
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE pondok_app");
  await client.query(
    "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)",
    [bootstrapUser, bootstrapTenant],
  );
  await client.query(
    "INSERT INTO core.organizations (id, slug, name, organization_type, status) VALUES ($1,'rls-bootstrap-ci','RLS Bootstrap CI','pesantren','active')",
    [bootstrapTenant],
  );
  const bootstrapMembership = await client.query(
    "INSERT INTO core.organization_memberships (organization_id, user_id, membership_status) VALUES ($1,$2,'active') RETURNING id",
    [bootstrapTenant, bootstrapUser],
  );
  const bootstrapMembershipId = bootstrapMembership.rows[0].id;
  await client.query(
    "INSERT INTO core.campuses (id, organization_id, code, name, campus_type, status) VALUES ($1,$2,'UTAMA','Kampus Utama','main','active')",
    [bootstrapCampus, bootstrapTenant],
  );
  const ownerRole = await client.query(
    "SELECT core.bootstrap_initial_owner_role($1::uuid) AS role_id",
    [bootstrapMembershipId],
  );
  assert.ok(ownerRole.rows[0].role_id, "first bootstrap must assign the system owner role through the definer helper");
  await client.query(
    "INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid,$2::uuid,'organization.bootstrap','organization',$3::text,'{}'::jsonb)",
    [bootstrapTenant, bootstrapUser, bootstrapTenant],
  );
  const bootstrapCampusVisible = await client.query("SELECT id FROM core.campuses WHERE id = $1", [bootstrapCampus]);
  const bootstrapAuditVisible = await client.query("SELECT id FROM audit.audit_events WHERE organization_id = $1", [bootstrapTenant]);
  const bootstrapOrganizationVisible = await client.query("SELECT id FROM core.organizations WHERE id = $1", [bootstrapTenant]);
  const bootstrapOwnerRoleVisible = await client.query(
    "SELECT r.role_key FROM core.membership_roles mr JOIN core.roles r ON r.id = mr.role_id WHERE mr.membership_id = $1",
    [bootstrapMembershipId],
  );
  assert.equal(bootstrapCampusVisible.rowCount, 1, "first bootstrap must create its campus under FORCE RLS");
  assert.equal(bootstrapAuditVisible.rowCount, 1, "first bootstrap must write its audit event under FORCE RLS");
  assert.equal(bootstrapOrganizationVisible.rowCount, 1, "first bootstrap must read its organization under RLS");
  assert.equal(bootstrapOwnerRoleVisible.rows[0]?.role_key, "institution_owner", "first bootstrap must expose only its own owner role assignment");
  await client.query("ROLLBACK");

  process.stdout.write(`Tenant RLS passed: ${result.rowCount} organization-owned tables, restricted NOBYPASSRLS role, protected authority tables, bidirectional tenant isolation, and first bootstrap.\\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
