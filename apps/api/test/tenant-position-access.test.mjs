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

test("tenant custom role migration is tenant-scoped and protects administrative permissions",async()=>{
 const sql=await read("database/migrations/0038_tenant_custom_role_permission_center.sql");
 assert.match(sql,/core\.roles\.manage/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION core\.save_tenant_role/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION core\.delete_tenant_role/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION core\.list_tenant_members/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION core\.set_tenant_member_roles/);
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/r\.organization_id=v_org AND r\.is_system=false/);
 assert.match(sql,/permission_not_assignable_to_custom_role/);
 assert.match(sql,/institution_owner','institution_admin/);
 assert.match(sql,/GRANT SELECT ON core\.permissions TO pondok_runtime/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION core\.set_tenant_member_roles/);
});

test("tenant role APIs enforce permissions and delegate sensitive writes to database functions",async()=>{
 const api=await read("apps/api/src/tenant-members.ts");
 const main=await read("apps/api/src/main.ts");
 assert.match(api,/core\.roles\.manage/);
 assert.match(api,/core\.members\.manage/);
 assert.match(api,/core\.save_tenant_role/);
 assert.match(api,/core\.delete_tenant_role/);
 assert.match(api,/core\.list_tenant_members/);
 assert.match(api,/core\.set_tenant_member_roles/);
 assert.match(api,/self_role_change_forbidden/);
 assert.match(api,/privileged_role_protected/);
 assert.match(main,/pathname\.startsWith\("\/v1\/tenant\/roles"\)/);
 assert.match(main,/withTenantScope\(dependencies\.pool,identity\.userId,organizationId/);
 assert.doesNotMatch(api,/DELETE FROM core\.membership_roles/);
 assert.doesNotMatch(api,/INSERT INTO core\.membership_roles/);
});

test("tenant administrators have a permission-matrix workspace with custom roles",async()=>{
 const app=await read("apps/web/src/App.tsx");
 const ui=await read("apps/web/src/TenantAccessAdmin.tsx");
 assert.match(app,/const canManageTenantAccess = \(tenant: Tenant \| null\)/);
 assert.match(app,/canManageTenantAccess\(tenant\) && <button[^]*Jabatan, Peran & Hak Akses/);
 assert.match(app,/screen === "access" && !canManageTenantAccess\(tenant\)/);
 assert.match(app,/TenantAccessAdmin organizationId=\{tenant\.organizationId\} permissions=\{tenant\.permissions\}/);
 assert.match(ui,/Jabatan, peran & hak akses/);
 assert.match(ui,/Buat peran khusus/);
 assert.match(ui,/Simpan matriks izin/);
 assert.match(ui,/permissionKeys/);
 assert.match(ui,/core\.members\.manage/);
 assert.match(ui,/core\.roles\.manage/);
 assert.match(ui,/selectedRole\.is_system/);
 for(const role of ["academic_admin","finance_admin","hr_admin","read_only_auditor","foundation_chair","pondok_leader","finance_cashier","finance_verifier","librarian","admission_officer","boarding_supervisor","inventory_manager"])assert.ok(ui.includes(`"${role}"`),`assignment UI must include ${role}`);
});

test("tenant administrators can add only verified accounts and assign tenant custom roles",async()=>{
 const migration=await read("database/migrations/0038_tenant_custom_role_permission_center.sql");
 const api=await read("apps/api/src/tenant-members.ts");
 const ui=await read("apps/web/src/TenantAccessAdmin.tsx");
 assert.match(migration,/SECURITY DEFINER/);
 assert.match(migration,/emailVerified/);
 assert.match(migration,/member_management_permission_required/);
 assert.match(migration,/organization_id=v_org AND r\.is_system=false/);
 assert.match(api,/add_tenant_member_by_email/);
 assert.match(api,/validRoleKeys/);
 assert.match(ui,/Tambah anggota lembaga/);
 assert.match(ui,/newEmail/);
});


test("institution owner and institution admin always receive tenant access-management permissions",async()=>{
 const access=await read("apps/api/src/tenant-access.ts");
 const app=await read("apps/web/src/App.tsx");
 assert.match(access,/role === "institution_owner" \|\| role === "institution_admin"/);
 assert.match(access,/permissions\.add\("core\.roles\.manage"\)/);
 assert.match(access,/permissions\.add\("core\.members\.manage"\)/);
 assert.match(app,/const canManageTenantAccess = \(tenant: Tenant \| null\)/);
 assert.match(app,/screen === "access" && !canManageTenantAccess\(tenant\)/);
 assert.match(app,/canManageTenantAccess\(tenant\) && <button[^]*Jabatan, Peran & Hak Akses/);
});


test("tenant member scope APIs are tenant-permission gated, immutable and append-only audited",async()=>{
 const api=await read("apps/api/src/tenant-members.ts");
 const migration=await read("database/migrations/0040_tenant_membership_scopes.sql");
 const main=await read("apps/api/src/main.ts");
 const ui=await read("apps/web/src/TenantAccessAdmin.tsx");
 assert.match(api,/memberScopeMatch/);
 assert.match(api,/memberScopeRevokeMatch/);
 assert.match(api,/canManageMembers\(ctx\.permissions\)/);
 assert.match(api,/self_scope_change_forbidden/);
 assert.match(api,/INSERT INTO audit\.audit_events/);
 assert.match(api,/tenant\.member_scope\.assigned/);
 assert.match(api,/tenant\.member_scope\.revoked/);
 assert.match(api,/UPDATE \${config\.table}/);
 assert.match(api,/revoked_at=now\(\), revoked_by=/);
 assert.doesNotMatch(api,/DELETE FROM \${config\.table}/);
 assert.match(migration,/SECURITY DEFINER/);
 assert.match(migration,/SET search_path = pg_catalog, core/);
 assert.match(migration,/REVOKE ALL ON FUNCTION core\.guard_membership_scope_assignment\(\) FROM PUBLIC/);
 assert.match(migration,/GRANT UPDATE \(revoked_at,revoked_by\)/);
 assert.match(migration,/membership_scope_only_one_way_revocation_allowed/);
 assert.match(main,/pathname\.startsWith\("\/v1\/tenant\/members"\)/);
 assert.match(main,/const tenantAccessRoute = pathname\.startsWith\("\/v1\/tenant\/members"\) \|\| pathname\.startsWith\("\/v1\/tenant\/roles"\) \|\| pathname === "\/v1\/tenant\/scope-targets"/);
 assert.match(main,/tenantAccessRoute\s*\? \["GET", "HEAD", "POST", "PATCH", "DELETE"\]/);
 assert.match(main,/pathname === "\/v1\/tenant\/scope-targets"/);
 assert.match(api,/url\.pathname === "\/v1\/tenant\/scope-targets"/);
 assert.match(api,/FROM core\.campuses[\s\S]*status='active'/);
 assert.match(api,/FROM hr\.departments[\s\S]*is_active=true/);
 assert.match(api,/FROM academic\.class_groups[\s\S]*status='active'/);
 assert.match(api,/JOIN academic\.subjects[\s\S]*s\.status='active'/);
 assert.match(api,/FROM boarding\.dormitories[\s\S]*is_active=true/);
 assert.match(api,/r\.is_active=true AND d\.is_active=true/);
 assert.match(api,/activeScopeTargetQueries/);
 assert.match(api,/scope_target_not_active_or_not_found/);
 assert.match(ui,/Atur cakupan akses/);
 assert.match(ui,/scope-targets/);
 assert.match(ui,/Tambahkan cakupan/);
 assert.match(ui,/revoke/);
});
