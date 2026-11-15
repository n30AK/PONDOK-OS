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

/** SQL predicate for campus-owned operational records. Null-campus rows are not visible to scoped members. */
export function campusScopePredicate(
  campusAlias: string,
  organizationPlaceholder: string,
  membershipPlaceholder: string,
  tenantWidePlaceholder: string,
): string {
  return `(
    ${tenantWidePlaceholder}::boolean
    OR (
      ${campusAlias}.campus_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM core.membership_campus_scopes mcs
        WHERE mcs.organization_id = ${organizationPlaceholder}::uuid
          AND mcs.membership_id = ${membershipPlaceholder}::uuid
          AND mcs.campus_id = ${campusAlias}.campus_id
          AND mcs.revoked_at IS NULL AND mcs.valid_from <= now()
          AND (mcs.valid_until IS NULL OR mcs.valid_until > now())
      )
    )
  )`;
}

/** Department records are visible through an active campus or department grant. */
export function departmentScopePredicate(
  departmentAlias: string,
  organizationPlaceholder: string,
  membershipPlaceholder: string,
  tenantWidePlaceholder: string,
): string {
  return `(
    ${campusScopePredicate(departmentAlias, organizationPlaceholder, membershipPlaceholder, tenantWidePlaceholder)}
    OR EXISTS (
      SELECT 1 FROM core.membership_department_scopes mds
      WHERE mds.organization_id = ${organizationPlaceholder}::uuid
        AND mds.membership_id = ${membershipPlaceholder}::uuid
        AND mds.department_id = ${departmentAlias}.id
        AND mds.revoked_at IS NULL AND mds.valid_from <= now()
        AND (mds.valid_until IS NULL OR mds.valid_until > now())
    )
  )`;
}

/** Position records inherit scope from their owning department. */
export function positionScopePredicate(
  positionAlias: string,
  departmentAlias: string,
  organizationPlaceholder: string,
  membershipPlaceholder: string,
  tenantWidePlaceholder: string,
): string {
  return `(
    ${tenantWidePlaceholder}::boolean
    OR (
      ${positionAlias}.department_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM core.membership_department_scopes mds
        WHERE mds.organization_id = ${organizationPlaceholder}::uuid
          AND mds.membership_id = ${membershipPlaceholder}::uuid
          AND mds.department_id = ${positionAlias}.department_id
          AND mds.revoked_at IS NULL AND mds.valid_from <= now()
          AND (mds.valid_until IS NULL OR mds.valid_until > now())
      )
    )
    OR (
      ${departmentAlias}.campus_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM core.membership_campus_scopes mcs
        WHERE mcs.organization_id = ${organizationPlaceholder}::uuid
          AND mcs.membership_id = ${membershipPlaceholder}::uuid
          AND mcs.campus_id = ${departmentAlias}.campus_id
          AND mcs.revoked_at IS NULL AND mcs.valid_from <= now()
          AND (mcs.valid_until IS NULL OR mcs.valid_until > now())
      )
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


/**
 * Attendance is scoped to a campus or an explicitly assigned class. A
 * class-subject assignment alone is not sufficient because attendance sessions
 * currently have no class_subject_id relationship; that path remains fail-closed.
 */
export function attendanceClassScopePredicate(
  classAlias: string,
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
        AND mcs.campus_id = ${classAlias}.campus_id
        AND mcs.revoked_at IS NULL AND mcs.valid_from <= now()
        AND (mcs.valid_until IS NULL OR mcs.valid_until > now())
    )
    OR EXISTS (
      SELECT 1 FROM core.membership_class_scopes mcls
      WHERE mcls.organization_id = ${organizationPlaceholder}::uuid
        AND mcls.membership_id = ${membershipPlaceholder}::uuid
        AND mcls.class_group_id = ${classAlias}.id
        AND mcls.revoked_at IS NULL AND mcls.valid_from <= now()
        AND (mcls.valid_until IS NULL OR mcls.valid_until > now())
    )
  )`;
}

export function attendanceSessionScopePredicate(
  sessionAlias: string,
  organizationPlaceholder: string,
  membershipPlaceholder: string,
  tenantWidePlaceholder: string,
): string {
  return `EXISTS (
    SELECT 1 FROM academic.class_groups cg
    WHERE cg.organization_id = ${organizationPlaceholder}::uuid
      AND cg.id = ${sessionAlias}.class_group_id
      AND ${attendanceClassScopePredicate("cg", organizationPlaceholder, membershipPlaceholder, tenantWidePlaceholder)}
  )`;
}

