import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { loadTenantContext } from "./tenant-access.js";

const RESERVED_ROLE_KEYS = new Set(["institution_owner", "institution_admin"]);
const FORBIDDEN_CUSTOM_PERMISSIONS = new Set([
  "core.roles.manage", "core.members.manage", "core.organization.manage",
  "core.campus.manage", "settings.manage", "sync.devices.manage", "sync.conflicts.resolve",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Json = Record<string, unknown>;

function reply(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}

async function body(req: IncomingMessage): Promise<Json | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > 16384) return null;
    chunks.push(value);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Json : null;
  } catch {
    return null;
  }
}

function canManageMembers(permissions: readonly string[]) {
  return permissions.includes("core.members.manage");
}
function canManageRoles(permissions: readonly string[]) {
  return permissions.includes("core.roles.manage");
}
function validRoleKeys(value: unknown, allowEmpty = false): value is string[] {
  return Array.isArray(value)
    && (allowEmpty || value.length > 0)
    && value.length <= 12
    && value.every((key) => typeof key === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(key))
    && new Set(value).size === value.length
    && !value.some((key) => RESERVED_ROLE_KEYS.has(key));
}
function sqlError(res: ServerResponse, reason: unknown, fallback: string) {
  const error = typeof reason === "object" && reason !== null ? reason as { code?: unknown; message?: unknown } : {};
  const message = String(error.message ?? "");
  if (message.includes("role_management_permission_required") || message.includes("member_management_permission_required")) {
    reply(res, 403, { error: "permission_denied" });
  } else if (message.includes("custom_role_in_use")) {
    reply(res, 409, { error: "custom_role_in_use", message: "Peran masih digunakan anggota. Lepaskan peran dari seluruh anggota sebelum menghapusnya." });
  } else if (message.includes("custom_role_not_found")) {
    reply(res, 404, { error: "custom_role_not_found" });
  } else if (message.includes("invalid_") || message.includes("permission_not_assignable")) {
    reply(res, 422, { error: message.includes("permission_not_assignable") ? "permission_not_assignable" : "invalid_role_definition" });
  } else if (String(error.code ?? "") === "23505") {
    reply(res, 409, { error: "role_key_conflict" });
  } else {
    reply(res, 503, { error: fallback });
  }
}

