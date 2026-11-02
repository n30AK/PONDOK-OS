import test from "node:test";
import assert from "node:assert/strict";
import { validateStudentInput } from "../dist/academic.js";

test("student input accepts a minimally valid record", () => {
  assert.equal(validateStudentInput({ campusId: "123e4567-e89b-42d3-a456-426614174000", studentNumber: "SAN-001", legalName: "Ahmad Fulan" }), null);
});
test("student input rejects invalid campus and short name", () => {
  assert.equal(validateStudentInput({ campusId: "bad", studentNumber: "1", legalName: "A" }), "invalid_campus_id");
});
test("student input rejects malformed dates and gender codes", () => {
  const base = { campusId: "123e4567-e89b-42d3-a456-426614174000", studentNumber: "1", legalName: "Ahmad" };
  assert.equal(validateStudentInput({ ...base, birthDate: "31-12-2010" }), "invalid_birth_date");
  assert.equal(validateStudentInput({ ...base, genderCode: "unknown" }), "invalid_gender_code");
});