export function attendanceRecordScopePredicate(
  recordAlias: string,
  organizationPlaceholder: string,
  membershipPlaceholder: string,
  tenantWidePlaceholder: string,
): string {
  return `EXISTS (
    SELECT 1
    FROM academic.attendance_sessions ats
    JOIN academic.class_groups cg
      ON cg.organization_id = ats.organization_id AND cg.id = ats.class_group_id
    WHERE ats.organization_id = ${organizationPlaceholder}::uuid
      AND ats.id = ${recordAlias}.attendance_session_id
      AND ${attendanceClassScopePredicate("cg", organizationPlaceholder, membershipPlaceholder, tenantWidePlaceholder)}
  )`;
}


/** Dormitory access: explicit dormitory grant or campus grant for that dormitory. */
export function boardingDormitoryScopePredicate(
  dormitoryAlias: string, organizationPlaceholder: string, membershipPlaceholder: string, tenantWidePlaceholder: string,
): string {
  return `(
    ${tenantWidePlaceholder}::boolean
    OR EXISTS (
      SELECT 1 FROM core.membership_campus_scopes mcs
      WHERE mcs.organization_id=${organizationPlaceholder}::uuid
        AND mcs.membership_id=${membershipPlaceholder}::uuid
        AND mcs.campus_id=${dormitoryAlias}.campus_id
        AND mcs.revoked_at IS NULL AND mcs.valid_from<=now()
        AND (mcs.valid_until IS NULL OR mcs.valid_until>now())
    )
    OR EXISTS (
      SELECT 1 FROM core.membership_dormitory_scopes mds
      WHERE mds.organization_id=${organizationPlaceholder}::uuid
        AND mds.membership_id=${membershipPlaceholder}::uuid
        AND mds.dormitory_id=${dormitoryAlias}.id
        AND mds.revoked_at IS NULL AND mds.valid_from<=now()
        AND (mds.valid_until IS NULL OR mds.valid_until>now())
    )
  )`;
}

/** Room access inherits explicit room, parent dormitory, or campus grants. */
export function boardingRoomScopePredicate(
  roomAlias: string, organizationPlaceholder: string, membershipPlaceholder: string, tenantWidePlaceholder: string,
): string {
  return `(
    ${tenantWidePlaceholder}::boolean
    OR EXISTS (
      SELECT 1 FROM core.membership_room_scopes mrs
      WHERE mrs.organization_id=${organizationPlaceholder}::uuid
        AND mrs.membership_id=${membershipPlaceholder}::uuid
        AND mrs.room_id=${roomAlias}.id
        AND mrs.revoked_at IS NULL AND mrs.valid_from<=now()
        AND (mrs.valid_until IS NULL OR mrs.valid_until>now())
    )
    OR EXISTS (
      SELECT 1 FROM boarding.dormitories d
      WHERE d.organization_id=${organizationPlaceholder}::uuid
        AND d.id=${roomAlias}.dormitory_id
        AND (
          EXISTS (
            SELECT 1 FROM core.membership_dormitory_scopes mds
            WHERE mds.organization_id=d.organization_id AND mds.membership_id=${membershipPlaceholder}::uuid
              AND mds.dormitory_id=d.id AND mds.revoked_at IS NULL AND mds.valid_from<=now()
              AND (mds.valid_until IS NULL OR mds.valid_until>now())
          )
          OR EXISTS (
            SELECT 1 FROM core.membership_campus_scopes mcs
            WHERE mcs.organization_id=d.organization_id AND mcs.membership_id=${membershipPlaceholder}::uuid
              AND mcs.campus_id=d.campus_id AND mcs.revoked_at IS NULL AND mcs.valid_from<=now()
              AND (mcs.valid_until IS NULL OR mcs.valid_until>now())
          )
        )
    )
  )`;
}

export function boardingBedScopePredicate(
  bedAlias: string, organizationPlaceholder: string, membershipPlaceholder: string, tenantWidePlaceholder: string,
): string {
  return `EXISTS (
    SELECT 1 FROM boarding.rooms r
    WHERE r.organization_id=${organizationPlaceholder}::uuid AND r.id=${bedAlias}.room_id
      AND ${boardingRoomScopePredicate("r", organizationPlaceholder, membershipPlaceholder, tenantWidePlaceholder)}
  )`;
}

