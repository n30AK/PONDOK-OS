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
  } else if (message.includes("custom_role_not_found") || message.includes("active_member_not_found")) {
    reply(res, 404, { error: message.includes("active_member_not_found") ? "active_member_not_found" : "custom_role_not_found" });
  } else if (message.includes("self_role_change_forbidden") || message.includes("privileged_role_protected")) {
    reply(res, 409, { error: message.includes("self_role_change_forbidden") ? "self_role_change_forbidden" : "privileged_role_protected" });
  } else if (message.includes("role_definition_not_found")) {
    reply(res, 422, { error: "role_definition_not_found" });
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
                  FILTER(WHERE rp.permission_key IS NOT NULL),ARRAY[]::text[]) AS permission_keys
           FROM core.roles r
           LEFT JOIN core.role_permissions rp ON rp.role_id=r.id
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
    const result = await pool.query("SELECT * FROM core.list_tenant_members()");
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
    const keys = input.roleKeys;
    try {
      await pool.query("SELECT core.set_tenant_member_roles($1::uuid,$2::text[])", [memberId, keys]);
      reply(res, 200, { data: { membershipId: memberId, roleKeys: keys } });
    } catch (reason) {
      sqlError(res, reason, "tenant_member_role_update_failed");
    }
    return true;
  }


  const scopeTables = {
    campus: { table: "core.membership_campus_scopes", target: "campus_id" },
    department: { table: "core.membership_department_scopes", target: "department_id" },
    class: { table: "core.membership_class_scopes", target: "class_group_id" },
    class_subject: { table: "core.membership_class_subject_scopes", target: "class_subject_id" },
    dormitory: { table: "core.membership_dormitory_scopes", target: "dormitory_id" },
    room: { table: "core.membership_room_scopes", target: "room_id" },
  } as const;
  type ScopeType = keyof typeof scopeTables;
  const memberScopeMatch = url.pathname.match(/^\/v1\/tenant\/members\/([0-9a-f-]{36})\/scopes$/i);
  const memberScopeRevokeMatch = url.pathname.match(/^\/v1\/tenant\/members\/([0-9a-f-]{36})\/scopes\/([0-9a-f-]{36})\/revoke$/i);
  if ((memberScopeMatch && (req.method === "GET" || req.method === "POST")) || (memberScopeRevokeMatch && req.method === "PATCH")) {
    if (!canManageMembers(ctx.permissions)) {
      reply(res, 403, { error: "permission_denied" });
      return true;
    }
    const memberId = (memberScopeMatch?.[1] ?? memberScopeRevokeMatch?.[1])!;
    if (memberId === ctx.membershipId) {
      reply(res, 409, { error: "self_scope_change_forbidden" });
      return true;
    }
    if (req.method === "GET" && memberScopeMatch) {
      try {
        const entries = await Promise.all(Object.entries(scopeTables).map(async ([scopeType, config]) => {
          const result = await pool.query(
            `SELECT id, ${config.target} AS target_id, valid_from, valid_until, reason, created_at, revoked_at
               FROM ${config.table}
              WHERE organization_id=$1::uuid AND membership_id=$2::uuid
              ORDER BY created_at DESC LIMIT 500`,
            [org, memberId],
          );
          return [scopeType, result.rows] as const;
        }));
        reply(res, 200, { data: { membershipId: memberId, scopes: Object.fromEntries(entries) } });
      } catch {
        reply(res, 503, { error: "tenant_member_scopes_unavailable" });
      }
      return true;
    }
    if (req.method === "POST" && memberScopeMatch) {
      const input = await body(req);
      const scopeType = input?.scopeType;
      const config = typeof scopeType === "string" && Object.hasOwn(scopeTables, scopeType)
        ? scopeTables[scopeType as ScopeType] : null;
      const targetId = input?.targetId;
      const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
      const validFrom = input?.validFrom === undefined ? null : input.validFrom;
      const validUntil = input?.validUntil === undefined || input.validUntil === null || input.validUntil === "" ? null : input.validUntil;
      const validDate = (value: unknown) => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
      if (!config || typeof targetId !== "string" || !UUID.test(targetId)
        || reason.length < 3 || reason.length > 500
        || (validFrom !== null && !validDate(validFrom))
        || (validUntil !== null && !validDate(validUntil))) {
        reply(res, 422, { error: "invalid_member_scope_assignment" });
        return true;
      }
      try {
        const result = await pool.query(
          `INSERT INTO ${config.table}
             (organization_id, membership_id, ${config.target}, valid_from, valid_until, reason, created_by)
           VALUES ($1::uuid,$2::uuid,$3::uuid,COALESCE($4::timestamptz,now()),$5::timestamptz,$6,$7::uuid)
           RETURNING id, ${config.target} AS target_id, valid_from, valid_until, reason, created_at`,
          [org, memberId, targetId, validFrom, validUntil, reason, actor],
        );
        await pool.query(
          `INSERT INTO audit.audit_events
             (organization_id,actor_user_id,action,resource_type,resource_id,metadata)
           VALUES ($1::uuid,$2::uuid,'tenant.member_scope.assigned','membership_scope',$3,
             jsonb_build_object('membership_id',$4::text,'scope_type',$5::text,'target_id',$6::text,'reason',$7::text))`,
          [org, actor, result.rows[0].id, memberId, scopeType, targetId, reason],
        );
        reply(res, 201, { data: { membershipId: memberId, scopeType, assignment: result.rows[0] } });
      } catch (reasonError) {
        const message = typeof reasonError === "object" && reasonError !== null
          ? String((reasonError as { message?: unknown }).message ?? "") : "";
        if (message.includes("membership_scope_self_change_forbidden")) {
          reply(res, 409, { error: "self_scope_change_forbidden" });
        } else if (message.includes("membership_scope_manage_permission_required")) {
          reply(res, 403, { error: "permission_denied" });
        } else if (message.includes("membership_scope_target_must_be_active")) {
          reply(res, 409, { error: "target_membership_inactive" });
        } else if (String((reasonError as { code?: unknown })?.code ?? "") === "23505") {
          reply(res, 409, { error: "scope_assignment_already_active" });
        } else if (String((reasonError as { code?: unknown })?.code ?? "") === "23503") {
          reply(res, 422, { error: "scope_target_not_found_in_tenant" });
        } else if (message.includes("membership_scope_")) {
          reply(res, 422, { error: "invalid_member_scope_assignment" });
        } else {
          reply(res, 503, { error: "tenant_member_scope_assignment_failed" });
        }
      }
      return true;
    }
    if (req.method === "PATCH" && memberScopeRevokeMatch) {
      const scopeId = memberScopeRevokeMatch[2]!;
      const input = await body(req);
      const scopeType = input?.scopeType;
      const config = typeof scopeType === "string" && Object.hasOwn(scopeTables, scopeType)
        ? scopeTables[scopeType as ScopeType] : null;
      if (!config) {
        reply(res, 422, { error: "invalid_member_scope_type" });
        return true;
      }
      try {
        const result = await pool.query(
          `UPDATE ${config.table}
              SET revoked_at=now(), revoked_by=$4::uuid
            WHERE organization_id=$1::uuid AND membership_id=$2::uuid AND id=$3::uuid
              AND revoked_at IS NULL
          RETURNING id, revoked_at`,
          [org, memberId, scopeId, actor],
        );
        if (!result.rowCount) {
          reply(res, 404, { error: "active_scope_assignment_not_found" });
        } else {
          await pool.query(
            `INSERT INTO audit.audit_events
               (organization_id,actor_user_id,action,resource_type,resource_id,metadata)
             VALUES ($1::uuid,$2::uuid,'tenant.member_scope.revoked','membership_scope',$3,
               jsonb_build_object('membership_id',$4::text,'scope_type',$5::text))`,
            [org, actor, scopeId, memberId, scopeType],
          );
          reply(res, 200, { data: { membershipId: memberId, scopeType, assignment: result.rows[0] } });
        }
      } catch (reasonError) {
        const message = typeof reasonError === "object" && reasonError !== null
          ? String((reasonError as { message?: unknown }).message ?? "") : "";
        if (message.includes("membership_scope_self_change_forbidden")) {
          reply(res, 409, { error: "self_scope_change_forbidden" });
        } else if (message.includes("membership_scope_manage_permission_required")) {
          reply(res, 403, { error: "permission_denied" });
        } else if (message.includes("membership_scope_only_one_way_revocation_allowed")) {
          reply(res, 409, { error: "scope_revocation_not_allowed" });
        } else {
          reply(res, 503, { error: "tenant_member_scope_revocation_failed" });
        }
      }
      return true;
    }
  }

  return false;
}
