import test from "node:test";
import assert from "node:assert/strict";
import { validateModuleRecordInput } from "../dist/module-records.js";

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

test("public content remains draft until a separate publication workflow exists", () => {
  assert.equal(validateModuleRecordInput("cms-pages", {
    slug: "profil", title: "Profil Pesantren", bodyMarkdown: "Konten profil.", pageStatus: "draft"
  }), null);
  assert.equal(validateModuleRecordInput("cms-pages", {
    slug: "profil", title: "Profil Pesantren", bodyMarkdown: "Konten profil.", pageStatus: "published"
  }), "invalid_pageStatus");
});

test("unknown module resources fail closed", () => {
  assert.equal(validateModuleRecordInput("unknown", {}), "module_resource_not_found");
});
