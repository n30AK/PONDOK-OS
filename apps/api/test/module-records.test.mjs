import test from "node:test";
import assert from "node:assert/strict";
import { canReadStudentOptions, getModuleRecordProjection, handleModuleRecordsRequest, validateModuleRecordInput, validateModuleRecordPatchInput } from "../dist/module-records.js";
import { Readable } from "node:stream";
import { campusScopePredicate, employeeScopePredicate, hasTenantWideOperationalAccess, studentScopePredicate } from "../dist/tenant-access.js";

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


test("validates complete student master, educator profiles and temporal organization assignments", () => {
  assert.equal(validateModuleRecordInput("student-details", {
    campusId: uuid, studentNumber: "SAN-0001", legalName: "Ahmad Fulan",
    birthPlace: "Bandung", birthDate: "2010-01-10", genderCode: "male",
    citizenshipCode: "ID", nationalStudentNumber: "0098765432",
    currentAddress: { city: "Bandung", postalCode: "40111" },
    permanentAddress: { city: "Garut" }, status: "active"
  }), null);
  assert.equal(validateModuleRecordInput("student-details", {
    campusId: uuid, studentNumber: "SAN-0001", legalName: "Ahmad", currentAddress: "Bandung"
  }), "invalid_currentAddress");
  assert.equal(validateModuleRecordInput("instructor-profiles", {
    employeeId: uuid, educatorType: "ustadz", teachingExperienceYears: 12.5, isActive: true
  }), null);
  assert.equal(validateModuleRecordInput("instructor-profiles", {
    employeeId: uuid, educatorType: "headmaster"
  }), "invalid_educatorType");
  assert.equal(validateModuleRecordInput("employee-assignments", {
    employeeId: uuid, departmentId: uuid, positionId: uuid, assignmentType: "acting",
    startsOn: "2026-07-01", isPrimary: false
  }), null);
});

test("legal guardian and pickup authority cannot be set through ordinary relationship CRUD", () => {
  assert.equal(validateModuleRecordInput("student-guardians", {
    studentId: uuid, guardianId: uuid, relationshipCode: "ibu", isPrimary: true,
    isLegalGuardian: true, canPickupStudent: true
  }), "unsupported_field");
  assert.equal(validateModuleRecordInput("student-guardians", {
    studentId: uuid, guardianId: uuid, relationshipCode: "ibu", verificationNote: "Sudah diperiksa"
  }), "unsupported_field");
});


test("validates structured Indonesian student and guardian addresses", () => {
  const validAddress = {
    street: "Jl. Pendidikan No. 1", rt: "001", rw: "002",
    village: "Sukamaju", district: "Cibinong", city: "Bogor",
    province: "Jawa Barat", postalCode: "16911", countryCode: "ID"
  };
  assert.equal(validateModuleRecordInput("student-details", {
    campusId: uuid, studentNumber: "SAN-001", legalName: "Santri Contoh",
    currentAddress: validAddress
  }), null);
  assert.equal(validateModuleRecordInput("student-details", {
    campusId: uuid, studentNumber: "SAN-002", legalName: "Santri Contoh",
    permanentAddress: { ...validAddress, countryCode: "IDN" }
  }), "invalid_permanentAddress");
  assert.equal(validateModuleRecordInput("guardians", {
    displayName: "Wali Contoh", address: { ...validAddress, unverifiedExtra: "do not accept" }
  }), "invalid_address");
  assert.equal(validateModuleRecordInput("guardians", {
    displayName: "Wali Contoh", address: { street: 42 }
  }), "invalid_address");
});

test("validates student and guardian relationship date windows", () => {
  assert.equal(validateModuleRecordInput("student-guardians", {
    studentId: uuid, guardianId: uuid, relationshipCode: "ibu",
    validFrom: "2026-12-01", validUntil: "2026-11-30"
  }), "invalid_date_range");
  assert.equal(validateModuleRecordInput("student-details", {
    campusId: uuid, studentNumber: "SAN-003", legalName: "Santri Contoh",
    birthDate: "2010-01-01", entryDate: "2009-12-31"
  }), "invalid_student_lifecycle_dates");
});


test("student relation options are available to roles that can read the referencing module", () => {
  for (const permission of [
    "academic.students.read",
    "academic.enrollments.read",
    "academic.attendance.read",
    "boarding.rooms.manage",
    "boarding.assignments.manage",
    "boarding.leave.read",
    "boarding.incidents.read",
    "library.loans.read",
    "library.loans.write"
  ]) {
    assert.equal(canReadStudentOptions([permission]), true, `${permission} should allow the minimal student lookup`);
  }
  assert.equal(canReadStudentOptions(["finance.journals.read"]), false);
  assert.equal(canReadStudentOptions([]), false);
});


