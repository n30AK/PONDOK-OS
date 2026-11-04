import test from "node:test";
import assert from "node:assert/strict";
import {
  validateAdmissionPeriodInput,
  validateApplicationInput,
  validateApplicationReviewInput,
  validateEnrollmentConversionInput
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
  answers: { educationTrack: "muadalah", boardingInterest: "mukim" }
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
