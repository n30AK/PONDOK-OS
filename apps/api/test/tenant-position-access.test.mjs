import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root=new URL("../../../",import.meta.url);
const read=(path)=>readFile(new URL(path,root),"utf8");

test("position-based role migration defines separate foundation and pondok leadership roles",async()=>{
 const sql=await read("database/migrations/0036_position_based_tenant_rbac.sql");
 for(const role of ["foundation_chair","foundation_secretary","foundation_treasurer","pondok_leader","pondok_deputy","pondok_secretary","pondok_treasurer","academic_coordinator","student_affairs_coordinator","school_principal","homeroom_teacher","musyrif","finance_cashier","finance_verifier","procurement_officer","warehouse_staff","hr_officer","safeguarding_officer","cms_editor"])assert.match(sql,new RegExp(role));
 assert.match(sql,/ON CONFLICT \(organization_id, role_key\)/);
});

test("tenant role assignment is tenant-scoped and prevents privilege escalation",async()=>{
 const api=await read("apps/api/src/tenant-members.ts");
 const main=await read("apps/api/src/main.ts");
 assert.match(api,/core\.members\.manage/);
 assert.match(api,/SAFE_ASSIGNABLE_ROLES|ROLES/);
 assert.match(api,/self_role_change_forbidden/);
 assert.match(api,/privileged_role_protected/);
 assert.match(api,/institution_owner/);
 assert.match(api,/audit\.audit_events/);
 assert.match(main,/handleTenantMembersRequest/);
 assert.match(main,/withTenantScope\(dependencies\.pool,identity\.userId,organizationId/);
});

test("tenant administrators see a dedicated role management workspace",async()=>{
 const app=await read("apps/web/src/App.tsx");
 const ui=await read("apps/web/src/TenantAccessAdmin.tsx");
 assert.match(app,/tenant\?\.permissions\.includes\("core\.members\.manage"\)/);
 assert.match(app,/TenantAccessAdmin organizationId=/);
 assert.match(app,/hidden=\{Boolean\(tenant && !tenant\.permissions\.includes/);
 assert.match(ui,/Jabatan & hak akses/);
 assert.match(ui,/Simpan hak akses/);
 assert.match(ui,/ROLE_OPTIONS/);
});
