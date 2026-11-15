import test from "node:test";
import assert from "node:assert/strict";
import { handleHrRequest, validateEmployeeInput, validatePayrollRunInput } from "../dist/hr.js";
import { Readable } from "node:stream";
import { departmentScopePredicate, positionScopePredicate } from "../dist/tenant-access.js";

const employeeId = "123e4567-e89b-42d3-a456-426614174000";
const periodId = "223e4567-e89b-42d3-a456-426614174000";
const validEmployee = { employeeNumber: "PGW-001", legalName: "Ahmad Fulan", joinedOn: "2024-07-01" };

test("validates employee master data", () => {
  assert.equal(validateEmployeeInput(validEmployee), null);
  assert.equal(validateEmployeeInput({ ...validEmployee, employeeNumber: "" }), "invalid_employee_number");
});
test("validates payroll lines and component types", () => {
  const valid = {
    payrollPeriodId: periodId, runNumber: "PAY-2026-11", runType: "regular",
    lines: [
      { employeeId, componentCode: "BASE", componentName: "Gaji pokok", componentType: "earning", amount: 5000000 },
      { employeeId, componentCode: "CUT", componentName: "Potongan", componentType: "deduction", amount: 100000 }
    ]
  };
  assert.equal(validatePayrollRunInput(valid), null);
  assert.equal(validatePayrollRunInput({ ...valid, lines: [{ ...valid.lines[0], amount: 0 }] }), "invalid_component_amount");
  assert.equal(validatePayrollRunInput({ ...valid, lines: [{ ...valid.lines[0], componentType: "other" }] }), "invalid_component_type");
});


const organizationId = "223e4567-e89b-42d3-a456-426614174000";
const membershipId = "423e4567-e89b-42d3-a456-426614174000";
const userId = "323e4567-e89b-42d3-a456-426614174000";

function hrResponse() {
  return { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
}
function hrRequest(method, url, body) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  stream.method = method; stream.url = url; stream.headers = {};
  return stream;
}
function hrTenant(permissions, roles = ["hr_payroll_officer"]) {
  return { membership_id: membershipId, organization_id: organizationId, roles, permissions };
}

test("scoped payroll run list only aggregates employees in the caller's campus or department scope", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant(["hr.payroll.read"])] };
    if (sql.includes("FROM hr.payroll_runs r")) return { rows: [{ id: periodId, earnings: "5000000", deductions: "100000" }] };
    throw new Error("unexpected query: " + sql);
  }};
  const res = hrResponse();
  await handleHrRequest(hrRequest("GET", "/v1/hr/payroll/runs"), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  const query = calls.find(call => call.sql.includes("FROM hr.payroll_runs r"));
  assert.ok(query.sql.includes("JOIN hr.employees e"));
  assert.ok(query.sql.includes("membership_campus_scopes"));
  assert.ok(query.sql.includes("membership_department_scopes"));
  assert.deepEqual(query.values, [organizationId, membershipId, false]);
});

test("scoped payroll preparation inserts lines only when every employee is within scope", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant(["hr.payroll.prepare"])] };
    if (sql.includes("WITH input_lines AS")) return { rows: [{ id: periodId, runNumber: "PAY-2026-11-A", lineCount: 2 }] };
    throw new Error("unexpected query: " + sql);
  }};
  const body = {
    payrollPeriodId: periodId, runNumber: "PAY-2026-11-A", runType: "regular",
    lines: [
      { employeeId, componentCode: "BASE", componentName: "Gaji pokok", componentType: "earning", amount: 5000000 },
      { employeeId, componentCode: "CUT", componentName: "Potongan", componentType: "deduction", amount: 100000 }
    ]
  };
  const res = hrResponse();
  await handleHrRequest(hrRequest("POST", "/v1/hr/payroll/runs", body), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 201);
  const query = calls.find(call => call.sql.includes("WITH input_lines AS"));
  assert.ok(query.sql.includes("authorized_employees"));
  assert.ok(query.sql.includes("COUNT(DISTINCT employee_id)"));
  assert.ok(query.sql.includes("membership_campus_scopes"));
  assert.ok(query.sql.includes("membership_department_scopes"));
  assert.deepEqual(query.values.slice(-2), [membershipId, false]);
});

test("scoped payroll members cannot approve or pay an organization-wide run", async () => {
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant(["hr.payroll.approve", "hr.payroll.pay"])] };
    throw new Error("approval and payment must be rejected before SQL");
  }};
  const approve = hrResponse();
  await handleHrRequest(hrRequest("POST", "/v1/hr/payroll/runs/" + periodId + "/approve"), approve, pool, userId, organizationId);
  assert.equal(approve.statusCode, 403);
  assert.equal(JSON.parse(approve.body).error, "payroll_approval_requires_tenant_authority");
  const pay = hrResponse();
  await handleHrRequest(hrRequest("POST", "/v1/hr/payroll/runs/" + periodId + "/pay"), pay, pool, userId, organizationId);
  assert.equal(pay.statusCode, 403);
  assert.equal(JSON.parse(pay.body).error, "payroll_payment_requires_tenant_authority");
});

