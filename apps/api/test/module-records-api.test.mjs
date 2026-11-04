import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleModuleRecordsRequest } from "../dist/module-records.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const organizationId = "223e4567-e89b-42d3-a456-426614174000";
const recordId = "323e4567-e89b-42d3-a456-426614174000";

function responseDouble() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body ?? ""; }
  };
}
function request(method, url, body) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  stream.method = method;
  stream.url = url;
  stream.headers = {};
  return stream;
}
function tenantRow(permissions) {
  return { membership_id: "423e4567-e89b-42d3-a456-426614174000", organization_id: organizationId, roles: ["institution_owner"], permissions };
}

test("creates a tenant-scoped module record and records a minimal audit event", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.startsWith("SAVEPOINT") || sql.startsWith("RELEASE SAVEPOINT") || sql.startsWith("ROLLBACK TO SAVEPOINT")) return { rows: [] };
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["academic.classes.read", "academic.classes.write"])] };
    if (sql.startsWith("INSERT INTO academic.programs")) return { rows: [{ id: recordId, code: "TAHFIDZ", name: "Tahfidz" }] };
    if (sql.startsWith("INSERT INTO audit.audit_events")) return { rows: [] };
    throw new Error("unexpected query");
  }};
  const res = responseDouble();
  await handleModuleRecordsRequest(request("POST", "/v1/modules/programs", { code: "TAHFIDZ", name: "Tahfidz" }), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).data.id, recordId);
  const insert = calls.find(call => call.sql.startsWith("INSERT INTO academic.programs"));
  assert.ok(insert.sql.includes("VALUES ($1::uuid,$2,$3)"));
  assert.deepEqual(insert.values, [organizationId, "TAHFIDZ", "Tahfidz"]);
  const audit = calls.find(call => call.sql.startsWith("INSERT INTO audit.audit_events"));
  assert.ok(audit);
  assert.deepEqual(JSON.parse(audit.values[5]), { resource: "programs" });
});

test("does not permit a read-only membership to create module records", async () => {
  let insertAttempted = false;
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["academic.classes.read"])] };
    if (sql.startsWith("INSERT")) insertAttempted = true;
    throw new Error("unexpected query");
  }};
  const res = responseDouble();
  await handleModuleRecordsRequest(request("POST", "/v1/modules/programs", { code: "TAHFIDZ", name: "Tahfidz" }), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(insertAttempted, false);
});

test("reads a module only with its read permission", async () => {
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["academic.classes.read"])] };
    if (sql.includes("FROM academic.programs")) return { rows: [{ id: recordId, code: "TAHFIDZ", name: "Tahfidz" }] };
    throw new Error("unexpected query");
  }};
  const res = responseDouble();
  await handleModuleRecordsRequest(request("GET", "/v1/modules/programs"), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).data[0].name, "Tahfidz");
});


test("rolls back the module write when its audit event cannot be inserted", async () => {
  const calls = [];
  const pool = { async query(sql) {
    calls.push(sql);
    if (sql.startsWith("SAVEPOINT") || sql.startsWith("RELEASE SAVEPOINT") || sql.startsWith("ROLLBACK TO SAVEPOINT")) return { rows: [] };
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["academic.classes.read", "academic.classes.write"])] };
    if (sql.startsWith("INSERT INTO academic.programs")) return { rows: [{ id: recordId, code: "TAHFIDZ", name: "Tahfidz" }] };
    if (sql.startsWith("INSERT INTO audit.audit_events")) { const error = new Error("audit unavailable"); error.code = "XX000"; throw error; }
    throw new Error("unexpected query");
  }};
  const res = responseDouble();
  await handleModuleRecordsRequest(request("POST", "/v1/modules/programs", { code: "TAHFIDZ", name: "Tahfidz" }), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 500);
  assert.ok(calls.includes("ROLLBACK TO SAVEPOINT module_record_write"));
  assert.ok(calls.includes("RELEASE SAVEPOINT module_record_write"));
});


