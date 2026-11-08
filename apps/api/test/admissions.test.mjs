import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAdmissionPeriodInput,
  validateApplicationInput,
  validateApplicationReviewInput,
  validateEnrollmentConversionInput,
  handleAdmissionsRequest
} from "../dist/admissions.js";

const period = {
  periodCode: "PPDB-2027",
  name: "Penerimaan Santri Baru 2027",
  opensAt: "2026-11-01T00:00:00+07:00",
  closesAt: "2027-03-31T23:59:00+07:00"
};

test("admission period accepts a valid window and optional tenant references", () => {
  assert.equal(validateAdmissionPeriodInput(period), null);
  assert.equal(validateAdmissionPeriodInput({ ...period, campusId: "123e4567-e89b-42d3-a456-426614174000" }), null);
});

test("admission period rejects invalid dates, reversed windows and malformed references", () => {
  assert.equal(validateAdmissionPeriodInput({ ...period, opensAt: "yesterday" }), "invalid_period_window");
  assert.equal(validateAdmissionPeriodInput({ ...period, closesAt: period.opensAt }), "invalid_period_window");
  assert.equal(validateAdmissionPeriodInput({ ...period, campusId: "not-a-uuid" }), "invalid_campus_id");
});

const application = {
  admissionPeriodId: "123e4567-e89b-42d3-a456-426614174000",
  applicationNumber: "PPDB-2027-0001",
  applicantName: "Ahmad Fulan",
  applicantBirthDate: "2012-03-14",
  applicantGenderCode: "male",
  previousSchool: "MI Negeri",
  guardianName: "Budi Fulan",
  guardianPhone: "081234567890",
  guardianEmail: "wali@example.id",
  address: { province: "Jawa Barat", regency: "Bandung" },
  answers: { educationTrack: "muadalah", boardingInterest: "mukim", guardianRelationship: "mother" }
};

test("PPDB application accepts contextual applicant, guardian, address and program-interest data", () => {
  assert.equal(validateApplicationInput(application), null);
});

test("PPDB application rejects malformed identity, guardian contact and unsafe generic fields", () => {
  assert.equal(validateApplicationInput({ ...application, applicantBirthDate: "2026-02-31" }), "invalid_applicant_birth_date");
  assert.equal(validateApplicationInput({ ...application, guardianEmail: "not-an-email" }), "invalid_guardian_email");
  assert.equal(validateApplicationInput({ ...application, guardianPhone: "123" }), "invalid_guardian_phone");
  assert.equal(validateApplicationInput({ ...application, address: { nationalId: "should-not-be-collected-here" } }), "invalid_address_fields");
  assert.equal(validateApplicationInput({ ...application, answers: { medicalHistory: "sensitive" } }), "invalid_application_answers");
  assert.equal(validateApplicationInput({ ...application, answers: { ...application.answers, guardianRelationship: "unauthorized_value" } }), "invalid_guardian_relationship");
});

test("PPDB review decisions are restricted to the admissions workflow", () => {
  assert.equal(validateApplicationReviewInput({ decision: "accepted", notes: "Memenuhi persyaratan." }), null);
  assert.equal(validateApplicationReviewInput({ decision: "needs_information" }), null);
  assert.equal(validateApplicationReviewInput({ decision: "approved" }), "invalid_review_decision");
  assert.equal(validateApplicationReviewInput({ decision: "rejected", notes: "x".repeat(2001) }), "invalid_review_notes");
});