test("scoped payroll members can read periods but cannot create organization-wide periods", async () => {
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant(["hr.payroll.read", "hr.payroll.prepare"])] };
    if (sql.includes("FROM hr.payroll_periods WHERE organization_id")) return { rows: [{ id: periodId, periodCode: "2026-11" }] };
    throw new Error("unexpected query: " + sql);
  }};
  const get = hrResponse();
  await handleHrRequest(hrRequest("GET", "/v1/hr/payroll/periods"), get, pool, userId, organizationId);
  assert.equal(get.statusCode, 200);
  const post = hrResponse();
  await handleHrRequest(hrRequest("POST", "/v1/hr/payroll/periods", {
    periodCode: "2026-12", startsOn: "2026-12-01", endsOn: "2026-12-31", payDate: "2027-01-01"
  }), post, pool, userId, organizationId);
  assert.equal(post.statusCode, 403);
  assert.equal(JSON.parse(post.body).error, "payroll_period_management_requires_tenant_authority");
});


test("employee assignment list and detail are filtered through employee scope", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant(["hr.organization.read"])] };
    if (sql.includes("FROM hr.employee_assignments a")) return { rows: [{ id: periodId, employeeName: "Ahmad Fulan" }] };
    throw new Error("unexpected query: " + sql);
  }};
  const list = hrResponse();
  await handleHrRequest(hrRequest("GET", "/v1/hr/employee-assignments"), list, pool, userId, organizationId);
  assert.equal(list.statusCode, 200);
  const listQuery = calls.find(call => call.sql.includes("FROM hr.employee_assignments a"));
  assert.ok(listQuery.sql.includes("membership_campus_scopes"));
  assert.ok(listQuery.sql.includes("membership_department_scopes"));
  assert.ok(listQuery.sql.includes("a.organization_id = $1::uuid"));
  assert.ok(!listQuery.sql.includes("SELECT *"));

  const detail = hrResponse();
  await handleHrRequest(hrRequest("GET", "/v1/hr/employee-assignments/" + periodId), detail, pool, userId, organizationId);
  assert.equal(detail.statusCode, 200);
  const detailQuery = calls.filter(call => call.sql.includes("FROM hr.employee_assignments a"))[1];
  assert.deepEqual(detailQuery.values, [organizationId, membershipId, false, periodId, 1]);
});

test("employment contract metadata does not disclose compensation without payroll-read permission", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant(["hr.contracts.read"])] };
    if (sql.includes("FROM hr.employment_contracts c")) return { rows: [{ id: periodId, employeeName: "Ahmad Fulan" }] };
    throw new Error("unexpected query: " + sql);
  }};
  const res = hrResponse();
  await handleHrRequest(hrRequest("GET", "/v1/hr/employment-contracts"), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  const query = calls.find(call => call.sql.includes("FROM hr.employment_contracts c"));
  assert.ok(query.sql.includes("membership_campus_scopes"));
  assert.ok(query.sql.includes("membership_department_scopes"));
  assert.ok(query.sql.includes("c.organization_id = $1::uuid"));
  assert.ok(!query.sql.includes("base_salary"));
  assert.ok(!JSON.stringify(JSON.parse(res.body)).includes("baseSalary"));
  assert.ok(!query.sql.includes("SELECT *"));
});

test("employment contract compensation is visible only with explicit payroll-read permission", async () => {
  let queryText = "";
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant(["hr.contracts.read", "hr.payroll.read"])] };
    if (sql.includes("FROM hr.employment_contracts c")) { queryText = sql; return { rows: [{ id: periodId, baseSalary: "5000000", currencyCode: "IDR" }] }; }
    throw new Error("unexpected query: " + sql);
  }};
  const res = hrResponse();
  await handleHrRequest(hrRequest("GET", "/v1/hr/employment-contracts"), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  assert.ok(queryText.includes('c.base_salary AS "baseSalary"'));
  assert.equal(JSON.parse(res.body).data[0].baseSalary, "5000000");
});
test("employment contract detail returns nondisclosing 404 for an out-of-scope contract", async () => {
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant(["hr.contracts.read"])] };
    if (sql.includes("FROM hr.employment_contracts c")) return { rows: [] };
    throw new Error("unexpected query: " + sql);
  }};
  const res = hrResponse();
  await handleHrRequest(hrRequest("GET", "/v1/hr/employment-contracts/" + periodId), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 404);
  assert.equal(JSON.parse(res.body).error, "employment_contract_not_found");
});


