import test from "node:test";
import assert from "node:assert/strict";
import { validateModuleRecordInput, validateModuleRecordPatchInput } from "../dist/module-records.js";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

test("validates academic calendar date ranges and required fields", () => {
  assert.equal(validateModuleRecordInput("academic-years", {
    code: "2026-2027", name: "Tahun Ajaran 2026/2027",
    startsOn: "2026-07-01", endsOn: "2027-06-30"
  }), null);
  assert.equal(validateModuleRecordInput("academic-years", {
    code: "2026-2027", name: "Tahun Ajaran 2026/2027",
    startsOn: "2027-07-01", endsOn: "2026-06-30"
  }), "invalid_date_range");
  assert.equal(validateModuleRecordInput("academic-terms", {
    academicYearId: "not-a-uuid", code: "GASAL", name: "Semester Ganjil",
    startsOn: "2026-07-01", endsOn: "2026-12-31"
  }), "invalid_academicYearId");
});

test("validates relationship identifiers and rejects client-supplied unsupported columns", () => {
  assert.equal(validateModuleRecordInput("classes", {
    campusId: uuid, academicYearId: uuid, programId: uuid, code: "VII-A", name: "Kelas VII A"
  }), null);
  assert.equal(validateModuleRecordInput("classes", {
    campusId: "bad", academicYearId: uuid, programId: uuid, code: "VII-A", name: "Kelas VII A"
  }), "invalid_campusId");
  assert.equal(validateModuleRecordInput("classes", {
    organizationId: uuid, campusId: uuid, academicYearId: uuid, programId: uuid, code: "VII-A", name: "Kelas VII A"
  }), "unsupported_field");
});

test("validates contact email and consent state without accepting unrecognized fields", () => {
  assert.equal(validateModuleRecordInput("contacts", {
    contactType: "guardian", displayName: "Wali Santri", email: "wali@example.org", consentStatus: "unknown"
  }), null);
  assert.equal(validateModuleRecordInput("contacts", {
    contactType: "guardian", displayName: "Wali Santri", email: "not-an-email", consentStatus: "unknown"
  }), "invalid_email");
  assert.equal(validateModuleRecordInput("contacts", {
    contactType: "guardian", displayName: "Wali Santri", consentStatus: "granted"
  }), "invalid_consentStatus");
});

test("validates catalog arrays and numeric asset values", () => {
  assert.equal(validateModuleRecordInput("library-catalog", {
    itemCode: "KITAB-001", title: "Fathul Qarib", authors: ["Ibnu Qasim"]
  }), null);
  assert.equal(validateModuleRecordInput("library-catalog", {
    itemCode: "KITAB-001", title: "Fathul Qarib", authors: "Ibnu Qasim"
  }), "invalid_authors");
  assert.equal(validateModuleRecordInput("assets", {
    assetCode: "AST-001", assetName: "Proyektor", category: "Elektronik", acquisitionCost: -1
  }), "invalid_acquisitionCost");
});

test("matches database enums and capacity/value constraints", () => {
  assert.equal(validateModuleRecordInput("subjects", {
    code: "KTB", name: "Kajian", subjectType: "kitab"
  }), "invalid_subjectType");
  assert.equal(validateModuleRecordInput("attendance-records", {
    attendanceSessionId: uuid, studentId: uuid, attendanceStatus: "permitted"
  }), "invalid_attendanceStatus");
  assert.equal(validateModuleRecordInput("classes", {
    campusId: uuid, academicYearId: uuid, programId: uuid, code: "VII-A", name: "Kelas VII A", capacity: 0
  }), "invalid_capacity");
  assert.equal(validateModuleRecordInput("boarding-rooms", {
    dormitoryId: uuid, roomCode: "101", capacity: 101
  }), "invalid_capacity");
  assert.equal(validateModuleRecordInput("donor-pledges", {
    contactId: uuid, pledgeReference: "DON-001", pledgedAmount: 0
  }), "invalid_pledgedAmount");
});

