import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { loadTenantContext } from "./tenant-access.js";
import { validateStudentProfileData } from "./academic.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Json = Record<string, unknown>;

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Json | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 32_768) return null;
    chunks.push(part);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
  } catch { return null; }
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 1) - 1 && date.getUTCDate() === day;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}

function plainObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateAdmissionPeriodInput(value: Json): string | null {
  if (typeof value.periodCode !== "string" || !/^[A-Za-z0-9._/-]{1,32}$/.test(value.periodCode)) return "invalid_period_code";
  if (typeof value.name !== "string" || value.name.trim().length < 2 || value.name.length > 140) return "invalid_period_name";
  if (!validTimestamp(value.opensAt) || !validTimestamp(value.closesAt) || Date.parse(value.closesAt) <= Date.parse(value.opensAt)) return "invalid_period_window";
  if (value.campusId !== undefined && value.campusId !== null && (typeof value.campusId !== "string" || !UUID.test(value.campusId))) return "invalid_campus_id";
  if (value.academicYearId !== undefined && value.academicYearId !== null && (typeof value.academicYearId !== "string" || !UUID.test(value.academicYearId))) return "invalid_academic_year_id";
  return null;
}

export function validateApplicationInput(value: Json): string | null {
  if (typeof value.admissionPeriodId !== "string" || !UUID.test(value.admissionPeriodId)) return "invalid_admission_period_id";
  if (typeof value.applicationNumber !== "string" || !/^[A-Za-z0-9._/-]{1,64}$/.test(value.applicationNumber)) return "invalid_application_number";
  if (typeof value.applicantName !== "string" || value.applicantName.trim().length < 2 || value.applicantName.length > 180) return "invalid_applicant_name";
  if (value.applicantBirthDate !== undefined && value.applicantBirthDate !== null && !validDate(value.applicantBirthDate)) return "invalid_applicant_birth_date";
  if (value.applicantGenderCode !== undefined && value.applicantGenderCode !== null && !["male", "female", "unspecified"].includes(String(value.applicantGenderCode))) return "invalid_applicant_gender_code";
  if (value.previousSchool !== undefined && value.previousSchool !== null && (typeof value.previousSchool !== "string" || value.previousSchool.length > 180)) return "invalid_previous_school";
  if (typeof value.guardianName !== "string" || value.guardianName.trim().length < 2 || value.guardianName.length > 180) return "invalid_guardian_name";
  if (typeof value.guardianPhone !== "string" || value.guardianPhone.trim().length < 6 || value.guardianPhone.length > 32) return "invalid_guardian_phone";
  if (value.guardianEmail !== undefined && value.guardianEmail !== null && (typeof value.guardianEmail !== "string" || value.guardianEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.guardianEmail))) return "invalid_guardian_email";
  if (value.desiredProgramId !== undefined && value.desiredProgramId !== null && (typeof value.desiredProgramId !== "string" || !UUID.test(value.desiredProgramId))) return "invalid_desired_program_id";
  if (value.address !== undefined && !plainObject(value.address)) return "invalid_address";
  if (value.answers !== undefined && !plainObject(value.answers)) return "invalid_answers";
  const address = (value.address ?? {}) as Json;
  const allowedAddress = new Set(["street", "province", "regency", "district", "village", "postalCode"]);
  if (Object.keys(address).some((key) => !allowedAddress.has(key)) || Object.values(address).some((v) => v !== null && (typeof v !== "string" || v.length > 500))) return "invalid_address_fields";
  const answers = (value.answers ?? {}) as Json;
  const allowedAnswers = new Set(["educationTrack", "boardingInterest", "motivation", "otherInformation"]);
  if (Object.keys(answers).some((key) => !allowedAnswers.has(key)) || Object.values(answers).some((v) => v !== null && (typeof v !== "string" || v.length > 1000))) return "invalid_application_answers";
  return null;
}