test("tenant-wide operational access is limited to explicit institution authority roles", () => {
  assert.equal(hasTenantWideOperationalAccess(["institution_owner"]), true);
  assert.equal(hasTenantWideOperationalAccess(["institution_admin"]), true);
  assert.equal(hasTenantWideOperationalAccess(["platform_super_admin"]), false);
  assert.equal(hasTenantWideOperationalAccess(["academic_teacher"]), false);
  assert.equal(hasTenantWideOperationalAccess([]), false);
});

test("student scope predicate fails closed and includes every concrete active scope type", () => {
  const sql = studentScopePredicate("sp", "$1", "$2", "$3");
  for (const expected of [
    "$3::boolean", "membership_campus_scopes", "membership_class_scopes",
    "membership_class_subject_scopes", "membership_room_scopes",
    "membership_dormitory_scopes", "boarding.bed_assignments",
    "revoked_at IS NULL", "valid_from <= now()", "valid_until IS NULL OR"
  ]) assert.ok(sql.includes(expected), `missing ${expected}`);
  assert.ok(sql.includes("sp.campus_id"));
  assert.ok(sql.includes("sp.id"));
  assert.ok(sql.includes("e.organization_id = $1::uuid"));
  assert.ok(sql.includes("mcss.membership_id = $2::uuid"));
});

test("employee scope predicate is tenant-bound to campus or active department assignment", () => {
  const sql = employeeScopePredicate("e", "$1", "$2", "$3");
  for (const expected of [
    "$3::boolean", "membership_campus_scopes", "membership_department_scopes",
    "hr.employee_assignments", "ea.employee_id = e.id",
    "ea.starts_on <= CURRENT_DATE", "ea.ends_on IS NULL OR",
    "revoked_at IS NULL", "valid_from <= now()"
  ]) assert.ok(sql.includes(expected), `missing ${expected}`);
  assert.ok(sql.includes("mds.membership_id = $2::uuid"));
});


test("generic module projections are explicit, resource-specific, and exclude unapproved columns", () => {
  const campuses = getModuleRecordProjection("campuses");
  assert.equal(campuses, "id, organization_id, code, name, campus_type, status, created_at");

  const guardians = getModuleRecordProjection("student-guardians");
  assert.ok(guardians.includes("student_id"));
  assert.ok(guardians.includes("guardian_id"));
  assert.ok(!guardians.includes("is_legal_guardian"));
  assert.ok(!guardians.includes("can_pickup_student"));
  assert.ok(!guardians.includes("verification_note"));
  assert.ok(!guardians.includes("verified_by"));

  const attendance = getModuleRecordProjection("attendance-records");
  assert.ok(attendance.includes("attendance_session_id"));
  assert.ok(attendance.includes("student_id"));
  assert.ok(attendance.includes("recorded_at"));

  const loans = getModuleRecordProjection("library-loans");
  assert.ok(loans.includes("issued_by"));
  assert.ok(loans.includes("created_at"));
  assert.equal(getModuleRecordProjection("unknown-resource"), null);

  for (const projection of [campuses, guardians, attendance, loans]) {
    assert.ok(!projection.includes("*"));
    assert.ok(projection.startsWith("id, organization_id,"));
  }
});


test("campus scope predicate denies null-campus records and checks active membership grants", () => {
  const sql = campusScopePredicate("pr", "$1", "$2", "$3");
  for (const expected of [
    "$3::boolean", "pr.campus_id IS NOT NULL", "membership_campus_scopes",
    "mcs.organization_id = $1::uuid", "mcs.membership_id = $2::uuid",
    "mcs.campus_id = pr.campus_id", "revoked_at IS NULL",
    "valid_from <= now()", "valid_until IS NULL OR"
  ]) assert.ok(sql.includes(expected), `missing ${expected}`);
});


test("scoped procurement reads join the owning campus request in the same SQL query", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["procurement_officer"], permissions: ["procurement.requests.read"]
    }] };
    if (sql.includes("FROM procurement.purchase_requests pr")) return { rows: [{ id: uuid, requestNumber: "PR-001" }] };
    throw new Error("unexpected query: " + sql);
  }};
  const req = Readable.from([]);
  req.method = "GET"; req.url = "/v1/modules/purchase-requests?limit=10"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  assert.equal(await handleModuleRecordsRequest(req, res, pool, userId, organizationId), true);
  assert.equal(res.statusCode, 200);
  const query = calls.find(call => call.sql.includes("FROM procurement.purchase_requests pr"));
  assert.ok(query.sql.includes("membership_campus_scopes"));
  assert.ok(query.sql.includes("pr.campus_id"));
  assert.deepEqual(query.values, [organizationId, membershipId, false, 10]);
});

