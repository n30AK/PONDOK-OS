import test from "node:test";
import assert from "node:assert/strict";
import { withTenantScope } from "../dist/tenant-db.js";
import { attendanceClassScopePredicate, attendanceRecordScopePredicate, attendanceSessionScopePredicate, boardingAssignmentScopePredicate, boardingBedScopePredicate, boardingDormitoryScopePredicate, boardingRoomScopePredicate, boardingStudentRecordScopePredicate, boardingStudentScopePredicate, loadTenantContext } from "../dist/tenant-access.js";

const tenantA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const userB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function createPool(licenseAllowed = true) {
  const memberships = new Map([
    [`${userA}:${tenantA}`, {
      membership_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      organization_id: tenantA,
      roles: ["institution_owner"],
      permissions: ["academic.students.read"]
    }],
    [`${userB}:${tenantB}`, {
      membership_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      organization_id: tenantB,
      roles: ["institution_admin"],
      permissions: ["academic.students.read"]
    }]
  ]);
  const calls = [];
  const state = { inTransaction: false, role: "", userId: "", organizationId: "", releases: 0 };
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql === "BEGIN") { state.inTransaction = true; return { rows: [] }; }
      if (sql === "SET LOCAL ROLE pondok_runtime") {
        assert.equal(state.inTransaction, true, "runtime role must be set inside a transaction");
        state.role = "pondok_runtime";
        return { rows: [] };
      }
      if (sql.includes("set_config('app.user_id'")) {
        assert.equal(state.inTransaction, true, "tenant context must be transaction-local");
        state.userId = values[0];
        state.organizationId = values[1];
        return { rows: [] };
      }
      if (sql.includes("platform.tenant_license_allows_access")) return { rows: [{ allowed: licenseAllowed }] };
      if (sql.includes("FROM core.organization_memberships")) {
        assert.equal(state.role, "pondok_runtime", "membership lookup must run under restricted tenant role");
        assert.equal(state.userId, values[0], "verified user identity must be bound to the query");
        assert.equal(state.organizationId, values[1], "selected organization must be bound to the transaction");
        const membership = memberships.get(`${values[0]}:${values[1]}`);
        return { rows: membership ? [membership] : [] };
      }
      if (sql === "COMMIT" || sql === "ROLLBACK") {
        state.inTransaction = false;
        state.role = "";
        state.userId = "";
        state.organizationId = "";
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in tenant-scope test: ${sql}`);
    },
    release() { state.releases += 1; }
  };
  return { pool: { async query() { throw new Error("unscoped pool query is forbidden"); }, async connect() { return client; } }, calls, state };
}

test("withTenantScope binds user and organization before loading tenant permissions", async () => {
  const { pool, state } = createPool();
  const context = await withTenantScope(pool, userA, tenantA, (client) => loadTenantContext(client, userA, tenantA));
  assert.equal(context?.organizationId, tenantA);
  assert.deepEqual(context?.roles, ["institution_owner"]);
  assert.deepEqual(context?.permissions, ["academic.students.read", "core.roles.manage", "core.members.manage"]);
  assert.equal(state.inTransaction, false);
  assert.equal(state.role, "");
  assert.equal(state.userId, "");
  assert.equal(state.organizationId, "");
  assert.equal(state.releases, 1);
});

test("a user cannot load another tenant membership by changing the organization identifier", async () => {
  const { pool, state } = createPool();
  const context = await withTenantScope(pool, userA, tenantB, (client) => loadTenantContext(client, userA, tenantB));
  assert.equal(context, null);
  assert.equal(state.inTransaction, false);
  assert.equal(state.releases, 1);
});

test("pooled connection context is cleared before the next tenant request", async () => {
  const { pool, state } = createPool();
  const ownA = await withTenantScope(pool, userA, tenantA, (client) => loadTenantContext(client, userA, tenantA));
  const ownB = await withTenantScope(pool, userB, tenantB, (client) => loadTenantContext(client, userB, tenantB));
  assert.equal(ownA?.organizationId, tenantA);
  assert.equal(ownB?.organizationId, tenantB);
  assert.equal(state.releases, 2);
  assert.equal(state.inTransaction, false);
  assert.equal(state.role, "");
  assert.equal(state.userId, "");
  assert.equal(state.organizationId, "");
});

test("expired tenant trial blocks all tenant-scoped API work and rolls back the transaction", async () => {
  const { pool, state, calls } = createPool(false);
  await assert.rejects(
    () => withTenantScope(pool, userA, tenantA, async () => "must not run"),
    (error) => error?.name === "TenantLicenseExpiredError" && error.message === "tenant_trial_expired",
  );
  assert.ok(calls.some((call) => call.sql.includes("platform.tenant_license_allows_access")));
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(state.releases, 1);
  assert.equal(state.inTransaction, false);
});

test("invalid user or organization identifiers are rejected before acquiring a connection", async () => {
  const { pool, state } = createPool();
  await assert.rejects(() => withTenantScope(pool, "not-a-uuid", tenantA, async () => null), /Invalid tenant security context/);
  await assert.rejects(() => withTenantScope(pool, userA, "not-a-uuid", async () => null), /Invalid tenant security context/);
  assert.equal(state.releases, 0);
});


test("attendance scope predicates are tenant-bound and honor active campus/class grants", () => {
  const classSql = attendanceClassScopePredicate("cg", "$1", "$2", "$3");
  const sessionSql = attendanceSessionScopePredicate("ats", "$1", "$2", "$3");
  const recordSql = attendanceRecordScopePredicate("ar", "$1", "$2", "$3");
  for (const sql of [classSql, sessionSql, recordSql]) {
    assert.ok(sql.includes("$1::uuid"));
    assert.ok(sql.includes("$2::uuid"));
    assert.ok(sql.includes("$3::boolean"));
    assert.ok(sql.includes("revoked_at IS NULL"));
    assert.ok(sql.includes("valid_from <= now()"));
    assert.ok(sql.includes("valid_until IS NULL OR"));
  }
  assert.ok(classSql.includes("membership_campus_scopes"));
  assert.ok(classSql.includes("membership_class_scopes"));
  assert.ok(sessionSql.includes("ats.class_group_id"));
  assert.ok(recordSql.includes("ar.attendance_session_id"));
});


test("boarding scope predicates enforce tenant-bound campus, dormitory and room grants", () => {
  const dorm = boardingDormitoryScopePredicate("d", "$1", "$2", "$3");
  const room = boardingRoomScopePredicate("r", "$1", "$2", "$3");
  const bed = boardingBedScopePredicate("b", "$1", "$2", "$3");
  const assignment = boardingAssignmentScopePredicate("ba", "$1", "$2", "$3");
  const student = boardingStudentScopePredicate("sp", "$1", "$2", "$3");
  const record = boardingStudentRecordScopePredicate("lr", "$1", "$2", "$3");
  for (const sql of [dorm, room, bed, assignment, student, record]) {
    assert.ok(sql.includes("$1::uuid"));
    assert.ok(sql.includes("$2::uuid"));
    assert.ok(sql.includes("$3::boolean"));
    assert.ok(sql.includes("revoked_at IS NULL"));
    assert.ok(sql.includes("valid_from<=now()"));
    assert.ok(sql.includes("valid_until IS NULL OR"));
  }
  assert.ok(dorm.includes("membership_dormitory_scopes"));
  assert.ok(room.includes("membership_room_scopes"));
  assert.ok(bed.includes("boarding.rooms"));
  assert.ok(assignment.includes("boarding.beds"));
  assert.ok(student.includes("boarding.bed_assignments"));
  assert.ok(record.includes("sp.id=lr.student_id"));
});


test("boarding leave and incident history uses the student's assignment on the event date", () => {
  const leave = boardingStudentRecordScopePredicate("lr", "$1", "$2", "$3");
  const incident = boardingStudentRecordScopePredicate("i", "$1", "$2", "$3");
  assert.ok(leave.includes("lr.requested_from::date"));
  assert.ok(incident.includes("i.occurred_at::date"));
});
