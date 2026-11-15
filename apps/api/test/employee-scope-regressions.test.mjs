import test from "node:test";
import assert from "node:assert/strict";
import { employeeScopePredicate, hasTenantWideOperationalAccess } from "../dist/tenant-access.js";

test("employee scope predicate binds every campus grant to tenant and membership", () => {
  const sql = employeeScopePredicate("e", "$1", "$2", "$3");

  assert.ok(sql.includes("mcs.organization_id = $1::uuid"));
  assert.ok(sql.includes("mcs.membership_id = $2::uuid"));
  assert.ok(sql.includes("mcs.campus_id = e.campus_id"));
  assert.ok(sql.includes("mcs.revoked_at IS NULL"));
  assert.ok(sql.includes("mcs.valid_from <= now()"));
  assert.ok(sql.includes("(mcs.valid_until IS NULL OR mcs.valid_until > now())"));
});

test("employee department scope requires a current employee assignment", () => {
  const sql = employeeScopePredicate("e", "$1", "$2", "$3");

  assert.ok(sql.includes("FROM hr.employee_assignments ea"));
  assert.ok(sql.includes("ea.organization_id = $1::uuid"));
  assert.ok(sql.includes("ea.employee_id = e.id"));
  assert.ok(sql.includes("ea.starts_on <= CURRENT_DATE"));
  assert.ok(sql.includes("(ea.ends_on IS NULL OR ea.ends_on >= CURRENT_DATE)"));
  assert.ok(sql.includes("mds.membership_id = $2::uuid"));
  assert.ok(sql.includes("mds.revoked_at IS NULL"));
  assert.ok(sql.includes("mds.valid_from <= now()"));
  assert.ok(sql.includes("(mds.valid_until IS NULL OR mds.valid_until > now())"));
});

test("only institution owner and institution admin receive tenant-wide operational access", () => {
  assert.equal(hasTenantWideOperationalAccess(["institution_owner"]), true);
  assert.equal(hasTenantWideOperationalAccess(["institution_admin"]), true);
  assert.equal(hasTenantWideOperationalAccess(["platform_super_admin"]), false);
  assert.equal(hasTenantWideOperationalAccess(["hr_manager", "department_head"]), false);
  assert.equal(hasTenantWideOperationalAccess([]), false);
});