test("scoped purchase-order reads cannot include unlinked tenant-wide orders", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  let queryText = "";
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["procurement_officer"], permissions: ["procurement.orders.manage"]
    }] };
    if (sql.includes("FROM procurement.purchase_orders po")) { queryText = sql; return { rows: [] }; }
    throw new Error("unexpected query: " + sql);
  }};
  const req = Readable.from([]);
  req.method = "GET"; req.url = "/v1/modules/purchase-orders"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  assert.ok(queryText.includes("po.request_id IS NOT NULL"));
  assert.ok(queryText.includes("JOIN procurement.purchase_requests pr"));
  assert.ok(queryText.includes("membership_campus_scopes"));
});

test("scoped procurement writes remain fail closed until relation checks are atomic", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  let dataQuery = false;
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["procurement_officer"], permissions: ["procurement.orders.manage"]
    }] };
    dataQuery = true;
    throw new Error("write must be rejected before a data query");
  }};
  const req = Readable.from([Buffer.from(JSON.stringify({
    campusId: uuid, requestNumber: "PR-002", purpose: "Perlengkapan kelas"
  }))]);
  req.method = "POST"; req.url = "/v1/modules/purchase-orders"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, "module_write_scope_not_supported_for_member");
  assert.equal(dataQuery, false);
});


test("generic employment-contract projections redact compensation without payroll-read", () => {
  const ordinary = getModuleRecordProjection("hr-contracts");
  const payroll = getModuleRecordProjection("hr-contracts", ["hr.payroll.read"]);
  assert.ok(!ordinary.includes("base_salary"));
  assert.ok(!ordinary.includes("currency_code"));
  assert.ok(payroll.includes("base_salary"));
  assert.ok(payroll.includes("currency_code"));
});

test("generic employment-contract GET does not select or return salary without payroll-read", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  let queryText = "";
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: "423e4567-e89b-42d3-a456-426614174000",
      organization_id: organizationId, roles: ["institution_owner"], permissions: ["hr.contracts.read"]
    }] };
    queryText = sql;
    return { rows: [{ id: uuid, employee_id: uuid, contract_type: "permanent" }] };
  }};
  const req = Readable.from([]);
  req.method = "GET"; req.url = "/v1/modules/hr-contracts"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  assert.ok(!queryText.includes("base_salary"));
  assert.ok(!queryText.includes("currency_code"));
  assert.ok(!JSON.parse(res.body).data[0].base_salary);
});

test("generic employment-contract compensation writes require payroll preparation permission", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  let dataQuery = false;
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: "423e4567-e89b-42d3-a456-426614174000",
      organization_id: organizationId, roles: ["institution_owner"], permissions: ["hr.contracts.write"]
    }] };
    dataQuery = true;
    throw new Error("compensation write must be rejected before data SQL");
  }};
  const req = Readable.from([Buffer.from(JSON.stringify({
    employeeId: uuid, contractType: "permanent", startsOn: "2026-01-01",
    baseSalary: 5000000, currencyCode: "IDR", status: "draft"
  }))]);
  req.method = "POST"; req.url = "/v1/modules/hr-contracts"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, "compensation_permission_required");
  assert.equal(dataQuery, false);
});


test("scoped library catalog is readable while physical copies are campus-scoped", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["librarian"], permissions: ["library.catalog.read", "library.loans.read"]
    }] };
    if (sql.includes("FROM library.catalog_items li")) return { rows: [{ id: uuid, title: "Fiqih Dasar" }] };
    if (sql.includes("FROM library.copies cp")) return { rows: [{ id: uuid, barcode: "LIB-001" }] };
    throw new Error("unexpected query: " + sql);
  }};
  for (const path of ["/v1/modules/library-catalog", "/v1/modules/library-copies"]) {
    const req = Readable.from([]);
    req.method = "GET"; req.url = path; req.headers = {};
    const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
    await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
    assert.equal(res.statusCode, 200);
  }
  const catalog = calls.find(call => call.sql.includes("FROM library.catalog_items li"));
  assert.ok(!catalog.sql.includes("membership_campus_scopes"));
  const copies = calls.find(call => call.sql.includes("FROM library.copies cp"));
  assert.ok(copies.sql.includes("membership_campus_scopes"));
  assert.ok(copies.sql.includes("cp.campus_id"));
  assert.deepEqual(copies.values, [organizationId, membershipId, false, 100]);
});

