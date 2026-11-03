import test from "node:test";
import assert from "node:assert/strict";
import { validateStudentInput, validateStudentProfileData } from "../dist/academic.js";

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
