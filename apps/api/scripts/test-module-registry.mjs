import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for Module Registry tests");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

const admin = "11111111-1111-4111-8111-111111111111";
const publisher = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const requestId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const secondRequestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const digest = Buffer.alloc(32, 7);
const manifest = { manifestVersion: 1, moduleId: "org.example.registry", version: "1.0.0" };

async function expectDenied(work, predicate, message) {
  await client.query("SAVEPOINT expected_denial");
  try {
    await assert.rejects(work, predicate, message);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT expected_denial");
    await client.query("RELEASE SAVEPOINT expected_denial");
  }
}

try {
  const tables = await client.query(`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    WHERE c.oid IN (
      'platform.module_publishers'::regclass,
      'platform.module_requests'::regclass,
      'platform.module_request_events'::regclass
    )
  `);
  assert.equal(tables.rowCount, 3, "all Module Registry tables must exist");
  for (const table of tables.rows) {
    assert.equal(table.relrowsecurity, true, `${table.relname}: RLS enabled`);
    assert.equal(table.relforcerowsecurity, true, `${table.relname}: FORCE RLS enabled`);
  }

  const runtime = await client.query("SELECT rolcanlogin, rolbypassrls FROM pg_roles WHERE rolname = 'pondok_platform_runtime'");
  assert.equal(runtime.rowCount, 1);
  assert.equal(runtime.rows[0].rolcanlogin, false);
  assert.equal(runtime.rows[0].rolbypassrls, false);
  const eventPrivileges = await client.query(`
    SELECT has_table_privilege('pondok_platform_runtime','platform.module_request_events','UPDATE') AS can_update,
           has_table_privilege('pondok_platform_runtime','platform.module_request_events','DELETE') AS can_delete
  `);
  assert.equal(eventPrivileges.rows[0].can_update, false, "runtime cannot rewrite event history");
  assert.equal(eventPrivileges.rows[0].can_delete, false, "runtime cannot delete event history");

  await client.query("BEGIN");
  await client.query(
    "INSERT INTO core.organizations (id, slug, name, organization_type, status) VALUES ($1,'module-registry-ci','Module Registry CI','pesantren','active')",
    [org],
  );
  await client.query(
    "INSERT INTO platform.super_admins (user_id,email,display_name,status) VALUES ($1,'registry-admin@example.invalid','Registry CI Admin','active') ON CONFLICT (user_id) DO UPDATE SET status='active'",
    [admin],
  );
  await client.query(
    "INSERT INTO platform.module_publishers (user_id,granted_by,status) VALUES ($1,$2,'active') ON CONFLICT (user_id) DO UPDATE SET status='active',revoked_at=NULL",
    [publisher, admin],
  );
  await client.query("SET LOCAL ROLE pondok_platform_runtime");
  await client.query("SELECT set_config('app.user_id',$1,true)", [publisher]);
  await client.query(
    "INSERT INTO platform.module_requests (id,organization_id,module_id,module_version,manifest,manifest_digest,submitted_by,status,idempotency_key) VALUES ($1,$2,$3,'1.0.0',$4::jsonb,$5,$6,'submitted','registry-ci-key-001')",
    [requestId, org, "org.example.registry", JSON.stringify(manifest), digest, publisher],
  );
  await client.query(
    "INSERT INTO platform.module_request_events (request_id,actor_user_id,action,from_status,to_status) VALUES ($1,$2,'submit','draft','submitted')",
    [requestId, publisher],
  );
  const own = await client.query("SELECT id FROM platform.module_requests WHERE id=$1", [requestId]);
  assert.equal(own.rowCount, 1, "publisher can read their own request");
  const ownEvents = await client.query("SELECT id FROM platform.module_request_events WHERE request_id=$1", [requestId]);
  assert.equal(ownEvents.rowCount, 1, "publisher can read their own audit history");

  await client.query("SELECT set_config('app.user_id',$1,true)", [outsider]);
  const hidden = await client.query("SELECT id FROM platform.module_requests WHERE id=$1", [requestId]);
  assert.equal(hidden.rowCount, 0, "other users cannot read a publisher's request");
  await expectDenied(
    () => client.query(
      "INSERT INTO platform.module_requests (id,organization_id,module_id,module_version,manifest,manifest_digest,submitted_by,status,idempotency_key) VALUES ($1,$2,'org.example.denied','1.0.0',$3::jsonb,$4,$5,'submitted','registry-ci-key-002')",
      [secondRequestId, org, JSON.stringify(manifest), digest, outsider],
    ),
    (error) => error?.code === "42501",
    "non-publishers cannot submit modules",
  );

  await client.query("SELECT set_config('app.user_id',$1,true)", [publisher]);
  await expectDenied(
    () => client.query("UPDATE platform.module_requests SET status='approved' WHERE id=$1", [requestId]),
    (error) => error?.code === "42501",
    "publishers cannot approve or alter workflow state",
  );
  await expectDenied(
    () => client.query("UPDATE platform.module_requests SET manifest='{}'::jsonb WHERE id=$1", [requestId]),
    (error) => error?.code === "42501",
    "submission manifest is immutable",
  );

  await client.query("SELECT set_config('app.user_id',$1,true)", [admin]);
  await client.query(
    "UPDATE platform.module_requests SET status='approved', reviewed_by=$2, reviewed_at=now(), updated_at=now() WHERE id=$1",
    [requestId, admin],
  );
  await client.query(
    "INSERT INTO platform.module_request_events (request_id,actor_user_id,action,from_status,to_status) VALUES ($1,$2,'approve','submitted','approved')",
    [requestId, admin],
  );
  const approved = await client.query("SELECT status,reviewed_by FROM platform.module_requests WHERE id=$1", [requestId]);
  assert.equal(approved.rows[0].status, "approved");
  assert.equal(approved.rows[0].reviewed_by, admin);

  await expectDenied(
    () => client.query(
      "UPDATE platform.module_requests SET reviewed_by=$2 WHERE id=$1",
      [requestId, publisher],
    ),
    (error) => error?.code === "42501" || error?.code === "23514",
    "submitter cannot be recorded as reviewer",
  );
  await client.query("ROLLBACK");
  process.stdout.write("Module Registry security passed: RLS/FORCE RLS, publisher-only submission, owner-only reads, admin review, immutable snapshots, and append-only audit grants.\n");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