test("scoped library loans require both campus and borrower student scope in the same query", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  let queryText = "";
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["librarian"], permissions: ["library.loans.read"]
    }] };
    if (sql.includes("FROM library.loans l")) { queryText = sql; return { rows: [] }; }
    throw new Error("unexpected query: " + sql);
  }};
  const req = Readable.from([]);
  req.method = "GET"; req.url = "/v1/modules/library-loans"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  assert.ok(queryText.includes("JOIN library.copies cp"));
  assert.ok(queryText.includes("JOIN academic.student_profiles sp"));
  assert.ok(queryText.includes("l.borrower_type='student'"));
  assert.ok(queryText.includes("cp.campus_id"));
  assert.ok(queryText.includes("sp.id"));
  assert.ok(queryText.includes("membership_campus_scopes"));
  assert.ok(queryText.includes("membership_class_scopes"));
});

test("scoped library loan writes remain fail closed", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  let dataQuery = false;
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["librarian"], permissions: ["library.loans.write"]
    }] };
    dataQuery = true;
    throw new Error("scoped library write must be rejected");
  }};
  const req = Readable.from([Buffer.from(JSON.stringify({ copyId: uuid, borrowerType: "student", borrowerId: uuid, dueAt: "2026-12-01T00:00:00Z" }))]);
  req.method = "POST"; req.url = "/v1/modules/library-loans"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, "module_write_scope_not_supported_for_member");
  assert.equal(dataQuery, false);
});


test("scoped procurement officer creates a request only for an actively assigned campus", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  let insertSql = "";
  let insertValues = [];
  const pool = { async query(sql, values) {
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["procurement_officer"], permissions: ["procurement.requests.write"]
    }] };
    if (sql.includes("INSERT INTO procurement.purchase_requests")) {
      insertSql = sql; insertValues = values;
      return { rows: [{ id: uuid, requestNumber: "PR-001" }] };
    }
    return { rows: [] };
  }};
  const req = Readable.from([Buffer.from(JSON.stringify({
    campusId: uuid, requestNumber: "PR-001", requestDate: "2026-11-15",
    requiredBy: "2026-11-30", purpose: "Perlengkapan kelas"
  }))]);
  req.method = "POST"; req.url = "/v1/modules/purchase-requests"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 201);
  assert.ok(insertSql.includes("INSERT INTO procurement.purchase_requests"));
  assert.ok(insertSql.includes("membership_campus_scopes"));
  assert.ok(insertSql.includes("mcs.campus_id=$2::uuid"));
  assert.deepEqual(insertValues.slice(-1), [membershipId]);
});

test("scoped procurement officer adds a line only to a draft request in their campus", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  let insertSql = "";
  let insertValues = [];
  const pool = { async query(sql, values) {
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["procurement_officer"], permissions: ["procurement.requests.write"]
    }] };
    if (sql.includes("INSERT INTO procurement.purchase_request_lines")) {
      insertSql = sql; insertValues = values;
      return { rows: [{ id: uuid, requestId: uuid, description: "Kertas A4" }] };
    }
    return { rows: [] };
  }};
  const req = Readable.from([Buffer.from(JSON.stringify({
    requestId: uuid, description: "Kertas A4", quantity: 10, estimatedUnitCost: 65000
  }))]);
  req.method = "POST"; req.url = "/v1/modules/purchase-request-lines"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 201);
  assert.ok(insertSql.includes("FROM procurement.purchase_requests pr"));
  assert.ok(insertSql.includes("pr.request_status='draft'"));
  assert.ok(insertSql.includes("membership_campus_scopes"));
  assert.match(insertSql, /mcs\.campus_id\s*=\s*pr\.campus_id/);
  assert.deepEqual(insertValues.slice(-1), [membershipId]);
});

test("out-of-scope purchase request creation is rejected before audit or partial insert", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  const calls = [];
  const pool = { async query(sql) {
    calls.push(sql);
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["procurement_officer"], permissions: ["procurement.requests.write"]
    }] };
    if (sql.includes("INSERT INTO procurement.purchase_requests")) return { rows: [] };
    return { rows: [] };
  }};
  const req = Readable.from([Buffer.from(JSON.stringify({
    campusId: uuid, requestNumber: "PR-002", requestDate: "2026-11-15",
    purpose: "Perlengkapan kelas"
  }))]);
  req.method = "POST"; req.url = "/v1/modules/purchase-requests"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, "campus_scope_required_or_request_not_draft");
  assert.equal(calls.some(sql => sql.includes("INSERT INTO audit.audit_events")), false);
});