test("issues a library loan atomically, changes copy status, and records the actor", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.startsWith("SAVEPOINT") || sql.startsWith("RELEASE SAVEPOINT") || sql.startsWith("ROLLBACK TO SAVEPOINT")) return { rows: [] };
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["library.loans.read", "library.loans.write"])] };
    if (sql.includes("FROM library.copies c")) return { rows: [{ id: recordId, copy_status: "available", is_reference_only: false, is_active: true }] };
    if (sql.includes("FROM academic.student_profiles")) return { rows: [{ id: userId }] };
    if (sql.startsWith("UPDATE library.copies")) return { rows: [{ id: recordId }] };
    if (sql.startsWith("INSERT INTO library.loans")) return { rows: [{ id: "523e4567-e89b-42d3-a456-426614174000", loan_status: "open" }] };
    if (sql.startsWith("INSERT INTO audit.audit_events")) return { rows: [] };
    throw new Error("unexpected query: " + sql);
  }};
  const res = responseDouble();
  await handleModuleRecordsRequest(request("POST", "/v1/modules/library-loans", {
    copyId: recordId, borrowerType: "student", borrowerId: userId, dueAt: "2026-12-01T10:00:00.000Z"
  }), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 201);
  assert.equal(JSON.parse(res.body).data.loan_status, "open");
  assert.ok(calls.some(call => call.sql.includes("copy_status='on_loan'")));
  const audit = calls.find(call => call.sql.startsWith("INSERT INTO audit.audit_events"));
  assert.equal(audit.values[2], "library.loan.issue");
});

test("returns an open library loan and makes its copy available with an audit event", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.startsWith("SAVEPOINT") || sql.startsWith("RELEASE SAVEPOINT") || sql.startsWith("ROLLBACK TO SAVEPOINT")) return { rows: [] };
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["library.loans.read", "library.loans.write"])] };
    if (sql.startsWith("SELECT id, copy_id, loan_status FROM library.loans")) return { rows: [{ id: recordId, copy_id: userId, loan_status: "open" }] };
    if (sql.startsWith("SELECT id, copy_status FROM library.copies")) return { rows: [{ id: userId, copy_status: "on_loan" }] };
    if (sql.startsWith("UPDATE library.loans")) return { rows: [{ id: recordId, loan_status: "returned" }] };
    if (sql.startsWith("UPDATE library.copies")) return { rows: [{ id: userId }] };
    if (sql.startsWith("INSERT INTO audit.audit_events")) return { rows: [] };
    throw new Error("unexpected query: " + sql);
  }};
  const res = responseDouble();
  await handleModuleRecordsRequest(request("POST", `/v1/modules/library-loans/${recordId}/return`), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).data.loan_status, "returned");
  assert.ok(calls.some(call => call.sql.includes("copy_status='available'")));
  assert.equal(calls.find(call => call.sql.startsWith("INSERT INTO audit.audit_events")).values[2], "library.loan.return");
});

test("does not issue a reference-only or unavailable library copy", async () => {
  const pool = { async query(sql) {
    if (sql.startsWith("SAVEPOINT") || sql.startsWith("RELEASE SAVEPOINT") || sql.startsWith("ROLLBACK TO SAVEPOINT")) return { rows: [] };
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["library.loans.write"])] };
    if (sql.includes("FROM library.copies c")) return { rows: [{ id: recordId, copy_status: "available", is_reference_only: true, is_active: true }] };
    throw new Error("unexpected query: " + sql);
  }};
  const res = responseDouble();
  await handleModuleRecordsRequest(request("POST", "/v1/modules/library-loans", {
    copyId: recordId, borrowerType: "student", borrowerId: userId, dueAt: "2026-12-01T10:00:00.000Z"
  }), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 409);
  assert.equal(JSON.parse(res.body).error, "library_copy_unavailable");
});