export async function handleTenantMembersRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pool: Pick<Pool, "query">,
  actor: string,
  org: string,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://pondok.local");
  const ctx = await loadTenantContext(pool as Pool, actor, org);
  if (!ctx) {
    reply(res, 403, { error: "active_membership_required" });
    return true;
  }

  if (url.pathname === "/v1/tenant/roles" && req.method === "GET") {
    if (!canManageRoles(ctx.permissions)) {
      reply(res, 403, { error: "permission_denied" });
      return true;
    }
    const [roles, permissions] = await Promise.all([
      pool.query(
        `SELECT r.id,r.role_key,r.role_name,r.is_system,r.organization_id,
                COALESCE(array_agg(rp.permission_key ORDER BY rp.permission_key)
                  FILTER(WHERE rp.permission_key IS NOT NULL),ARRAY[]::text[]) AS permission_keys,
                count(DISTINCT mr.membership_id)::int AS assigned_members
           FROM core.roles r
           LEFT JOIN core.role_permissions rp ON rp.role_id=r.id
           LEFT JOIN core.membership_roles mr ON mr.role_id=r.id
          WHERE r.organization_id IS NULL OR r.organization_id=$1::uuid
          GROUP BY r.id
          ORDER BY r.is_system DESC,r.role_name ASC`,
        [org],
      ),
      pool.query("SELECT permission_key,description FROM core.permissions ORDER BY permission_key"),
    ]);
    reply(res, 200, {
      data: {
        roles: roles.rows,
        permissions: permissions.rows.map((item: { permission_key: string; description: string }) => ({
          ...item,
          assignable: !FORBIDDEN_CUSTOM_PERMISSIONS.has(item.permission_key),
        })),
      },
    });
    return true;
  }

  if (url.pathname === "/v1/tenant/roles" && req.method === "POST") {
    if (!canManageRoles(ctx.permissions)) {
      reply(res, 403, { error: "permission_denied" });
      return true;
    }
    const input = await body(req);
    const roleName = typeof input?.roleName === "string" ? input.roleName.trim() : "";
    const roleId = input?.roleId === undefined || input.roleId === null || input.roleId === "" ? null : input.roleId;
    const permissionKeys = input?.permissionKeys;
    if (roleName.length < 2 || roleName.length > 100
      || (roleId !== null && (typeof roleId !== "string" || !UUID.test(roleId)))
      || !Array.isArray(permissionKeys) || permissionKeys.length > 100
      || permissionKeys.some((key) => typeof key !== "string" || key.length > 120)
      || new Set(permissionKeys).size !== permissionKeys.length) {
      reply(res, 422, { error: "invalid_role_definition" });
      return true;
    }
    const slug = roleName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 36) || "peran";
    const roleKey = roleId === null ? `custom_${slug}_${randomUUID().slice(0, 8)}` : "";
    try {
      const result = await pool.query<{ role_id: string }>(
        "SELECT core.save_tenant_role($1::uuid,$2::text,$3::text,$4::text[]) AS role_id",
        [roleId, roleKey, roleName, permissionKeys],
      );
      reply(res, roleId === null ? 201 : 200, { data: { roleId: result.rows[0]?.role_id, roleKey } });
    } catch (reason) {
      sqlError(res, reason, "tenant_role_save_failed");
    }
    return true;
  }

  const deleteRole = url.pathname.match(/^\/v1\/tenant\/roles\/([0-9a-f-]{36})$/i);
  if (deleteRole && req.method === "DELETE") {
    if (!canManageRoles(ctx.permissions)) {
      reply(res, 403, { error: "permission_denied" });
      return true;
    }
    try {
      await pool.query("SELECT core.delete_tenant_role($1::uuid)", [deleteRole[1]]);
      reply(res, 200, { data: { deleted: true } });
    } catch (reason) {
      sqlError(res, reason, "tenant_role_delete_failed");
    }
    return true;
  }

  if (url.pathname === "/v1/tenant/members" && req.method === "POST") {
    if (!canManageMembers(ctx.permissions)) {
      reply(res, 403, { error: "permission_denied" });
      return true;
    }
    const input = await body(req);
    const email = typeof input?.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validRoleKeys(input?.roleKeys)) {
      reply(res, 422, { error: "invalid_member_invitation" });
      return true;
    }
    try {
      const result = await pool.query<{ outcome: string; membership_id: string | null; user_id: string | null }>(
        "SELECT * FROM core.add_tenant_member_by_email($1,$2::text[])",
        [email, input.roleKeys],
      );
      const row = result.rows[0];
      if (!row) { reply(res, 500, { error: "member_addition_failed" }); return true; }
      if (row.outcome === "account_not_found_or_unverified") {
        reply(res, 404, { error: "verified_account_not_found", message: "Akun belum terdaftar, email belum diverifikasi, atau akun sedang diblokir. Minta calon anggota mendaftar dan memverifikasi email terlebih dahulu." });
        return true;
      }
      if (row.outcome === "already_member") {
        reply(res, 409, { error: "already_member", message: "Akun tersebut sudah menjadi anggota lembaga." });
        return true;
      }
      reply(res, 201, { data: { membershipId: row.membership_id, userId: row.user_id }, message: "Akun terverifikasi berhasil ditambahkan ke lembaga." });
    } catch (reason) {
      sqlError(res, reason, "tenant_member_addition_failed");
    }
    return true;
  }

  if (url.pathname === "/v1/tenant/members" && req.method === "GET") {
    if (!canManageMembers(ctx.permissions)) {
      reply(res, 403, { error: "permission_denied" });
      return true;
    }
    const result = await pool.query(
      `SELECT om.id AS membership_id,om.user_id,om.membership_status,
              COALESCE(array_agg(DISTINCT r.role_key) FILTER(WHERE r.id IS NOT NULL),ARRAY[]::text[]) AS roles,
              COALESCE(array_agg(DISTINCT r.role_name) FILTER(WHERE r.id IS NOT NULL),ARRAY[]::text[]) AS role_names
         FROM core.organization_memberships om
         LEFT JOIN core.membership_roles mr ON mr.membership_id=om.id
         LEFT JOIN core.roles r ON r.id=mr.role_id
        WHERE om.organization_id=$1::uuid
        GROUP BY om.id ORDER BY om.created_at ASC LIMIT 500`,
      [org],
    );
    reply(res, 200, { data: result.rows });
    return true;
  }

  const match = url.pathname.match(/^\/v1\/tenant\/members\/([0-9a-f-]{36})\/roles$/i);
  if (match && req.method === "PATCH") {
    if (!canManageMembers(ctx.permissions)) {
      reply(res, 403, { error: "permission_denied" });
      return true;
    }
    const memberId = match[1]!;
    if (memberId === ctx.membershipId) {
      reply(res, 409, { error: "self_role_change_forbidden" });
      return true;
    }
    const input = await body(req);
    if (!input || !validRoleKeys(input.roleKeys, true)) {
      reply(res, 422, { error: "invalid_role_keys" });
      return true;
    }
    const target = await pool.query<{ user_id: string; membership_status: string; is_owner: boolean }>(
      `SELECT om.user_id,om.membership_status,
              COALESCE(bool_or(r.role_key IN ('institution_owner','institution_admin')),false) AS is_owner
         FROM core.organization_memberships om
         LEFT JOIN core.membership_roles mr ON mr.membership_id=om.id
         LEFT JOIN core.roles r ON r.id=mr.role_id
        WHERE om.id=$1::uuid AND om.organization_id=$2::uuid
        GROUP BY om.id`,
      [memberId, org],
    );
    const member = target.rows[0];
    if (!member || member.membership_status !== "active") {
      reply(res, 404, { error: "active_member_not_found" });
      return true;
    }
    if (member.is_owner) {
      reply(res, 409, { error: "privileged_role_protected" });
      return true;
    }
    const keys = input.roleKeys;
    const definitions = keys.length
      ? await pool.query<{ id: string; role_key: string }>(
        `SELECT id,role_key FROM core.roles
          WHERE role_key=ANY($1::text[])
            AND ((organization_id IS NULL AND is_system=true)
              OR (organization_id=$2::uuid AND is_system=false))`,
        [keys, org],
      )
      : { rows: [] as { id: string; role_key: string }[] };
    if (definitions.rows.length !== keys.length) {
      reply(res, 422, { error: "role_definition_not_found" });
      return true;
    }
    await pool.query("DELETE FROM core.membership_roles WHERE membership_id=$1::uuid", [memberId]);
    for (const role of definitions.rows) {
      await pool.query(
        "INSERT INTO core.membership_roles(membership_id,role_id) VALUES($1::uuid,$2::uuid) ON CONFLICT DO NOTHING",
        [memberId, role.id],
      );
    }
    await pool.query(
      `INSERT INTO audit.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
       VALUES($1::uuid,$2::uuid,'tenant.member_roles.updated','membership',$3,
         jsonb_build_object('role_keys',$4::jsonb,'target_user_id',$5::text))`,
      [org, actor, memberId, JSON.stringify(keys), member.user_id],
    );
    reply(res, 200, { data: { membershipId: memberId, roleKeys: keys } });
    return true;
  }

  return false;
}
