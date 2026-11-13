import type { Pool } from "pg";

export interface TenantContext {
  membershipId: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
}

export async function loadTenantContext(
  pool: Pick<Pool, "query">,
  userId: string,
  organizationId: string,
): Promise<TenantContext | null> {
  const result = await pool.query<{
    membership_id: string;
    organization_id: string;
    roles: string[];
    permissions: string[];
  }>(
    `SELECT
       om.id AS membership_id,
       om.organization_id,
       COALESCE(array_agg(DISTINCT r.role_key) FILTER (WHERE r.id IS NOT NULL), ARRAY[]::text[]) AS roles,
       COALESCE(array_agg(DISTINCT rp.permission_key) FILTER (WHERE rp.permission_key IS NOT NULL), ARRAY[]::text[]) AS permissions
     FROM core.organization_memberships om
     LEFT JOIN core.membership_roles mr ON mr.membership_id = om.id
     LEFT JOIN core.roles r
       ON r.id = mr.role_id
      AND (r.organization_id IS NULL OR r.organization_id = om.organization_id)
     LEFT JOIN core.role_permissions rp ON rp.role_id = r.id
     WHERE om.user_id = $1::uuid
       AND om.organization_id = $2::uuid
       AND om.membership_status = 'active'
     GROUP BY om.id, om.organization_id
     LIMIT 1`,
    [userId, organizationId],
  );
  const row = result.rows[0];
  if (!row) return null;
  // Owner and institution-admin roles are the tenant's explicit authority
  // boundary. Preserve their access-management capability even if a legacy
  // role-permission grant is missing or a context projection is incomplete.
  // This does not grant access to platform operators or ordinary members.
  const roles = row.roles;
  const permissions = new Set(row.permissions);
  if (roles.some((role) => role === "institution_owner" || role === "institution_admin")) {
    permissions.add("core.roles.manage");
    permissions.add("core.members.manage");
  }
  return {
    membershipId: row.membership_id,
    organizationId: row.organization_id,
    roles,
    permissions: [...permissions],
  };
}

export function hasPermission(context: TenantContext, permissionKey: string): boolean {
  return context.permissions.includes(permissionKey);
}
