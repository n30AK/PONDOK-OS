import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { loadTenantContext } from "./tenant-access.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 16_384;
type Json = Record<string, unknown>;

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

export function validateStudentInput(value: Json): string | null {
  if (typeof value.campusId !== "string" || !UUID.test(value.campusId)) return "invalid_campus_id";
  if (typeof value.studentNumber !== "string" || value.studentNumber.trim().length < 1 || value.studentNumber.trim().length > 64) return "invalid_student_number";
  if (typeof value.legalName !== "string" || value.legalName.trim().length < 2 || value.legalName.trim().length > 160) return "invalid_legal_name";
  if (value.preferredName !== undefined && value.preferredName !== null && (typeof value.preferredName !== "string" || value.preferredName.length > 160)) return "invalid_preferred_name";
  if (value.birthDate !== undefined && value.birthDate !== null && (typeof value.birthDate !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value.birthDate))) return "invalid_birth_date";
  if (value.genderCode !== undefined && value.genderCode !== null && !["male", "female", "unspecified"].includes(String(value.genderCode))) return "invalid_gender_code";
  return null;
}

export async function handleAcademicRequest(req: IncomingMessage, res: ServerResponse, pool: Pick<Pool, "query">, userId: string, organizationId: string): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/v1/academic/students") return false;
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("allow", "GET, POST"); reply(res, 405, { error: "method_not_allowed" }); return true;
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
              sp.status, sp.created_at AS "createdAt"
       FROM academic.student_profiles sp
       WHERE sp.organization_id = $1
         AND ($2 = '%%' OR sp.student_number ILIKE $2 OR sp.legal_name ILIKE $2)
         ${statusClause}
       ORDER BY sp.created_at DESC LIMIT $${values.length}`, values,
    );
    reply(res, 200, { data: result.rows, pagination: { limit, returned: result.rows.length } }); return true;
  }

  if (!tenant.permissions.includes("academic.students.create")) {
    reply(res, 403, { error: "permission_required", permission: "academic.students.create" }); return true;
  }
  const body = await readJson(req);
  if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
  const validationError = validateStudentInput(body);
  if (validationError) { reply(res, 422, { error: validationError }); return true; }
  try {
    const result = await pool.query(
      `INSERT INTO academic.student_profiles
         (organization_id, campus_id, student_number, legal_name, preferred_name, birth_date, gender_code)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::date, $7)
       RETURNING id, campus_id AS "campusId", student_number AS "studentNumber",
                 legal_name AS "legalName", preferred_name AS "preferredName",
                 birth_date AS "birthDate", gender_code AS "genderCode", status,
                 created_at AS "createdAt"`,
      [organizationId, body.campusId, (body.studentNumber as string).trim(), (body.legalName as string).trim(),
       body.preferredName ?? null, body.birthDate ?? null, body.genderCode ?? null],
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
