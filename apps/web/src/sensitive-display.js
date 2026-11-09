const SENSITIVE_STUDENT_HEALTH_FIELDS = new Set([
  "bloodGroup",
  "blood_group",
  "allergyData",
  "allergy_data",
  "medicalHistory",
  "medical_history",
  "medicationData",
  "medication_data",
  "emergencyInstructions",
  "emergency_instructions",
]);

/**
 * Returns true for student health fields that must never be rendered in a
 * default list/table view. The detail view may reveal them only after an
 * explicit, permission-gated user action.
 */
export function isSensitiveStudentHealthField(resourceKey, fieldKey) {
  return resourceKey === "student-health-profiles" && SENSITIVE_STUDENT_HEALTH_FIELDS.has(fieldKey);
}
