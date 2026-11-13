import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { loadTenantContext } from "./tenant-access.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16_384;
type Json = Record<string, unknown>;

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() === (month ?? 1) - 1 && date.getUTCDate() === day;
}

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Json | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
  } catch { return null; }
}


const STUDENT_PROFILE_FIELDS: Record<string, number> = {
  fatherName: 160, motherName: 160, guardianName: 160, guardianRelation: 40,
  placeOfBirth: 120, religion: 60, nationality: 80,
  guardianPhone: 32, guardianEmail: 254, homeAddress: 1000, province: 100,
  regency: 100, district: 100, village: 100, postalCode: 10,
  originSchool: 180, previousEducation: 120, entryDate: 10,
  educationTrack: 40, boardingStatus: 24, dormitoryName: 120, roomCode: 40,
  studentCategory: 40, admissionYear: 4
};

export function validateStudentProfileData(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return "invalid_student_profile_data";
  const data = value as Record<string, unknown>;
  for (const [key, raw] of Object.entries(data)) {
    const max = STUDENT_PROFILE_FIELDS[key];
    if (max === undefined) return "unsupported_student_profile_field";
    if (raw !== null && (typeof raw !== "string" || raw.length > max)) return "invalid_student_profile_field";
    if (typeof raw === "string" && raw.trim().length === 0) return "empty_student_profile_field";
  }
  if (data.guardianEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.guardianEmail))) return "invalid_guardian_email";
  if (data.entryDate && (typeof data.entryDate !== "string" || !isValidIsoDate(data.entryDate))) return "invalid_entry_date";
  if (data.admissionYear && !/^20\d{2}$/.test(String(data.admissionYear))) return "invalid_admission_year";
  if (data.educationTrack && !["formal", "muadalah", "nonformal", "salafiyah", "other"].includes(String(data.educationTrack))) return "invalid_education_track";
  if (data.boardingStatus && !["mukim", "non_mukim", "commuter"].includes(String(data.boardingStatus))) return "invalid_boarding_status";
  return null;
}

export function validateStudentUpdateInput(value: Json): string | null {
  const allowed = new Set(["campusId", "studentNumber", "legalName", "preferredName", "birthDate", "genderCode", "profileData"]);
  if (Object.keys(value).length === 0) return "empty_student_update";
  if (Object.keys(value).some((key) => !allowed.has(key))) return "unsupported_student_update_field";
  if (value.campusId !== undefined && (typeof value.campusId !== "string" || !UUID.test(value.campusId))) return "invalid_campus_id";
  if (value.studentNumber !== undefined && (typeof value.studentNumber !== "string" || value.studentNumber.trim().length < 1 || value.studentNumber.trim().length > 64)) return "invalid_student_number";
  if (value.legalName !== undefined && (typeof value.legalName !== "string" || value.legalName.trim().length < 2 || value.legalName.trim().length > 160)) return "invalid_legal_name";
  if (value.preferredName !== undefined && value.preferredName !== null && (typeof value.preferredName !== "string" || value.preferredName.length > 160)) return "invalid_preferred_name";
  if (value.birthDate !== undefined && value.birthDate !== null && (typeof value.birthDate !== "string" || !isValidIsoDate(value.birthDate))) return "invalid_birth_date";
  if (value.genderCode !== undefined && value.genderCode !== null && !["male", "female", "unspecified"].includes(String(value.genderCode))) return "invalid_gender_code";
  return validateStudentProfileData(value.profileData);
}

export function validateStudentInput(value: Json): string | null {
  if (typeof value.campusId !== "string" || !UUID.test(value.campusId)) return "invalid_campus_id";
  if (typeof value.studentNumber !== "string" || value.studentNumber.trim().length < 1 || value.studentNumber.trim().length > 64) return "invalid_student_number";
  if (typeof value.legalName !== "string" || value.legalName.trim().length < 2 || value.legalName.trim().length > 160) return "invalid_legal_name";
  if (value.preferredName !== undefined && value.preferredName !== null && (typeof value.preferredName !== "string" || value.preferredName.length > 160)) return "invalid_preferred_name";
  if (value.birthDate !== undefined && value.birthDate !== null && (typeof value.birthDate !== "string" || !isValidIsoDate(value.birthDate))) return "invalid_birth_date";
  if (value.genderCode !== undefined && value.genderCode !== null && !["male", "female", "unspecified"].includes(String(value.genderCode))) return "invalid_gender_code";
  return null;
}