test("encrypts student health fields before persistence and keeps audit metadata value-free", async () => {
  const previousKey = process.env.STUDENT_HEALTH_ENCRYPTION_KEY;
  const previousVersion = process.env.STUDENT_HEALTH_ENCRYPTION_KEY_VERSION;
  process.env.STUDENT_HEALTH_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.STUDENT_HEALTH_ENCRYPTION_KEY_VERSION = "test-v1";
  const calls = [];
  const pool = { async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["academic.students.health.read", "academic.students.health.write"])] };
    if (sql.startsWith("SAVEPOINT") || sql.startsWith("RELEASE SAVEPOINT") || sql.startsWith("ROLLBACK TO SAVEPOINT")) return { rows: [] };
    if (sql.startsWith("INSERT INTO academic.student_health_profiles")) {
      return { rows: [{
        id: recordId, student_id: userId, blood_group_ciphertext: values[2],
        allergy_data_ciphertext: values[3], medical_history_ciphertext: values[4],
        medication_data_ciphertext: values[5], emergency_instructions_ciphertext: values[6],
        encryption_key_version: values[7], created_at: new Date(), updated_at: new Date()
      }] };
    }
    if (sql.startsWith("INSERT INTO audit.audit_events")) return { rows: [] };
    throw new Error("unexpected query: " + sql);
  }};
  try {
    const res = responseDouble();
    await handleModuleRecordsRequest(request("POST", "/v1/modules/student-health-profiles", {
      studentId: userId, bloodGroup: "O+", allergyData: [{ allergen: "peanuts", severity: "high" }],
      medicalHistory: "Riwayat yang bersifat privat", medicationData: [{ name: "obat rutin" }]
    }), res, pool, userId, organizationId);
    assert.equal(res.statusCode, 201);
    const data = JSON.parse(res.body).data;
    assert.equal(data.blood_group, "O+");
    assert.equal(data.medical_history, "Riwayat yang bersifat privat");
    const insert = calls.find(call => call.sql.startsWith("INSERT INTO academic.student_health_profiles"));
    assert.ok(Buffer.isBuffer(insert.values[2]));
    assert.notEqual(insert.values[2].toString("utf8").includes("O+"), true);
    const audit = calls.find(call => call.sql.startsWith("INSERT INTO audit.audit_events"));
    assert.deepEqual(JSON.parse(audit.values[5]).fields, ["bloodGroup", "allergyData", "medicalHistory", "medicationData"]);
    assert.equal(JSON.stringify(audit.values).includes("Riwayat yang bersifat privat"), false);
  } finally {
    if (previousKey === undefined) delete process.env.STUDENT_HEALTH_ENCRYPTION_KEY; else process.env.STUDENT_HEALTH_ENCRYPTION_KEY = previousKey;
    if (previousVersion === undefined) delete process.env.STUDENT_HEALTH_ENCRYPTION_KEY_VERSION; else process.env.STUDENT_HEALTH_ENCRYPTION_KEY_VERSION = previousVersion;
  }
});

test("fails closed when the student health encryption key is missing", async () => {
  const previousKey = process.env.STUDENT_HEALTH_ENCRYPTION_KEY;
  delete process.env.STUDENT_HEALTH_ENCRYPTION_KEY;
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["academic.students.health.read"])] };
    throw new Error("no data query should run without an encryption key");
  }};
  try {
    const res = responseDouble();
    await handleModuleRecordsRequest(request("GET", "/v1/modules/student-health-profiles"), res, pool, userId, organizationId);
    assert.equal(res.statusCode, 503);
    assert.equal(JSON.parse(res.body).error, "student_health_encryption_not_configured");
  } finally {
    if (previousKey === undefined) delete process.env.STUDENT_HEALTH_ENCRYPTION_KEY; else process.env.STUDENT_HEALTH_ENCRYPTION_KEY = previousKey;
  }
});
