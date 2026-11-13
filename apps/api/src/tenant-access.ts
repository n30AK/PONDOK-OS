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


/**
 * Tenant-wide operational access is intentionally limited to explicit institution
 * authority roles. Platform roles and ordinary membership permissions do not
 * bypass member-level operational scopes.
 */
export function hasTenantWideOperationalAccess(roles: readonly string[]): boolean {
  return roles.some((role) => role === "institution_owner" || role === "institution_admin");
}

/**
 * SQL predicate for student records. A member may see a student when at least one
 * concrete, currently active assignment matches: campus, active class enrollment,
 * class-subject offering, dormitory, or room. Each branch is tenant-bound.
 *
 * The alias and placeholders must be authored by the caller, never user input.
 * The boolean tenantWide placeholder is derived from verified tenant roles.
 */
export function studentScopePredicate(
  studentAlias: string,
  organizationPlaceholder: string,
  membershipPlaceholder: string,
  tenantWidePlaceholder: string,
): string {
  return `(
    ${tenantWidePlaceholder}::boolean
    OR EXISTS (
      SELECT 1 FROM core.membership_campus_scopes mcs
      WHERE mcs.organization_id = ${organizationPlaceholder}::uuid
        AND mcs.membership_id = ${membershipPlaceholder}::uuid
        AND mcs.campus_id = ${studentAlias}.campus_id
        AND mcs.revoked_at IS NULL AND mcs.valid_from <= now()
        AND (mcs.valid_until IS NULL OR mcs.valid_until > now())
    )
    OR EXISTS (
      SELECT 1
      FROM academic.enrollments e
      JOIN core.membership_class_scopes mcls
        ON mcls.organization_id = e.organization_id
       AND mcls.class_group_id = e.class_group_id
      WHERE e.organization_id = ${organizationPlaceholder}::uuid
        AND e.student_id = ${studentAlias}.id
        AND e.status = 'enrolled'
        AND e.enrolled_on <= CURRENT_DATE
        AND (e.ended_on IS NULL OR e.ended_on >= CURRENT_DATE)
        AND mcls.membership_id = ${membershipPlaceholder}::uuid
        AND mcls.revoked_at IS NULL AND mcls.valid_from <= now()
        AND (mcls.valid_until IS NULL OR mcls.valid_until > now())
    )
    OR EXISTS (
      SELECT 1
      FROM academic.enrollments e
      JOIN academic.class_subjects cs
        ON cs.organization_id = e.organization_id
       AND cs.class_group_id = e.class_group_id
      JOIN core.membership_class_subject_scopes mcss
        ON mcss.organization_id = cs.organization_id
       AND mcss.class_subject_id = cs.id
      WHERE e.organization_id = ${organizationPlaceholder}::uuid
        AND e.student_id = ${studentAlias}.id
        AND e.status = 'enrolled'
        AND e.enrolled_on <= CURRENT_DATE
        AND (e.ended_on IS NULL OR e.ended_on >= CURRENT_DATE)
        AND mcss.membership_id = ${membershipPlaceholder}::uuid
        AND mcss.revoked_at IS NULL AND mcss.valid_from <= now()
        AND (mcss.valid_until IS NULL OR mcss.valid_until > now())
    )
    OR EXISTS (
      SELECT 1
      FROM boarding.bed_assignments ba
      JOIN boarding.beds b
        ON b.organization_id = ba.organization_id AND b.id = ba.bed_id
      JOIN boarding.rooms r
        ON r.organization_id = b.organization_id AND r.id = b.room_id
      JOIN core.membership_room_scopes mrs
        ON mrs.organization_id = r.organization_id AND mrs.room_id = r.id
      WHERE ba.organization_id = ${organizationPlaceholder}::uuid
        AND ba.student_id = ${studentAlias}.id
        AND ba.assigned_from <= CURRENT_DATE
        AND (ba.assigned_until IS NULL OR ba.assigned_until >= CURRENT_DATE)
        AND mrs.membership_id = ${membershipPlaceholder}::uuid
        AND mrs.revoked_at IS NULL AND mrs.valid_from <= now()
        AND (mrs.valid_until IS NULL OR mrs.valid_until > now())
    )
    OR EXISTS (
      SELECT 1
      FROM boarding.bed_assignments ba
      JOIN boarding.beds b
        ON b.organization_id = ba.organization_id AND b.id = ba.bed_id
      JOIN boarding.rooms r
        ON r.organization_id = b.organization_id AND r.id = b.room_id
      JOIN core.membership_dormitory_scopes mds
        ON mds.organization_id = r.organization_id AND mds.dormitory_id = r.dormitory_id
      WHERE ba.organization_id = ${organizationPlaceholder}::uuid
        AND ba.student_id = ${studentAlias}.id
        AND ba.assigned_from <= CURRENT_DATE
        AND (ba.assigned_until IS NULL OR ba.assigned_until >= CURRENT_DATE)
        AND mds.membership_id = ${membershipPlaceholder}::uuid
        AND mds.revoked_at IS NULL AND mds.valid_from <= now()
        AND (mds.valid_until IS NULL OR mds.valid_until > now())
    )
  )`;
}

/** SQL predicate for employee directory reads: campus or active department grant. */
export function employeeScopePredicate(
  employeeAlias: string,
  organizationPlaceholder: string,
  membershipPlaceholder: string,
  tenantWidePlaceholder: string,
): string {
  return `(
    ${tenantWidePlaceholder}::boolean
    OR EXISTS (
      SELECT 1 FROM core.membership_campus_scopes mcs
      WHERE mcs.organization_id = ${organizationPlaceholder}::uuid
        AND mcs.membership_id = ${membershipPlaceholder}::uuid
        AND mcs.campus_id = ${employeeAlias}.campus_id
        AND mcs.revoked_at IS NULL AND mcs.valid_from <= now()
        AND (mcs.valid_until IS NULL OR mcs.valid_until > now())
    )
    OR EXISTS (
      SELECT 1
      FROM hr.employee_assignments ea
      JOIN core.membership_department_scopes mds
        ON mds.organization_id = ea.organization_id
       AND mds.department_id = ea.department_id
      WHERE ea.organization_id = ${organizationPlaceholder}::uuid
        AND ea.employee_id = ${employeeAlias}.id
        AND ea.starts_on <= CURRENT_DATE
        AND (ea.ends_on IS NULL OR ea.ends_on >= CURRENT_DATE)
        AND mds.membership_id = ${membershipPlaceholder}::uuid
        AND mds.revoked_at IS NULL AND mds.valid_from <= now()
        AND (mds.valid_until IS NULL OR mds.valid_until > now())
    )
  )`;
}
