import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { departmentScopePredicate, employeeScopePredicate, hasTenantWideOperationalAccess, loadTenantContext, positionScopePredicate } from "./tenant-access.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Json = Record<string, unknown>;
function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}
async function readJson(req: IncomingMessage): Promise<Json | null> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += part.length; if (size > 65_536) return null; chunks.push(part); }
  try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8")); return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null; }
  catch { return null; }
}
export function validateEmployeeInput(value: Json): string | null {
  if (typeof value.employeeNumber !== "string" || !/^[A-Za-z0-9._/-]{1,64}$/.test(value.employeeNumber)) return "invalid_employee_number";
  if (typeof value.legalName !== "string" || value.legalName.trim().length < 2 || value.legalName.length > 160) return "invalid_legal_name";
  if (typeof value.joinedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.joinedOn)) return "invalid_joined_on";
  if (value.campusId !== undefined && value.campusId !== null && (typeof value.campusId !== "string" || !UUID.test(value.campusId))) return "invalid_campus_id";
  if (value.email !== undefined && value.email !== null && (typeof value.email !== "string" || value.email.length > 254)) return "invalid_email";
  if (value.phone !== undefined && value.phone !== null && (typeof value.phone !== "string" || value.phone.length > 32)) return "invalid_phone";
  return null;
}
export function validatePayrollRunInput(value: Json): string | null {
  if (typeof value.payrollPeriodId !== "string" || !UUID.test(value.payrollPeriodId)) return "invalid_payroll_period_id";
  if (typeof value.runNumber !== "string" || !/^[A-Za-z0-9._/-]{1,64}$/.test(value.runNumber)) return "invalid_run_number";
  if (value.runType !== undefined && !["regular","bonus","adjustment"].includes(String(value.runType))) return "invalid_run_type";
  if (!Array.isArray(value.lines) || value.lines.length < 1 || value.lines.length > 1000) return "invalid_payroll_lines";
  for (const raw of value.lines) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "invalid_payroll_line";
    const line = raw as Json;
    if (typeof line.employeeId !== "string" || !UUID.test(line.employeeId)) return "invalid_employee_id";
    if (typeof line.componentCode !== "string" || !/^[A-Za-z0-9._-]{1,32}$/.test(line.componentCode)) return "invalid_component_code";
    if (typeof line.componentName !== "string" || line.componentName.trim().length < 1 || line.componentName.length > 120) return "invalid_component_name";
    if (!["earning","deduction"].includes(String(line.componentType))) return "invalid_component_type";
    if (typeof line.amount !== "number" || !Number.isFinite(line.amount) || line.amount <= 0) return "invalid_component_amount";
  }
  return null;
}

