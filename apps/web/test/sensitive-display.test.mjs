import test from "node:test";
import assert from "node:assert/strict";
import { isSensitiveStudentHealthField } from "../src/sensitive-display.js";

test("masks every student health field in both API and form naming conventions", () => {
  for (const field of [
    "bloodGroup", "blood_group",
    "allergyData", "allergy_data",
    "medicalHistory", "medical_history",
    "medicationData", "medication_data",
    "emergencyInstructions", "emergency_instructions",
  ]) {
    assert.equal(isSensitiveStudentHealthField("student-health-profiles", field), true, field);
  }
});

test("does not mask non-health resources or unrelated fields", () => {
  assert.equal(isSensitiveStudentHealthField("student-details", "bloodGroup"), false);
  assert.equal(isSensitiveStudentHealthField("student-health-profiles", "legal_name"), false);
  assert.equal(isSensitiveStudentHealthField("student-identity-documents", "document_number"), false);
});
