import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("workspace menus are driven by granular read permissions rather than one representative permission", async () => {
  const app = await read("apps/web/src/App.tsx");
  const moduleWorkspace = await read("apps/web/src/ModuleWorkspace.tsx");
  for (const permission of [
    "academic.students.identity.read", "academic.students.health.read",
    "academic.enrollments.read", "academic.attendance.read",
    "boarding.rooms.manage", "boarding.assignments.manage", "boarding.leave.read", "boarding.incidents.read",
    "library.loans.read", "finance.journals.read", "inventory.movements.read",
    "hr.contracts.read", "hr.payroll.read", "hr.educators.read", "hr.organization.read",
    "procurement.suppliers.manage", "procurement.requests.read", "procurement.orders.manage",
    "cms.announcements.manage", "crm.donations.manage",
  ]) assert.ok(app.includes(permission), `navigation must account for ${permission}`);
  assert.match(app, /hasAnyPermission\(tenant\.permissions, MODULE_ACCESS\.boarding\)/);
  assert.match(app, /hasAnyPermission\(tenant\.permissions, MODULE_ACCESS\.library\)/);
  assert.match(app, /hasAnyPermission\(tenant\.permissions, MODULE_ACCESS\.finance\)/);
  assert.match(app, /hasAnyPermission\(tenant\.permissions, MODULE_ACCESS\.inventory\)/);
  assert.match(app, /hasAnyPermission\(tenant\.permissions, MODULE_ACCESS\.hr\)/);
  assert.match(moduleWorkspace, /RESOURCES\.filter\(resource=>permissions\.includes\(resource\.read\)\)/);
  assert.match(moduleWorkspace, /hasReadableModuleGroup/);
});

test("direct workspace navigation is guarded before changing the active screen", async () => {
  const app = await read("apps/web/src/App.tsx");
  assert.match(app, /const openModule = \(resourceKey: string\) => \{/);
  assert.match(app, /hasReadableModuleGroup\(resourceKey, tenant\.permissions\)/);
  assert.match(app, /const openOperations = \(area: OperationsArea\) => \{/);
  assert.match(app, /OPERATIONS_ACCESS\[area\]/);
  assert.match(app, /const openAdmissions = \(\) => \{/);
  assert.match(app, /ADMISSIONS_ACCESS/);
  assert.match(app, /const denied =/);
  assert.match(app, /setScreen\("overview"\)/);
});

test("overview cards and all-modules shortcut only expose readable workspaces", async () => {
  const app = await read("apps/web/src/App.tsx");
  const moduleWorkspace = await read("apps/web/src/ModuleWorkspace.tsx");
  assert.match(app, /modules\.filter\(\(item\) => canSeeModuleCard\(tenant\?\.permissions, item\.key\)\)/);
  assert.match(app, /hidden=\{Boolean\(tenant && !hasReadableModuleResource\(tenant\.permissions\)\)\}/);
  assert.match(app, /hasReadableModuleResource\(tenant\.permissions\) && <button className="text-button"/);
  assert.match(moduleWorkspace, /const available=useMemo\(\(\)=>preview\?RESOURCES:RESOURCES\.filter/);
});

test("read-only roles can navigate to a module while write controls remain separately permission-gated", async () => {
  const moduleWorkspace = await read("apps/web/src/ModuleWorkspace.tsx");
  const operations = await read("apps/web/src/Operations.tsx");
  assert.match(moduleWorkspace, /permissions\.includes\(resource\.read\)/);
  assert.match(moduleWorkspace, /permissions\.includes\(resource\.write\)/);
  assert.match(operations, /const readable = columns\[selected\]\.filter\(\(item\) => permissions\.includes\(item\.read\)\)/);
  assert.match(operations, /forms\[area\]\.filter\(\(item\) => permissions\.includes\(item\.permission\)\)/);
});

test("CSV export controls require the dedicated reports.export permission", async () => {
  const moduleWorkspace = await read("apps/web/src/ModuleWorkspace.tsx");
  assert.match(moduleWorkspace, /!permissions\\.includes\\("reports\\.export"\\)/);
});
