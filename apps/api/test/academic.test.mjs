import test from "node:test";
import assert from "node:assert/strict";
import { handleAcademicRequest, matchesAcademicStudentPath, validateStudentInput, validateStudentProfileData } from "../dist/academic.js";

test("student input accepts a minimally valid record", () => {
  assert.equal(validateStudentInput({ campusId: "123e4567-e89b-42d3-a456-426614174000", studentNumber: "SAN-001", legalName: "Ahmad Fulan" }), null);
});
test("student input rejects invalid campus and short name", () => {
  assert.equal(validateStudentInput({ campusId: "bad", studentNumber: "1", legalName: "A" }), "invalid_campus_id");
});
test("student input rejects malformed dates and gender codes", () => {
  const base = { campusId: "123e4567-e89b-42d3-a456-426614174000", studentNumber: "1", legalName: "Ahmad" };
  assert.equal(validateStudentInput({ ...base, birthDate: "31-12-2010" }), "invalid_birth_date");
  assert.equal(validateStudentInput({ ...base, birthDate: "2026-02-31" }), "invalid_birth_date");
  assert.equal(validateStudentInput({ ...base, genderCode: "unknown" }), "invalid_gender_code");
});

test("student profile accepts contextual education, guardian and boarding data", () => {
  assert.equal(validateStudentProfileData({
    fatherName: "Ahmad", guardianPhone: "08123456789", educationTrack: "muadalah",
    boardingStatus: "mukim", entryDate: "2026-07-01", admissionYear: "2026"
  }), null);
});
test("student profile rejects unknown, malformed and invalid enumerated fields", () => {
  assert.equal(validateStudentProfileData({ nationalId: "not-allowed" }), "unsupported_student_profile_field");
  assert.equal(validateStudentProfileData({ guardianEmail: "invalid-email" }), "invalid_guardian_email");
  assert.equal(validateStudentProfileData({ entryDate: "2026-02-31" }), "invalid_entry_date");
  assert.equal(validateStudentProfileData({ educationTrack: "unregistered" }), "invalid_education_track");
  assert.equal(validateStudentProfileData({ boardingStatus: "unknown" }), "invalid_boarding_status");
});
test("student profile rejects non-object payloads and oversized field values", () => {
  assert.equal(validateStudentProfileData(["not", "an", "object"]), "invalid_student_profile_data");
  assert.equal(validateStudentProfileData({ homeAddress: "x".repeat(1001) }), "invalid_student_profile_field");
});

test("student update accepts partial contextual profile changes", async () => {
  const { validateStudentUpdateInput } = await import("../dist/academic.js");
  assert.equal(validateStudentUpdateInput({ legalName: "Ahmad Baru", profileData: { guardianPhone: "08123456789" } }), null);
  assert.equal(validateStudentUpdateInput({ birthDate: "2026-02-31" }), "invalid_birth_date");
  assert.equal(validateStudentUpdateInput({ status: "active" }), "unsupported_student_update_field");
  assert.equal(validateStudentUpdateInput({}), "empty_student_update");
});

test("academic student route matcher accepts collection and item paths only", () => {
  assert.equal(matchesAcademicStudentPath("/v1/academic/students"), true);
  assert.equal(matchesAcademicStudentPath("/v1/academic/students/123e4567-e89b-42d3-a456-426614174000"), true);
  assert.equal(matchesAcademicStudentPath("/v1/academic/students/not-a-uuid"), false);
  assert.equal(matchesAcademicStudentPath("/v1/academic/students/123e4567-e89b-42d3-a456-426614174000/extra"), false);
  assert.equal(matchesAcademicStudentPath("/v1/academic/other"), false);
});


function mockRequest(method, url) {
  return { method, url, async *[Symbol.asyncIterator]() {} };
}

function mockResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers); },
    end(body = "") { this.body = body; },
  };
}

const tenantRow = {
  membership_id: "223e4567-e89b-42d3-a456-426614174000",
  organization_id: "323e4567-e89b-42d3-a456-426614174000",
  roles: ["academic_teacher"],
  permissions: ["academic.students.read"],
};

test("student detail GET is ID-bound and still applies member scope predicate", async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow] };
      return { rows: [] }; // An out-of-scope or nonexistent student must not be disclosed.
    },
  };
  const req = mockRequest("GET", "/v1/academic/students/423e4567-e89b-42d3-a456-426614174000");
  const res = mockResponse();
  const handled = await handleAcademicRequest(req, res, pool, "123e4567-e89b-42d3-a456-426614174000", tenantRow.organization_id);

  assert.equal(handled, true);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(JSON.parse(res.body), { error: "student_not_found" });
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /sp\\.id = \\$2::uuid/);
  assert.match(calls[1].sql, /membership_class_scopes/);
  assert.deepEqual(calls[1].values, [
    tenantRow.organization_id,
    "423e4567-e89b-42d3-a456-426614174000",
    tenantRow.membership_id,
    false,
  ]);
});

test("POST to a student detail URL is rejected before tenant/database lookup", async () => {
  let calls = 0;
  const pool = { async query() { calls += 1; return { rows: [] }; } };
  const req = mockRequest("POST", "/v1/academic/students/423e4567-e89b-42d3-a456-426614174000");
  const res = mockResponse();
  const handled = await handleAcademicRequest(req, res, pool, "123e4567-e89b-42d3-a456-426614174000", tenantRow.organization_id);

  assert.equal(handled, true);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, "GET, PATCH");
  assert.deepEqual(JSON.parse(res.body), { error: "method_not_allowed" });
  assert.equal(calls, 0);
});
