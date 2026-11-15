import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../../", import.meta.url);

test("student master workspace contains only student and guardian resources", async () => {
  const source = await readFile(new URL("apps/web/src/ModuleWorkspace.tsx", root), "utf8");
  const resources = [...source.matchAll(/\{key:"([^"]+)",label:"([^"]+)",group:"([^"]+)"/g)]
    .map((match) => ({ key: match[1], label: match[2], group: match[3] }));
  const studentKeys = resources.filter((item) => item.group === "Master Data Santri").map((item) => item.key).sort();
  assert.deepEqual(studentKeys, [
    "guardians",
    "student-details",
    "student-guardians",
    "student-health-profiles",
    "student-identity-documents",
  ]);
  for (const key of ["instructor-profiles", "employee-assignments", "hr-departments", "hr-positions", "employees", "hr-contracts", "hr-payroll-periods", "hr-payroll-runs", "campuses"]) {
    assert.notEqual(resources.find((item) => item.key === key)?.group, "Master Data Santri", `${key} must not appear under student master data`);
  }
});

test("educator organization and HR/payroll resources remain separate", async () => {
  const source = await readFile(new URL("apps/web/src/ModuleWorkspace.tsx", root), "utf8");
  const resources = [...source.matchAll(/\{key:"([^"]+)",label:"([^"]+)",group:"([^"]+)"/g)]
    .map((match) => ({ key: match[1], group: match[3] }));
  const groupOf = (key) => resources.find((item) => item.key === key)?.group;
  for (const key of ["instructor-profiles", "employee-assignments", "hr-departments", "hr-positions"]) {
    assert.equal(groupOf(key), "Pengajar & Struktur Organisasi", key);
  }
  for (const key of ["employees", "hr-contracts", "hr-payroll-periods", "hr-payroll-runs"]) {
    assert.equal(groupOf(key), "SDM & Payroll", key);
  }
  assert.equal(groupOf("campuses"), "Tata Kelola Institusi");
});


test("HR organization workspaces use scope-aware read endpoints and lookups", async () => {
  const source = await readFile(new URL("apps/web/src/ModuleWorkspace.tsx", root), "utf8");
  for (const path of [
    'employees:"/v1/hr/employees?limit=100"',
    '"employee-assignments":"/v1/hr/employee-assignments"',
    '"hr-departments":"/v1/hr/departments"',
    '"hr-positions":"/v1/hr/positions"',
    '"hr-contracts":"/v1/hr/employment-contracts"',
    '"instructor-profiles":"/v1/hr/educators"',
    'campuses:"/v1/hr/campuses"'
  ]) assert.ok(source.includes(path), `missing scoped HR path ${path}`);
  assert.match(source, /endpoint\.startsWith\("\/v1\/"\)/);
});


test("scoped HR API rows are normalized to the workspace's snake-case columns", async () => {
  const source = await readFile(new URL("apps/web/src/ModuleWorkspace.tsx", root), "utf8");
  assert.match(source, /function normalizeApiRow\(row:Row\):Row/);
  assert.match(source, /setRows\(\(result\.data\?\?\[\]\)\.map\(normalizeApiRow\)\)/);
  assert.match(source, /map\(normalizeApiRow\)\.map\(row=>\(\{id:String\(row\.id\)/);
});


test("operational workspace campus options use module-specific scoped APIs", async () => {
  const source = await readFile(new URL("apps/web/src/Operations.tsx", root), "utf8");
  assert.ok(source.includes('area === "hr" ? "/v1/hr/campuses"'));
  assert.ok(source.includes('area === "inventory" ? "/v1/inventory/campuses"'));
  assert.ok(!source.includes('request("/v1/modules/campuses")'));
});