export function validateApplicationReviewInput(value: Json): string | null {
  if (!["accepted", "waitlisted", "rejected", "needs_information"].includes(String(value.decision))) return "invalid_review_decision";
  if (value.notes !== undefined && value.notes !== null && (typeof value.notes !== "string" || value.notes.length > 2000)) return "invalid_review_notes";
  return null;
}


export function validateEnrollmentConversionInput(value: Json): string | null {
  if (typeof value.campusId !== "string" || !UUID.test(value.campusId)) return "invalid_campus_id";
  if (typeof value.studentNumber !== "string" || value.studentNumber.trim().length < 1 || value.studentNumber.trim().length > 64) return "invalid_student_number";
  return null;
}

export async function handleAdmissionsRequest(
  req: IncomingMessage, res: ServerResponse, pool: Pick<Pool, "query">, userId: string, organizationId: string,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (!path.startsWith("/v1/admissions/")) return false;
  const tenant = await loadTenantContext(pool, userId, organizationId);
  if (!tenant) { reply(res, 403, { error: "active_membership_required" }); return true; }

  if (path === "/v1/admissions/periods" && req.method === "GET") {
    if (!tenant.permissions.includes("admissions.periods.manage") && !tenant.permissions.includes("admissions.applications.read")) {
      reply(res, 403, { error: "permission_required", permission: "admissions.periods.manage" }); return true;
    }
    const result = await pool.query(
      `SELECT id, campus_id AS "campusId", academic_year_id AS "academicYearId",
              period_code AS "periodCode", name, opens_at AS "opensAt", closes_at AS "closesAt",
              period_status AS status, created_at AS "createdAt"
       FROM admissions.admission_periods WHERE organization_id = $1::uuid
       ORDER BY opens_at DESC LIMIT 100`, [organizationId],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/admissions/periods" && req.method === "POST") {
    if (!tenant.permissions.includes("admissions.periods.manage")) { reply(res, 403, { error: "permission_required", permission: "admissions.periods.manage" }); return true; }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const error = validateAdmissionPeriodInput(body);
    if (error) { reply(res, 422, { error }); return true; }
    try {
      const result = await pool.query(
        `INSERT INTO admissions.admission_periods
           (organization_id, campus_id, academic_year_id, period_code, name, opens_at, closes_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::timestamptz, $7::timestamptz)
         RETURNING id, period_code AS "periodCode", name, opens_at AS "opensAt",
                   closes_at AS "closesAt", period_status AS status`,
        [organizationId, body.campusId ?? null, body.academicYearId ?? null, body.periodCode, (body.name as string).trim(), body.opensAt, body.closesAt],
      );
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : code === "23503" ? 422 : 500,
        { error: code === "23505" ? "admission_period_code_exists" : code === "23503" ? "campus_or_academic_year_not_found" : "admission_period_create_failed" });
    }
    return true;
  }

  const periodOpenMatch = path.match(/^\/v1\/admissions\/periods\/([0-9a-f-]{36})\/open$/i);
  if (periodOpenMatch && req.method === "POST") {
    if (!tenant.permissions.includes("admissions.periods.manage")) { reply(res, 403, { error: "permission_required", permission: "admissions.periods.manage" }); return true; }
    const result = await pool.query(
      `UPDATE admissions.admission_periods
       SET period_status = 'open'
       WHERE organization_id = $1::uuid AND id = $2::uuid
         AND period_status = 'draft' AND now() BETWEEN opens_at AND closes_at
       RETURNING id, period_code AS "periodCode", period_status AS status`,
      [organizationId, periodOpenMatch[1]],
    );
    if (!result.rows[0]) { reply(res, 409, { error: "period_not_found_or_outside_opening_window" }); return true; }
    reply(res, 200, { data: result.rows[0] }); return true;
  }

  const periodCloseMatch = path.match(/^\/v1\/admissions\/periods\/([0-9a-f-]{36})\/close$/i);
  if (periodCloseMatch && req.method === "POST") {
    if (!tenant.permissions.includes("admissions.periods.manage")) { reply(res, 403, { error: "permission_required", permission: "admissions.periods.manage" }); return true; }
    const result = await pool.query(
      `UPDATE admissions.admission_periods
       SET period_status = 'closed'
       WHERE organization_id = $1::uuid AND id = $2::uuid AND period_status = 'open'
       RETURNING id, period_code AS "periodCode", period_status AS status`,
      [organizationId, periodCloseMatch[1]],
    );
    if (!result.rows[0]) { reply(res, 409, { error: "period_not_found_or_not_open" }); return true; }
    reply(res, 200, { data: result.rows[0] }); return true;
  }

  if (path === "/v1/admissions/applications" && req.method === "GET") {
    if (!tenant.permissions.includes("admissions.applications.read")) { reply(res, 403, { error: "permission_required", permission: "admissions.applications.read" }); return true; }
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const status = url.searchParams.get("status");
    const allowedStatuses = new Set(["draft", "submitted", "under_review", "accepted", "waitlisted", "rejected", "withdrawn", "enrolled"]);
    if (status && !allowedStatuses.has(status)) { reply(res, 400, { error: "invalid_application_status" }); return true; }
    const canViewSensitive = tenant.permissions.includes("admissions.applications.review") || tenant.permissions.includes("admissions.applications.documents");
    const values: unknown[] = [organizationId, canViewSensitive];
    const statusClause = status ? (values.push(status), `AND a.application_status = $3`) : "";
    values.push(limit);
    const result = await pool.query(
      `SELECT a.id, a.admission_period_id AS "admissionPeriodId", p.name AS "periodName",
              a.application_number AS "applicationNumber", a.applicant_name AS "applicantName",
              a.applicant_birth_date AS "applicantBirthDate", a.applicant_gender_code AS "applicantGenderCode",
              a.previous_school AS "previousSchool", a.desired_program_id AS "desiredProgramId",
              CASE WHEN $2::boolean THEN a.guardian_name ELSE NULL END AS "guardianName",
              CASE WHEN $2::boolean THEN a.guardian_email ELSE NULL END AS "guardianEmail",
              CASE WHEN $2::boolean THEN a.guardian_phone ELSE NULL END AS "guardianPhone",
              CASE WHEN $2::boolean THEN a.address ELSE '{}'::jsonb END AS address,
              CASE WHEN $2::boolean THEN a.answers ELSE '{}'::jsonb END AS answers,
              a.application_status AS status, a.submitted_at AS "submittedAt",
              a.reviewed_at AS "reviewedAt", a.linked_student_id AS "linkedStudentId",
              a.created_at AS "createdAt"
       FROM admissions.applications a
       JOIN admissions.admission_periods p ON p.organization_id = a.organization_id AND p.id = a.admission_period_id
       WHERE a.organization_id = $1::uuid ${statusClause}
       ORDER BY a.created_at DESC LIMIT $${values.length}`, values,
    );
    reply(res, 200, { data: result.rows, pagination: { limit, returned: result.rows.length } }); return true;
  }

  if (path === "/v1/admissions/applications" && req.method === "POST") {
    if (!tenant.permissions.includes("admissions.applications.review")) { reply(res, 403, { error: "permission_required", permission: "admissions.applications.review" }); return true; }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const error = validateApplicationInput(body);
    if (error) { reply(res, 422, { error }); return true; }
    try {
      const result = await pool.query(
        `INSERT INTO admissions.applications
           (organization_id, admission_period_id, application_number, applicant_name,
            applicant_birth_date, applicant_gender_code, previous_school, desired_program_id,
            guardian_name, guardian_email, guardian_phone, address, answers)
         SELECT $1::uuid, p.id, $3, $4, $5::date, $6, $7, $8::uuid, $9, $10, $11, $12::jsonb, $13::jsonb
         FROM admissions.admission_periods p
         WHERE p.organization_id = $1::uuid AND p.id = $2::uuid
           AND p.period_status IN ('draft', 'open')
         RETURNING id, application_number AS "applicationNumber", applicant_name AS "applicantName",
                   application_status AS status, created_at AS "createdAt"`,
        [organizationId, body.admissionPeriodId, body.applicationNumber, (body.applicantName as string).trim(),
         body.applicantBirthDate ?? null, body.applicantGenderCode ?? null, body.previousSchool ?? null,
         body.desiredProgramId ?? null, (body.guardianName as string).trim(), body.guardianEmail ?? null,
         (body.guardianPhone as string).trim(), JSON.stringify(body.address ?? {}), JSON.stringify(body.answers ?? {})],
      );
      if (!result.rows[0]) { reply(res, 422, { error: "admission_period_not_found_or_not_accepting_drafts" }); return true; }
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : code === "23503" ? 422 : 500,
        { error: code === "23505" ? "application_number_exists" : code === "23503" ? "program_or_period_not_found" : "application_create_failed" });
    }
    return true;
  }

  const submitMatch = path.match(/^\/v1\/admissions\/applications\/([0-9a-f-]{36})\/submit$/i);
  if (submitMatch && req.method === "POST") {
    if (!tenant.permissions.includes("admissions.applications.read")) { reply(res, 403, { error: "permission_required", permission: "admissions.applications.read" }); return true; }
    const applicationId = submitMatch[1];
    const result = await pool.query(
      `UPDATE admissions.applications a SET application_status = 'submitted', submitted_at = now(), updated_at = now()
       FROM admissions.admission_periods p
       WHERE a.organization_id = $1::uuid AND a.id = $2::uuid AND a.application_status = 'draft'
         AND p.organization_id = a.organization_id AND p.id = a.admission_period_id
         AND p.period_status = 'open' AND now() BETWEEN p.opens_at AND p.closes_at
       RETURNING a.id, a.application_number AS "applicationNumber", a.application_status AS status, a.submitted_at AS "submittedAt"`,
      [organizationId, applicationId],
    );
    if (!result.rows[0]) { reply(res, 409, { error: "application_not_draft_or_period_not_open" }); return true; }
    reply(res, 200, { data: result.rows[0] }); return true;
  }

  const reviewMatch = path.match(/^\/v1\/admissions\/applications\/([0-9a-f-]{36})\/review$/i);
  if (reviewMatch && req.method === "POST") {
    if (!tenant.permissions.includes("admissions.applications.review")) { reply(res, 403, { error: "permission_required", permission: "admissions.applications.review" }); return true; }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const error = validateApplicationReviewInput(body);
    if (error) { reply(res, 422, { error }); return true; }
    const applicationId = reviewMatch[1];
    const nextStatus = body.decision === "needs_information" ? "under_review" : body.decision;
    const result = await pool.query(
      `WITH updated AS (
         UPDATE admissions.applications SET application_status = $3, reviewed_at = now(), reviewed_by = $4::uuid, updated_at = now()
         WHERE organization_id = $1::uuid AND id = $2::uuid AND application_status IN ('submitted', 'under_review')
         RETURNING id
       ), review AS (
         INSERT INTO admissions.application_reviews (organization_id, application_id, reviewer_id, decision, notes)
         SELECT $1::uuid, id, $4::uuid, $5, $6 FROM updated RETURNING id
       )
       SELECT u.id, $3::text AS status, r.id AS "reviewId"
       FROM updated u CROSS JOIN review r`,
      [organizationId, applicationId, nextStatus, userId, body.decision, body.notes ?? null],
    );
    if (!result.rows[0]) { reply(res, 409, { error: "application_not_found_or_not_reviewable" }); return true; }
    reply(res, 200, { data: result.rows[0] }); return true;
  }


  const enrollMatch = path.match(/^\\/v1\\/admissions\\/applications\\/([0-9a-f-]{36})\\/enroll$/i);
  if (enrollMatch && req.method === "POST") {
    if (!tenant.permissions.includes("admissions.applications.review")) {
      reply(res, 403, { error: "permission_required", permission: "admissions.applications.review" }); return true;
    }
    if (!tenant.permissions.includes("academic.students.create")) {
      reply(res, 403, { error: "permission_required", permission: "academic.students.create" }); return true;
    }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const validationError = validateEnrollmentConversionInput(body);
    if (validationError) { reply(res, 422, { error: validationError }); return true; }
    try {
      const result = await pool.query(
        `WITH candidate AS MATERIALIZED (
           SELECT id, applicant_name, applicant_birth_date, applicant_gender_code, previous_school,
                  guardian_name, guardian_email, guardian_phone, address, answers
           FROM admissions.applications
           WHERE organization_id = $1::uuid AND id = $2::uuid
             AND application_status = 'accepted' AND linked_student_id IS NULL
           FOR UPDATE
         ), created_student AS (
           INSERT INTO academic.student_profiles
             (organization_id, campus_id, student_number, legal_name, birth_date, gender_code, profile_data, status)
           SELECT $1::uuid, $3::uuid, $4, c.applicant_name, c.applicant_birth_date,
                  c.applicant_gender_code,
                  jsonb_strip_nulls(jsonb_build_object(
                    'guardianName', c.guardian_name,
                    'guardianPhone', c.guardian_phone,
                    'guardianEmail', c.guardian_email,
                    'province', c.address->>'province',
                    'regency', c.address->>'regency',
                    'district', c.address->>'district',
                    'village', c.address->>'village',
                    'postalCode', c.address->>'postalCode',
                    'originSchool', c.previous_school,
                    'educationTrack', CASE WHEN c.answers->>'educationTrack' IN ('formal','muadalah','nonformal','salafiyah','other') THEN c.answers->>'educationTrack' END,
                    'boardingStatus', CASE WHEN c.answers->>'boardingInterest' IN ('mukim','non_mukim') THEN c.answers->>'boardingInterest' END
                  )),
                  'applicant'
           FROM candidate c
           RETURNING id, student_number AS "studentNumber", legal_name AS "legalName", status
         ), linked AS (
           UPDATE admissions.applications a
           SET linked_student_id = s.id, updated_at = now()
           FROM candidate c CROSS JOIN created_student s
           WHERE a.organization_id = $1::uuid AND a.id = c.id AND a.linked_student_id IS NULL
           RETURNING a.id AS "applicationId", a.linked_student_id AS "studentId"
         )
         SELECT linked."applicationId", linked."studentId", created_student."studentNumber",
                created_student."legalName", created_student.status AS "studentStatus"
         FROM linked CROSS JOIN created_student`,
        [organizationId, enrollMatch[1], body.campusId, (body.studentNumber as string).trim()],
      );
      if (!result.rows[0]) {
        const existing = await pool.query(
          `SELECT application_status AS status, linked_student_id AS "linkedStudentId"
           FROM admissions.applications WHERE organization_id = $1::uuid AND id = $2::uuid`,
          [organizationId, enrollMatch[1]],
        );
        if (!existing.rows[0]) { reply(res, 404, { error: "application_not_found" }); return true; }
        if (existing.rows[0].linkedStudentId) {
          reply(res, 409, { error: "application_already_converted", studentId: existing.rows[0].linkedStudentId }); return true;
        }
        reply(res, 409, { error: "application_must_be_accepted_before_conversion", status: existing.rows[0].status }); return true;
      }
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : code === "23503" ? 422 : 500,
        { error: code === "23505" ? "student_number_already_exists" : code === "23503" ? "campus_not_found_in_organization" : "application_conversion_failed" });
    }
    return true;
  }

  if (path.startsWith("/v1/admissions/")) { res.setHeader("allow", "GET, POST"); reply(res, 405, { error: "method_not_allowed" }); return true; }
  return false;
}