test("public content remains draft until a separate publication workflow exists", () => {
  assert.equal(validateModuleRecordInput("cms-pages", {
    slug: "profil", title: "Profil Pesantren", bodyMarkdown: "Konten profil.", pageStatus: "draft"
  }), null);
  assert.equal(validateModuleRecordInput("cms-pages", {
    slug: "profil", title: "Profil Pesantren", bodyMarkdown: "Konten profil.", pageStatus: "published"
  }), "invalid_pageStatus");
});


test("validates newly exposed class, guardian and HR records against schema rules", () => {
  assert.equal(validateModuleRecordInput("academic-class-subjects", {
    classGroupId: uuid, subjectId: uuid, weeklyPeriods: 4
  }), null);
  assert.equal(validateModuleRecordInput("academic-class-subjects", {
    classGroupId: uuid, subjectId: uuid, weeklyPeriods: 0
  }), "invalid_weeklyPeriods");
  assert.equal(validateModuleRecordInput("guardians", { displayName: "Wali Santri" }), null);
  assert.equal(validateModuleRecordInput("student-guardians", {
    studentId: uuid, guardianId: uuid, relationshipCode: "ibu", isPrimary: true
  }), null);
  assert.equal(validateModuleRecordInput("hr-contracts", {
    employeeId: uuid, contractType: "fixed_term", startsOn: "2026-07-01",
    endsOn: "2026-06-30", baseSalary: 2500000, status: "draft"
  }), "invalid_date_range");
  assert.equal(validateModuleRecordInput("hr-contracts", {
    employeeId: uuid, contractType: "consultant", startsOn: "2026-07-01", baseSalary: 2500000
  }), "invalid_contractType");
});

test("payroll creation is restricted to draft preparation and valid periods", () => {
  assert.equal(validateModuleRecordInput("hr-payroll-periods", {
    periodCode: "2026-11", startsOn: "2026-11-01", endsOn: "2026-11-30",
    payDate: "2026-11-30", status: "open"
  }), null);
  assert.equal(validateModuleRecordInput("hr-payroll-periods", {
    periodCode: "2026-11", startsOn: "2026-11-30", endsOn: "2026-11-01",
    payDate: "2026-11-30"
  }), "invalid_date_range");
  assert.equal(validateModuleRecordInput("hr-payroll-runs", {
    payrollPeriodId: uuid, runNumber: "PAY-2026-11", runType: "regular", status: "draft"
  }), null);
  assert.equal(validateModuleRecordInput("hr-payroll-runs", {
    payrollPeriodId: uuid, runNumber: "PAY-2026-11", status: "approved"
  }), "invalid_status");
});

test("validates procurement detail lines and append-only asset event categories", () => {
  assert.equal(validateModuleRecordInput("purchase-request-lines", {
    requestId: uuid, description: "Kertas A4", quantity: 10, estimatedUnitCost: 65000
  }), null);
  assert.equal(validateModuleRecordInput("purchase-order-lines", {
    purchaseOrderId: uuid, description: "Kertas A4", quantity: 10, unitCost: 65000
  }), null);
  assert.equal(validateModuleRecordInput("purchase-order-lines", {
    purchaseOrderId: uuid, description: "Kertas A4", quantity: 0, unitCost: 65000
  }), "invalid_quantity");
  assert.equal(validateModuleRecordInput("asset-events", {
    assetId: uuid, eventType: "maintenance", eventData: { action: "servis" }
  }), null);
  assert.equal(validateModuleRecordInput("asset-events", {
    assetId: uuid, eventType: "delete"
  }), "invalid_eventType");
});


test("partial updates accept only known fields without requiring the full create form", () => {
  assert.equal(validateModuleRecordPatchInput("employees", { preferredName: "Ust. Ahmad" }), null);
  assert.equal(validateModuleRecordPatchInput("employees", { employmentStatus: "terminated" }), null);
  assert.equal(validateModuleRecordPatchInput("employees", { organizationId: uuid }), "unsupported_field");
  assert.equal(validateModuleRecordPatchInput("employees", { employeeNumber: 42 }), "invalid_employeeNumber");
  assert.equal(validateModuleRecordPatchInput("employees", {}), null);
  assert.equal(validateModuleRecordPatchInput("not-a-module", { name: "x" }), "module_resource_not_found");
});

test("unknown module resources fail closed", () => {
  assert.equal(validateModuleRecordInput("unknown", {}), "module_resource_not_found");
});