export async function handleAcademicRequest(req: IncomingMessage, res: ServerResponse, pool: Pick<Pool, "query">, userId: string, organizationId: string): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const collectionPath = url.pathname === "/v1/academic/students";
  const studentMatch = url.pathname.match(/^\/v1\/academic\/students\/([0-9a-f-]{36})$/i);
  if (!collectionPath && !studentMatch) return false;
  const isStudentUpdate = Boolean(studentMatch && req.method === "PATCH");
  if ((collectionPath && req.method !== "GET" && req.method !== "POST")
    || (studentMatch && !isStudentUpdate)) {
    res.setHeader("allow", collectionPath ? "GET, POST" : "PATCH");
    reply(res, 405, { error: "method_not_allowed" }); return true;
  }
  const tenant = await loadTenantContext(pool, userId, organizationId);
  if (!tenant) { reply(res, 403, { error: "active_membership_required" }); return true; }

  if (req.method === "GET") {
    if (!tenant.permissions.includes("academic.students.read")) {
      reply(res, 403, { error: "permission_required", permission: "academic.students.read" }); return true;
    }
    const rawLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;
    const search = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const status = url.searchParams.get("status");
    const values: unknown[] = [organizationId, `%${search.replace(/[\\\\%_]/g, "\\\\$&")}%`];
    let statusClause = "";
    if (status && ["applicant", "active", "graduated", "withdrawn", "suspended"].includes(status)) {
      values.push(status); statusClause = `AND sp.status = $${values.length}`;
    }
    values.push(limit);
    const result = await pool.query(
      `SELECT sp.id, sp.campus_id AS "campusId", sp.student_number AS "studentNumber",
              sp.legal_name AS "legalName", sp.preferred_name AS "preferredName",
              sp.birth_date AS "birthDate", sp.gender_code AS "genderCode",
              sp.profile_data AS "profileData", sp.status, sp.created_at AS "createdAt"
       FROM academic.student_profiles sp
       WHERE sp.organization_id = $1
         AND ($2 = '%%' OR sp.student_number ILIKE $2 OR sp.legal_name ILIKE $2)
         ${statusClause}
       ORDER BY sp.created_at DESC LIMIT $${values.length}`, values,
    );
    reply(res, 200, { data: result.rows, pagination: { limit, returned: result.rows.length } }); return true;
  }

  if (isStudentUpdate) {
    if (!tenant.permissions.includes("academic.students.update")) {
      reply(res, 403, { error: "permission_required", permission: "academic.students.update" }); return true;
    }
    const studentId = studentMatch?.[1];
    if (!studentId || !UUID.test(studentId)) { reply(res, 400, { error: "invalid_student_id" }); return true; }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const validationError = validateStudentUpdateInput(body);
    if (validationError) { reply(res, 422, { error: validationError }); return true; }
    const values: unknown[] = [organizationId, studentId];
    const set: string[] = [];
    const fields: Array<[string, string, boolean]> = [
      ["campusId", "campus_id", false], ["studentNumber", "student_number", false],
      ["legalName", "legal_name", false], ["preferredName", "preferred_name", true],
      ["birthDate", "birth_date", true], ["genderCode", "gender_code", true]
    ];
    for (const [key, column, nullable] of fields) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        values.push(body[key] === null ? null : (typeof body[key] === "string" && ["studentNumber", "legalName"].includes(key) ? (body[key] as string).trim() : body[key]));
        const cast = key === "campusId" ? "::uuid" : key === "birthDate" ? "::date" : "";
        set.push(`${column} = ${values.length}${cast}`);
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "profileData")) {
      values.push(JSON.stringify(body.profileData));
      set.push(`profile_data = profile_data || ${values.length}::jsonb`);
    }
    set.push("updated_at = now()");
    try {
      const result = await pool.query(
        `UPDATE academic.student_profiles SET ${set.join(", ")}
         WHERE organization_id = $1::uuid AND id = $2::uuid
         RETURNING id, campus_id AS "campusId", student_number AS "studentNumber",
                   legal_name AS "legalName", preferred_name AS "preferredName",
                   birth_date AS "birthDate", gender_code AS "genderCode",
                   profile_data AS "profileData", status, created_at AS "createdAt", updated_at AS "updatedAt"`,
        values,
      );
      if (!result.rows[0]) { reply(res, 404, { error: "student_not_found" }); return true; }
      reply(res, 200, { data: result.rows[0] });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
      if (code === "23505") reply(res, 409, { error: "student_number_already_exists" });
      else if (code === "23503") reply(res, 422, { error: "campus_not_found_in_organization" });
      else reply(res, 500, { error: "student_update_failed" });
    }
    return true;
  }

  if (!tenant.permissions.includes("academic.students.create")) {
    reply(res, 403, { error: "permission_required", permission: "academic.students.create" }); return true;
  }
  const body = await readJson(req);
  if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
  const validationError = validateStudentInput(body) ?? validateStudentProfileData(body.profileData);
  if (validationError) { reply(res, 422, { error: validationError }); return true; }
  try {
    const result = await pool.query(
      `INSERT INTO academic.student_profiles
         (organization_id, campus_id, student_number, legal_name, preferred_name, birth_date, gender_code, profile_data)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::date, $7, $8::jsonb)
       RETURNING id, campus_id AS "campusId", student_number AS "studentNumber",
                 legal_name AS "legalName", preferred_name AS "preferredName",
                 birth_date AS "birthDate", gender_code AS "genderCode", profile_data AS "profileData", status,
                 created_at AS "createdAt"`,
      [organizationId, body.campusId, (body.studentNumber as string).trim(), (body.legalName as string).trim(),
       body.preferredName ?? null, body.birthDate ?? null, body.genderCode ?? null, JSON.stringify(body.profileData ?? {})],
    );
    reply(res, 201, { data: result.rows[0] });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
    if (code === "23505") reply(res, 409, { error: "student_number_already_exists" });
    else if (code === "23503") reply(res, 422, { error: "campus_not_found_in_organization" });
    else reply(res, 500, { error: "student_create_failed" });
  }
  return true;
}