test("scoped purchase-request creation binds the campus grant into the INSERT statement", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["procurement_officer"], permissions: ["procurement.requests.write"]
    }] };
    if (sql.includes("INSERT INTO procurement.purchase_requests")) return { rows: [{
      id: uuid, campus_id: uuid, request_number: "PR-2026-001"
    }] };
    if (sql.includes("INSERT INTO audit.audit_events")) return { rows: [{ id: uuid }] };
    return { rows: [] };
  }};
  const req = Readable.from([Buffer.from(JSON.stringify({
    campusId: uuid, requestNumber: "PR-2026-001", requestDate: "2026-11-15",
    purpose: "Perlengkapan ruang kelas"
  }))]);
  req.method = "POST"; req.url = "/v1/modules/purchase-requests"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 201);
  const insert = calls.find(call => call.sql.includes("INSERT INTO procurement.purchase_requests"));
  assert.ok(insert.sql.includes("membership_campus_scopes"));
  assert.ok(insert.sql.includes("mcs.membership_id=$8::uuid"));
  assert.deepEqual(insert.values.slice(-1), [membershipId]);
});

test("scoped purchase-request creation rejects revoked or absent campus grants atomically", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["procurement_officer"], permissions: ["procurement.requests.write"]
    }] };
    if (sql.includes("INSERT INTO procurement.purchase_requests")) return { rows: [] };
    return { rows: [] };
  }};
  const req = Readable.from([Buffer.from(JSON.stringify({
    campusId: uuid, requestNumber: "PR-2026-002", requestDate: "2026-11-15",
    purpose: "Perlengkapan ruang kelas"
  }))]);
  req.method = "POST"; req.url = "/v1/modules/purchase-requests"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, "campus_scope_required_or_request_not_draft");
  const insert = calls.find(call => call.sql.includes("INSERT INTO procurement.purchase_requests"));
  assert.ok(insert.sql.includes("mcs.revoked_at IS NULL"));
  assert.ok(insert.sql.includes("mcs.valid_until IS NULL OR"));
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO audit.audit_events")), false);
});

test("scoped purchase-request-line creation checks parent draft status and campus grant atomically", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["procurement_officer"], permissions: ["procurement.requests.write"]
    }] };
    if (sql.includes("INSERT INTO procurement.purchase_request_lines")) return { rows: [{
      id: uuid, request_id: uuid, description: "Kertas A4", quantity: "10", estimated_unit_cost: "65000"
    }] };
    if (sql.includes("INSERT INTO audit.audit_events")) return { rows: [{ id: uuid }] };
    return { rows: [] };
  }};
  const req = Readable.from([Buffer.from(JSON.stringify({
    requestId: uuid, description: "Kertas A4", quantity: 10, estimatedUnitCost: 65000
  }))]);
  req.method = "POST"; req.url = "/v1/modules/purchase-request-lines"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 201);
  const insert = calls.find(call => call.sql.includes("INSERT INTO procurement.purchase_request_lines"));
  assert.ok(insert.sql.includes("pr.request_status='draft'"));
  assert.ok(insert.sql.includes("membership_campus_scopes"));
  assert.ok(insert.sql.includes("mcs.membership_id = $6::uuid"));
  assert.deepEqual(insert.values.slice(-1), [membershipId]);
});

test("scoped purchase-request-line creation rejects out-of-scope parent before audit", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships om")) return { rows: [{
      membership_id: membershipId, organization_id: organizationId,
      roles: ["procurement_officer"], permissions: ["procurement.requests.write"]
    }] };
    if (sql.includes("INSERT INTO procurement.purchase_request_lines")) return { rows: [] };
    return { rows: [] };
  }};
  const req = Readable.from([Buffer.from(JSON.stringify({
    requestId: uuid, description: "Kertas A4", quantity: 10, estimatedUnitCost: 65000
  }))]);
  req.method = "POST"; req.url = "/v1/modules/purchase-request-lines"; req.headers = {};
  const res = { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
  await handleModuleRecordsRequest(req, res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, "campus_scope_required_or_request_not_draft");
  const insert = calls.find(call => call.sql.includes("INSERT INTO procurement.purchase_request_lines"));
  assert.ok(insert.sql.includes("pr.request_status='draft'"));
  assert.ok(insert.sql.includes("mcs.valid_from <= now()"));
  assert.equal(calls.some(call => call.sql.includes("INSERT INTO audit.audit_events")), false);
});