test("scoped employee creation checks campus grant in the same INSERT statement", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant(["hr.employees.write"])] };
    if (sql.includes("INSERT INTO hr.employees")) return { rows: [] };
    throw new Error("unexpected query: " + sql);
  }};
  const res = hrResponse();
  await handleHrRequest(hrRequest("POST", "/v1/hr/employees", {
    ...validEmployee, campusId: employeeId
  }), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, "campus_outside_member_scope");
  const insert = calls.find(call => call.sql.includes("INSERT INTO hr.employees"));
  assert.ok(insert.sql.includes("SELECT $1::uuid"));
  assert.ok(insert.sql.includes("membership_campus_scopes"));
  assert.ok(insert.sql.includes("mcs.membership_id=$10::uuid"));
  assert.deepEqual(insert.values.slice(-2), [false, membershipId]);
  assert.equal(calls.filter(call => call.sql.includes("membership_campus_scopes")).length, 1);
});

test("tenant owner employee creation uses the same atomic insert without requiring campus scope", async () => {
  let insertValues;
  const pool = { async query(sql, values) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant(["hr.employees.write"], ["institution_owner"])] };
    if (sql.includes("INSERT INTO hr.employees")) {
      insertValues = values;
      return { rows: [{ id: employeeId, employeeNumber: "PGW-001" }] };
    }
    throw new Error("unexpected query: " + sql);
  }};
  const res = hrResponse();
  await handleHrRequest(hrRequest("POST", "/v1/hr/employees", validEmployee), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 201);
  assert.equal(insertValues[8], true);
  assert.equal(insertValues[9], membershipId);
});


test("department and position predicates inherit only active campus or department grants", () => {
  const department = departmentScopePredicate("d", "$1", "$2", "$3");
  for (const token of ["membership_campus_scopes", "membership_department_scopes", "d.campus_id", "d.id", "revoked_at IS NULL", "valid_until IS NULL OR"]) {
    assert.ok(department.includes(token), `department predicate missing ${token}`);
  }
  const position = positionScopePredicate("p", "d", "$1", "$2", "$3");
  for (const token of ["p.department_id", "d.campus_id", "membership_department_scopes", "membership_campus_scopes", "revoked_at IS NULL"]) {
    assert.ok(position.includes(token), `position predicate missing ${token}`);
  }
});

test("scoped HR organization reads filter campuses, departments, positions and educators", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant([
      "hr.organization.read", "hr.educators.read"
    ])] };
    if (sql.includes("FROM core.campuses c")) return { rows: [] };
    if (sql.includes("FROM hr.departments d")) return { rows: [] };
    if (sql.includes("FROM hr.positions p")) return { rows: [] };
    if (sql.includes("FROM academic.instructors i")) return { rows: [] };
    throw new Error("unexpected query: " + sql);
  }};
  for (const path of ["/v1/hr/campuses", "/v1/hr/departments", "/v1/hr/positions", "/v1/hr/educators"]) {
    const res = hrResponse();
    await handleHrRequest(hrRequest("GET", path), res, pool, userId, organizationId);
    assert.equal(res.statusCode, 200, path);
  }
  const campus = calls.find(call => call.sql.includes("FROM core.campuses c"));
  assert.ok(campus.sql.includes("membership_campus_scopes"));
  assert.deepEqual(campus.values, [organizationId, membershipId, false]);
  const department = calls.find(call => call.sql.includes("FROM hr.departments d"));
  assert.ok(department.sql.includes("membership_campus_scopes"));
  assert.ok(department.sql.includes("membership_department_scopes"));
  const position = calls.find(call => call.sql.includes("FROM hr.positions p"));
  assert.ok(position.sql.includes("p.department_id"));
  assert.ok(position.sql.includes("membership_department_scopes"));
  const educator = calls.find(call => call.sql.includes("FROM academic.instructors i"));
  assert.ok(educator.sql.includes("employeeScopePredicate") || educator.sql.includes("membership_campus_scopes"));
});

test("scoped employee assignment reads filter each assignment row, not only the employee", async () => {
  let query = "";
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [hrTenant(["hr.organization.read"])] };
    if (sql.includes("FROM hr.employee_assignments a")) { query = sql; return { rows: [] }; }
    throw new Error("unexpected query: " + sql);
  }};
  const res = hrResponse();
  await handleHrRequest(hrRequest("GET", "/v1/hr/employee-assignments"), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  assert.ok(query.includes("mds.department_id=a.department_id"));
  assert.ok(query.includes("mcs.campus_id=e.campus_id"));
});