export function boardingAssignmentScopePredicate(
  assignmentAlias: string, organizationPlaceholder: string, membershipPlaceholder: string, tenantWidePlaceholder: string,
): string {
  return `EXISTS (
    SELECT 1 FROM boarding.beds b
    WHERE b.organization_id=${organizationPlaceholder}::uuid AND b.id=${assignmentAlias}.bed_id
      AND ${boardingBedScopePredicate("b", organizationPlaceholder, membershipPlaceholder, tenantWidePlaceholder)}
  )`;
}

/** Student boarding data is visible only through campus or a current bed assignment in a granted room/dormitory. */
export function boardingStudentScopePredicate(
  studentAlias: string, organizationPlaceholder: string, membershipPlaceholder: string, tenantWidePlaceholder: string,
  assignmentDateExpression = "CURRENT_DATE",
): string {
  return `(
    ${tenantWidePlaceholder}::boolean
    OR EXISTS (
      SELECT 1 FROM core.membership_campus_scopes mcs
      WHERE mcs.organization_id=${organizationPlaceholder}::uuid
        AND mcs.membership_id=${membershipPlaceholder}::uuid
        AND mcs.campus_id=${studentAlias}.campus_id
        AND mcs.revoked_at IS NULL AND mcs.valid_from<=now()
        AND (mcs.valid_until IS NULL OR mcs.valid_until>now())
    )
    OR EXISTS (
      SELECT 1
      FROM boarding.bed_assignments ba
      JOIN boarding.beds b ON b.organization_id=ba.organization_id AND b.id=ba.bed_id
      JOIN boarding.rooms r ON r.organization_id=b.organization_id AND r.id=b.room_id
      JOIN boarding.dormitories d ON d.organization_id=r.organization_id AND d.id=r.dormitory_id
      WHERE ba.organization_id=${organizationPlaceholder}::uuid
        AND ba.student_id=${studentAlias}.id
        AND ba.assigned_from<=${assignmentDateExpression}
        AND (ba.assigned_until IS NULL OR ba.assigned_until>=${assignmentDateExpression})
        AND (
          EXISTS (
            SELECT 1 FROM core.membership_room_scopes mrs
            WHERE mrs.organization_id=r.organization_id AND mrs.membership_id=${membershipPlaceholder}::uuid
              AND mrs.room_id=r.id AND mrs.revoked_at IS NULL AND mrs.valid_from<=now()
              AND (mrs.valid_until IS NULL OR mrs.valid_until>now())
          )
          OR EXISTS (
            SELECT 1 FROM core.membership_dormitory_scopes mds
            WHERE mds.organization_id=d.organization_id AND mds.membership_id=${membershipPlaceholder}::uuid
              AND mds.dormitory_id=d.id AND mds.revoked_at IS NULL AND mds.valid_from<=now()
              AND (mds.valid_until IS NULL OR mds.valid_until>now())
          )
          OR EXISTS (
            SELECT 1 FROM core.membership_campus_scopes mcs
            WHERE mcs.organization_id=d.organization_id AND mcs.membership_id=${membershipPlaceholder}::uuid
              AND mcs.campus_id=d.campus_id AND mcs.revoked_at IS NULL AND mcs.valid_from<=now()
              AND (mcs.valid_until IS NULL OR mcs.valid_until>now())
          )
        )
    )
  )`;
}

export function boardingStudentRecordScopePredicate(
  recordAlias: string, organizationPlaceholder: string, membershipPlaceholder: string, tenantWidePlaceholder: string,
): string {
  return `EXISTS (
    SELECT 1 FROM academic.student_profiles sp
    WHERE sp.organization_id=${organizationPlaceholder}::uuid AND sp.id=${recordAlias}.student_id
      AND ${boardingStudentScopePredicate(
        "sp", organizationPlaceholder, membershipPlaceholder, tenantWidePlaceholder,
        recordAlias === "lr" ? "lr.requested_from::date" : recordAlias === "i" ? "i.occurred_at::date" : "CURRENT_DATE",
      )}
  )`;
}