export async function handleHrRequest(
  req: IncomingMessage, res: ServerResponse, pool: Pick<Pool, "query">, userId: string, organizationId: string,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (!path.startsWith("/v1/hr/")) return false;
  const tenant = await loadTenantContext(pool, userId, organizationId);
  if (!tenant) { reply(res, 403, { error: "active_membership_required" }); return true; }
  const tenantWide = hasTenantWideOperationalAccess(tenant.roles);
  if (path === "/v1/hr/employees" && req.method === "GET") {
    if (!tenant.permissions.includes("hr.employees.read")) { reply(res, 403, { error: "permission_required", permission: "hr.employees.read" }); return true; }
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const result = await pool.query(
      `SELECT e.id, e.campus_id AS "campusId", e.employee_number AS "employeeNumber",
              e.legal_name AS "legalName", e.preferred_name AS "preferredName",
              e.email, e.phone, e.joined_on AS "joinedOn", e.employment_status AS "employmentStatus"
       FROM hr.employees e WHERE e.organization_id = $1::uuid
         AND ${employeeScopePredicate("e", "$1", "$2", "$3")}
       ORDER BY e.legal_name LIMIT $4`,
      [organizationId, tenant.membershipId, tenantWide, limit],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/hr/employees" && req.method === "POST") {
    if (!tenant.permissions.includes("hr.employees.write")) { reply(res, 403, { error: "permission_required", permission: "hr.employees.write" }); return true; }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const error = validateEmployeeInput(body);
    if (error) { reply(res, 422, { error }); return true; }
    if (!tenantWide && typeof body.campusId !== "string") {
      reply(res, 403, { error: "employee_create_requires_assigned_campus" }); return true;
    }
    try {
      // Keep authorization and insertion in one statement so a revoked campus
      // grant cannot race a preflight SELECT and still create an employee.
      const result = await pool.query(
        `INSERT INTO hr.employees
           (organization_id, campus_id, employee_number, legal_name, preferred_name, email, phone, joined_on)
         SELECT $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::date
         WHERE $9::boolean OR EXISTS (
           SELECT 1 FROM core.membership_campus_scopes mcs
           WHERE mcs.organization_id=$1::uuid AND mcs.membership_id=$10::uuid
             AND mcs.campus_id=$2::uuid AND mcs.revoked_at IS NULL
             AND mcs.valid_from<=now() AND (mcs.valid_until IS NULL OR mcs.valid_until>now())
         )
         RETURNING id, campus_id AS "campusId", employee_number AS "employeeNumber",
                   legal_name AS "legalName", joined_on AS "joinedOn", employment_status AS "employmentStatus"`,
        [organizationId, body.campusId ?? null, body.employeeNumber, (body.legalName as string).trim(),
         body.preferredName ?? null, body.email ?? null, body.phone ?? null, body.joinedOn, tenantWide, tenant.membershipId],
      );
      if (!result.rows[0]) { reply(res, 403, { error: "campus_outside_member_scope" }); return true; }
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : code === "23503" ? 422 : 500, { error: code === "23505" ? "employee_number_exists" : code === "23503" ? "campus_not_found" : "employee_create_failed" });
    }
    return true;
  }

  if (path === "/v1/hr/campuses" && req.method === "GET") {
    if (!["hr.organization.read", "hr.employees.read", "hr.employees.write"].some((permission) => tenant.permissions.includes(permission))) { reply(res, 403, { error: "permission_required", permission: "hr.organization.read_or_employee_access" }); return true; }
    const result = await pool.query(
      `SELECT c.id, c.code, c.name
       FROM core.campuses c
       WHERE c.organization_id=$1::uuid
         AND ($3::boolean OR EXISTS (
           SELECT 1 FROM core.membership_campus_scopes mcs
           WHERE mcs.organization_id=$1::uuid AND mcs.membership_id=$2::uuid
             AND mcs.campus_id=c.id AND mcs.revoked_at IS NULL
             AND mcs.valid_from<=now() AND (mcs.valid_until IS NULL OR mcs.valid_until>now())
         ))
       ORDER BY c.name LIMIT 100`,
      [organizationId, tenant.membershipId, tenantWide],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/hr/departments" && req.method === "GET") {
    if (!tenant.permissions.includes("hr.organization.read")) { reply(res, 403, { error: "permission_required", permission: "hr.organization.read" }); return true; }
    const result = await pool.query(
      `SELECT d.id, d.department_code AS "departmentCode", d.department_name AS "departmentName",
              d.parent_department_id AS "parentDepartmentId", d.head_employee_id AS "headEmployeeId",
              d.campus_id AS "campusId", d.effective_from AS "effectiveFrom",
              d.effective_until AS "effectiveUntil", d.is_active AS "isActive"
       FROM hr.departments d
       WHERE d.organization_id=$1::uuid
         AND ${departmentScopePredicate("d", "$1", "$2", "$3")}
       ORDER BY d.department_name LIMIT 100`,
      [organizationId, tenant.membershipId, tenantWide],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/hr/positions" && req.method === "GET") {
    if (!tenant.permissions.includes("hr.organization.read")) { reply(res, 403, { error: "permission_required", permission: "hr.organization.read" }); return true; }
    const result = await pool.query(
      `SELECT p.id, p.position_code AS "positionCode", p.position_name AS "positionName",
              p.department_id AS "departmentId", p.parent_position_id AS "parentPositionId",
              p.job_family AS "jobFamily", p.position_level AS "positionLevel",
              p.job_description AS "jobDescription", p.approval_scope AS "approvalScope",
              p.is_active AS "isActive"
       FROM hr.positions p
       LEFT JOIN hr.departments d ON d.organization_id=p.organization_id AND d.id=p.department_id
       WHERE p.organization_id=$1::uuid
         AND ${positionScopePredicate("p", "d", "$1", "$2", "$3")}
       ORDER BY p.position_level NULLS LAST, p.position_name LIMIT 100`,
      [organizationId, tenant.membershipId, tenantWide],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/hr/educators" && req.method === "GET") {
    if (!tenant.permissions.includes("hr.educators.read")) { reply(res, 403, { error: "permission_required", permission: "hr.educators.read" }); return true; }
    const result = await pool.query(
      `SELECT i.id, i.employee_id AS "employeeId", e.employee_number AS "employeeNumber",
              e.legal_name AS "employeeName", i.educator_number AS "educatorNumber",
              i.educator_type AS "educatorType", i.highest_qualification AS "highestQualification",
              i.specialization, i.certification_summary AS "certificationSummary",
              i.teaching_experience_years AS "teachingExperienceYears",
              i.employment_category AS "employmentCategory", i.is_active AS "isActive"
       FROM academic.instructors i
       JOIN hr.employees e ON e.organization_id=i.organization_id AND e.id=i.employee_id
       WHERE i.organization_id=$1::uuid
         AND ${employeeScopePredicate("e", "$1", "$2", "$3")}
       ORDER BY e.legal_name LIMIT 100`,
      [organizationId, tenant.membershipId, tenantWide],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  const assignmentMatch = path.match(/^\/v1\/hr\/employee-assignments(?:\/([0-9a-f-]{36}))?$/i);
  if (assignmentMatch && req.method === "GET") {
    if (!tenant.permissions.includes("hr.organization.read")) { reply(res, 403, { error: "permission_required", permission: "hr.organization.read" }); return true; }
    const assignmentId = assignmentMatch[1];
    if (assignmentId && !UUID.test(assignmentId)) { reply(res, 400, { error: "invalid_employee_assignment_id" }); return true; }
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const result = await pool.query(
      `SELECT a.id, a.employee_id AS "employeeId", e.employee_number AS "employeeNumber",
              e.legal_name AS "employeeName", a.department_id AS "departmentId",
              d.department_name AS "departmentName", a.position_id AS "positionId",
              p.position_name AS "positionName", a.manager_employee_id AS "managerEmployeeId",
              a.assignment_type AS "assignmentType", a.starts_on AS "startsOn",
              a.ends_on AS "endsOn", a.is_primary AS "isPrimary",
              a.decision_reference AS "decisionReference"
       FROM hr.employee_assignments a
       JOIN hr.employees e ON e.organization_id = a.organization_id AND e.id = a.employee_id
       LEFT JOIN hr.departments d ON d.organization_id = a.organization_id AND d.id = a.department_id
       LEFT JOIN hr.positions p ON p.organization_id = a.organization_id AND p.id = a.position_id
       WHERE a.organization_id = $1::uuid
         AND ${employeeScopePredicate("e", "$1", "$2", "$3")}
         AND (
           $3::boolean
           OR EXISTS (
             SELECT 1 FROM core.membership_campus_scopes mcs
             WHERE mcs.organization_id=$1::uuid AND mcs.membership_id=$2::uuid
               AND mcs.campus_id=e.campus_id AND mcs.revoked_at IS NULL
               AND mcs.valid_from<=now() AND (mcs.valid_until IS NULL OR mcs.valid_until>now())
           )
           OR EXISTS (
             SELECT 1 FROM core.membership_department_scopes mds
             WHERE mds.organization_id=$1::uuid AND mds.membership_id=$2::uuid
               AND mds.department_id=a.department_id AND mds.revoked_at IS NULL
               AND mds.valid_from<=now() AND (mds.valid_until IS NULL OR mds.valid_until>now())
           )
         )
         AND ($4::uuid IS NULL OR a.id = $4::uuid)
       ORDER BY a.starts_on DESC, e.legal_name
       LIMIT $5`,
      [organizationId, tenant.membershipId, tenantWide, assignmentId ?? null, assignmentId ? 1 : limit],
    );
    if (assignmentId && !result.rows[0]) { reply(res, 404, { error: "employee_assignment_not_found" }); return true; }
    reply(res, 200, assignmentId ? { data: result.rows[0] } : { data: result.rows });
    return true;
  }

  const contractMatch = path.match(/^\/v1\/hr\/employment-contracts(?:\/([0-9a-f-]{36}))?$/i);
  if (contractMatch && req.method === "GET") {
    if (!tenant.permissions.includes("hr.contracts.read")) { reply(res, 403, { error: "permission_required", permission: "hr.contracts.read" }); return true; }
    const contractId = contractMatch[1];
    if (contractId && !UUID.test(contractId)) { reply(res, 400, { error: "invalid_employment_contract_id" }); return true; }
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    // Contract metadata and compensation are separate disclosure levels.
    // A department/campus scope plus hr.contracts.read must not expose salary.
    // Compensation is returned only with the explicit payroll-read permission.
    const compensationProjection = tenant.permissions.includes("hr.payroll.read")
      ? `, c.base_salary AS "baseSalary", c.currency_code AS "currencyCode"`
      : "";
    const result = await pool.query(
      `SELECT c.id, c.employee_id AS "employeeId", e.employee_number AS "employeeNumber",
              e.legal_name AS "employeeName", c.position_id AS "positionId",
              p.position_name AS "positionName", c.contract_type AS "contractType",
              c.starts_on AS "startsOn", c.ends_on AS "endsOn"${compensationProjection},
              c.status
       FROM hr.employment_contracts c
       JOIN hr.employees e ON e.organization_id = c.organization_id AND e.id = c.employee_id
       LEFT JOIN hr.positions p ON p.organization_id = c.organization_id AND p.id = c.position_id
       WHERE c.organization_id = $1::uuid
         AND ${employeeScopePredicate("e", "$1", "$2", "$3")}
         AND ($4::uuid IS NULL OR c.id = $4::uuid)
       ORDER BY c.starts_on DESC, e.legal_name
       LIMIT $5`,
      [organizationId, tenant.membershipId, tenantWide, contractId ?? null, contractId ? 1 : limit],
    );
    if (contractId && !result.rows[0]) { reply(res, 404, { error: "employment_contract_not_found" }); return true; }
    reply(res, 200, contractId ? { data: result.rows[0] } : { data: result.rows });
    return true;
  }

  if (path === "/v1/hr/payroll/periods" && req.method === "GET") {
    if (!tenant.permissions.includes("hr.payroll.read")) { reply(res, 403, { error: "permission_required", permission: "hr.payroll.read" }); return true; }
    const result = await pool.query(
      `SELECT id, period_code AS "periodCode", starts_on AS "startsOn", ends_on AS "endsOn",
              pay_date AS "payDate", status
       FROM hr.payroll_periods WHERE organization_id = $1::uuid
       ORDER BY starts_on DESC LIMIT 100`, [organizationId],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/hr/payroll/periods" && req.method === "POST") {
    if (!tenantWide) { reply(res, 403, { error: "payroll_period_management_requires_tenant_authority" }); return true; }
    if (!tenant.permissions.includes("hr.payroll.prepare")) { reply(res, 403, { error: "permission_required", permission: "hr.payroll.prepare" }); return true; }
    const body = await readJson(req);
    if (!body || typeof body.periodCode !== "string" || !/^[A-Za-z0-9._/-]{1,32}$/.test(body.periodCode)
      || typeof body.startsOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.startsOn)
      || typeof body.endsOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.endsOn)
      || typeof body.payDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.payDate)
      || body.endsOn < body.startsOn) {
      reply(res, 422, { error: "invalid_payroll_period_input" }); return true;
    }
    try {
      const result = await pool.query(
        `INSERT INTO hr.payroll_periods (organization_id, period_code, starts_on, ends_on, pay_date)
         VALUES ($1::uuid, $2, $3::date, $4::date, $5::date)
         RETURNING id, period_code AS "periodCode", starts_on AS "startsOn", ends_on AS "endsOn", pay_date AS "payDate", status`,
        [organizationId, body.periodCode, body.startsOn, body.endsOn, body.payDate],
      );
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : code === "23514" ? 422 : 500, { error: code === "23505" ? "payroll_period_code_exists" : code === "23514" ? "invalid_payroll_period" : "payroll_period_create_failed" });
    }
    return true;
  }

  if (path === "/v1/hr/payroll/runs" && req.method === "GET") {
    if (!tenant.permissions.includes("hr.payroll.read")) { reply(res, 403, { error: "permission_required", permission: "hr.payroll.read" }); return true; }
    const result = await pool.query(
      `SELECT r.id, r.run_number AS "runNumber", r.run_type AS "runType", r.status,
              r.approved_at AS "approvedAt", r.paid_at AS "paidAt",
              p.period_code AS "periodCode",
              COALESCE(SUM(CASE WHEN l.component_type = 'earning' THEN l.amount ELSE 0 END),0) AS earnings,
              COALESCE(SUM(CASE WHEN l.component_type = 'deduction' THEN l.amount ELSE 0 END),0) AS deductions,
              COUNT(DISTINCT l.employee_id)::integer AS "employeeCount"
       FROM hr.payroll_runs r
       JOIN hr.payroll_periods p ON p.organization_id = r.organization_id AND p.id = r.payroll_period_id
       JOIN hr.payroll_lines l ON l.organization_id = r.organization_id AND l.payroll_run_id = r.id
       JOIN hr.employees e ON e.organization_id = l.organization_id AND e.id = l.employee_id
         AND ${employeeScopePredicate("e", "$1", "$2", "$3")}
       WHERE r.organization_id = $1::uuid
       GROUP BY r.id, p.period_code ORDER BY r.created_at DESC LIMIT 100`,
      [organizationId, tenant.membershipId, tenantWide],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/hr/payroll/runs" && req.method === "POST") {
    if (!tenant.permissions.includes("hr.payroll.prepare")) { reply(res, 403, { error: "permission_required", permission: "hr.payroll.prepare" }); return true; }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const error = validatePayrollRunInput(body);
    if (error) { reply(res, 422, { error }); return true; }
    const lines = (body.lines as Json[]).map((line) => ({
      employee_id: line.employeeId, component_code: line.componentCode,
      component_name: line.componentName, component_type: line.componentType, amount: line.amount,
    }));
    try {
      const result = await pool.query(
        `WITH input_lines AS (
           SELECT * FROM jsonb_to_recordset($5::jsonb)
             AS l(employee_id uuid, component_code text, component_name text, component_type text, amount numeric)
         ), authorized_employees AS (
           SELECT e.id
           FROM hr.employees e
           WHERE e.organization_id = $1::uuid
             AND e.id IN (SELECT DISTINCT employee_id FROM input_lines)
             AND ${employeeScopePredicate("e", "$1", "$6", "$7")}
         ), run AS (
           INSERT INTO hr.payroll_runs (organization_id, payroll_period_id, run_number, run_type)
           SELECT $1::uuid, p.id, $3, $4
           FROM hr.payroll_periods p
           WHERE p.organization_id = $1::uuid AND p.id = $2::uuid AND p.status = 'open'
             AND (SELECT COUNT(*) FROM authorized_employees) = (SELECT COUNT(DISTINCT employee_id) FROM input_lines)
           RETURNING id, run_number, run_type, status
         ), inserted_lines AS (
           INSERT INTO hr.payroll_lines
             (organization_id, payroll_run_id, employee_id, component_code, component_name, component_type, amount)
           SELECT $1::uuid, r.id, l.employee_id, l.component_code, l.component_name, l.component_type, l.amount
           FROM run r CROSS JOIN input_lines l
           JOIN authorized_employees e ON e.id = l.employee_id
           RETURNING id
         )
         SELECT r.id, r.run_number AS "runNumber", r.run_type AS "runType",
                r.status, (SELECT COUNT(*) FROM inserted_lines)::integer AS "lineCount"
         FROM run r`,
        [organizationId, body.payrollPeriodId, body.runNumber, body.runType ?? "regular", JSON.stringify(lines), tenant.membershipId, tenantWide],
      );
      if (!result.rows[0]) { reply(res, 422, { error: "payroll_period_or_employee_scope_invalid" }); return true; }
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : code === "23503" || code === "23514" ? 422 : 500,
        { error: code === "23505" ? "payroll_run_or_component_exists" : code === "23503" ? "payroll_employee_not_found" : code === "23514" ? "payroll_line_invalid" : "payroll_run_create_failed" });
    }
    return true;
  }

  const approveMatch = path.match(/^\/v1\/hr\/payroll\/runs\/([0-9a-f-]{36})\/approve$/i);
  if (approveMatch && req.method === "POST") {
    if (!tenantWide) { reply(res, 403, { error: "payroll_approval_requires_tenant_authority" }); return true; }
    if (!tenant.permissions.includes("hr.payroll.approve")) { reply(res, 403, { error: "permission_required", permission: "hr.payroll.approve" }); return true; }
    const runId = approveMatch[1];
    if (!runId || !UUID.test(runId)) { reply(res, 400, { error: "invalid_payroll_run_id" }); return true; }
    try {
      const result = await pool.query(
        `UPDATE hr.payroll_runs SET status = 'approved', approved_by = $3::uuid
         WHERE organization_id = $1::uuid AND id = $2::uuid AND status = 'draft'
         RETURNING id, run_number AS "runNumber", status, approved_at AS "approvedAt"`,
        [organizationId, runId, userId],
      );
      if (!result.rows[0]) { reply(res, 409, { error: "payroll_run_not_found_or_not_draft" }); return true; }
      reply(res, 200, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23514" ? 422 : 500, { error: code === "23514" ? "payroll_approval_validation_failed" : "payroll_approval_failed" });
    }
    return true;
  }

  const payMatch = path.match(/^\/v1\/hr\/payroll\/runs\/([0-9a-f-]{36})\/pay$/i);
  if (payMatch && req.method === "POST") {
    if (!tenantWide) { reply(res, 403, { error: "payroll_payment_requires_tenant_authority" }); return true; }
    if (!tenant.permissions.includes("hr.payroll.pay")) { reply(res, 403, { error: "permission_required", permission: "hr.payroll.pay" }); return true; }
    const runId = payMatch[1];
    if (!runId || !UUID.test(runId)) { reply(res, 400, { error: "invalid_payroll_run_id" }); return true; }
    try {
      const result = await pool.query(
        `UPDATE hr.payroll_runs SET status = 'paid', paid_by = $3::uuid
         WHERE organization_id = $1::uuid AND id = $2::uuid AND status = 'approved'
         RETURNING id, run_number AS "runNumber", status, paid_at AS "paidAt"`,
        [organizationId, runId, userId],
      );
      if (!result.rows[0]) { reply(res, 409, { error: "payroll_run_not_found_or_not_approved" }); return true; }
      reply(res, 200, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "55000" || code === "23514" ? 409 : 500, { error: code === "55000" ? "payroll_run_immutable" : code === "23514" ? "payroll_payment_transition_invalid" : "payroll_payment_failed" });
    }
    return true;
  }

  if (path.startsWith("/v1/hr/")) { res.setHeader("allow", "GET, POST"); reply(res, 405, { error: "method_not_allowed" }); return true; }
  return false;
}