test("accepted applicant conversion requires a tenant campus and a valid student number", () => {
  assert.equal(validateEnrollmentConversionInput({
    campusId: "123e4567-e89b-42d3-a456-426614174000",
    studentNumber: "SAN-2027-0001"
  }), null);
  assert.equal(validateEnrollmentConversionInput({ campusId: "bad", studentNumber: "SAN-1" }), "invalid_campus_id");
  assert.equal(validateEnrollmentConversionInput({
    campusId: "123e4567-e89b-42d3-a456-426614174000", studentNumber: " "
  }), "invalid_student_number");
  assert.equal(validateEnrollmentConversionInput({
    campusId: "123e4567-e89b-42d3-a456-426614174000", studentNumber: "x".repeat(65)
  }), "invalid_student_number");
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

test("PPDB sensitive reads fail closed when access audit cannot be written", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/admissions.ts", import.meta.url)), "utf8");
  assert.match(source, /admissions_read_audit_unavailable/);
  assert.match(source, /admissions\.application\.list/);
  assert.match(source, /accessChannel: "workspace"/);
});

test("PPDB lifecycle writes are atomically coupled to metadata-only audit events", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/admissions.ts", import.meta.url)), "utf8");
  for (const action of [
    "admissions.period.create",
    "admissions.period.open",
    "admissions.period.close",
    "admissions.application.create",
    "admissions.application.submit",
    "admissions.application.review",
    "admissions.application.convert_to_student"
  ]) {
    assert.ok(source.includes(action), `missing audit action: ${action}`);
  }
  assert.match(source, /FROM created RETURNING id/);
  assert.match(source, /FROM updated RETURNING id/);
  assert.match(source, /FROM review RETURNING id/);
  assert.match(source, /FROM linked RETURNING id/);
});


test("accepted PPDB conversion creates a guardian contact and an unverified student relationship atomically", async () => {
  const applicationId = "123e4567-e89b-42d3-a456-426614174001";
  const organizationId = "123e4567-e89b-42d3-a456-426614174002";
  const userId = "123e4567-e89b-42d3-a456-426614174003";
  const campusId = "123e4567-e89b-42d3-a456-426614174004";
  let conversionSql = "";
  const pool = {
    async query(sql, values = []) {
      if (sql.includes("FROM core.organization_memberships")) {
        return { rows: [{
          membership_id: "123e4567-e89b-42d3-a456-426614174005",
          organization_id: organizationId,
          roles: ["institution_admin"],
          permissions: ["admissions.applications.review", "academic.students.create"]
        }] };
      }
      if (sql.includes("WITH candidate AS MATERIALIZED")) {
        conversionSql = sql;
        assert.deepEqual(values, [organizationId, applicationId, campusId, "SAN-2027-0001", userId]);
        return { rows: [{
          applicationId,
          studentId: "123e4567-e89b-42d3-a456-426614174006",
          guardianId: "123e4567-e89b-42d3-a456-426614174007",
          guardianRelationshipCode: "mother",
          guardianAuthorityVerified: false,
          studentNumber: "SAN-2027-0001",
          legalName: "Ahmad Fulan",
          studentStatus: "applicant"
        }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };
  const req = {
    method: "POST",
    url: `/v1/admissions/applications/${applicationId}/enroll`,
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ campusId, studentNumber: "SAN-2027-0001" }));
    }
  };
  const res = {
    status: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); },
    end(value = "") { this.body = value; }
  };
  const handled = await handleAdmissionsRequest(req, res, pool, userId, organizationId);
  assert.equal(handled, true);
  assert.equal(res.status, 201);
  const body = JSON.parse(res.body);
  assert.equal(body.data.guardianId, "123e4567-e89b-42d3-a456-426614174007");
  assert.equal(body.data.guardianRelationshipCode, "mother");
  assert.equal(body.data.guardianAuthorityVerified, false);
  assert.match(conversionSql, /INSERT INTO academic\.guardians/);
  assert.match(conversionSql, /INSERT INTO academic\.student_guardians/);
  assert.match(conversionSql, /true, false, false, false/);
  assert.match(conversionSql, /'pending'/);
  assert.match(conversionSql, /guardianAuthorityVerified', false/);
});

test("guardian relationship is never treated as legal authority or pickup permission during PPDB conversion", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/admissions.ts", import.meta.url)), "utf8");
  assert.match(source, /is_legal_guardian, is_emergency_contact, can_pickup_student\)\s*SELECT[^;]*true, false, false, false/s);
  assert.match(source, /guardianAuthorityVerified', false/);
  assert.match(source, /consent_status\)\s*SELECT[^;]*'pending'/s);
});
