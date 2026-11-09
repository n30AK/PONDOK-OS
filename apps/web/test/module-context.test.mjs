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
