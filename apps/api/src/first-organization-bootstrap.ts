import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Json = Record<string, unknown>;

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Json | null> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 8192) return null;
    chunks.push(part);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
  } catch { return null; }
}

export function validateFirstOrganizationInput(value: Json): string | null {
  if (typeof value.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug) || value.slug.length > 80) return "invalid_organization_slug";
  if (typeof value.organizationName !== "string" || value.organizationName.trim().length < 3 || value.organizationName.length > 180) return "invalid_organization_name";
  if (typeof value.campusCode !== "string" || !/^[A-Z0-9_-]{2,24}$/.test(value.campusCode)) return "invalid_campus_code";
  if (typeof value.campusName !== "string" || value.campusName.trim().length < 2 || value.campusName.length > 120) return "invalid_campus_name";
  return null;
}

export async function handleFirstOrganizationBootstrap(
  req: IncomingMessage,
  res: ServerResponse,
  pool: Pick<Pool, "query">,
  userId: string,
  expectedTokenHash: string | undefined,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/v1/bootstrap/organization") return false;
  if (req.method !== "POST") { res.setHeader("allow", "POST"); reply(res, 405, { error: "method_not_allowed" }); return true; }
  if (!UUID.test(userId)) { reply(res, 401, { error: "invalid_identity" }); return true; }
  if (!expectedTokenHash || !/^[a-f0-9]{64}$/i.test(expectedTokenHash)) {
    reply(res, 503, { error: "first_admin_bootstrap_not_configured" }); return true;
  }
  const suppliedToken = req.headers["x-bootstrap-token"];
  if (typeof suppliedToken !== "string" || suppliedToken.length < 24 || suppliedToken.length > 256) {
    reply(res, 403, { error: "bootstrap_token_required" }); return true;
  }
  const expected = Buffer.from(expectedTokenHash, "hex");
  const actual = createHash("sha256").update(suppliedToken, "utf8").digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    reply(res, 403, { error: "invalid_bootstrap_token" }); return true;
  }
  const body = await readJson(req);
  if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
  const validationError = validateFirstOrganizationInput(body);
  if (validationError) { reply(res, 422, { error: validationError }); return true; }

  try {
    const result = await pool.query(
      `WITH bootstrap_lock AS MATERIALIZED (
         SELECT pg_advisory_xact_lock(hashtext('pondok-os-first-organization')::bigint)
       ), owner_role AS MATERIALIZED (
         SELECT id FROM core.roles
         WHERE organization_id IS NULL AND role_key = 'institution_owner' AND is_system = true
       ), created_org AS (
         INSERT INTO core.organizations (slug, name, organization_type, status)
         SELECT $1, $2, 'pesantren', 'active'
         FROM bootstrap_lock CROSS JOIN owner_role
         WHERE NOT EXISTS (SELECT 1 FROM core.organizations)
         RETURNING id
       ), created_campus AS (
         INSERT INTO core.campuses (organization_id, code, name, campus_type, status)
         SELECT id, $3, $4, 'main', 'active' FROM created_org
         RETURNING id, organization_id
       ), created_membership AS (
         INSERT INTO core.organization_memberships (organization_id, user_id, membership_status)
         SELECT id, $5::uuid, 'active' FROM created_org
         RETURNING id, organization_id
       ), assigned_role AS (
         INSERT INTO core.membership_roles (membership_id, role_id)
         SELECT m.id, r.id FROM created_membership m CROSS JOIN owner_role r
         RETURNING membership_id
       ), audit AS (
         INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata)
         SELECT m.organization_id, $5::uuid, 'organization.bootstrap', 'organization',
                m.organization_id::text,
                jsonb_build_object('campus_id', c.id::text, 'membership_id', m.id::text, 'role_key', 'institution_owner')
         FROM created_membership m
         JOIN created_campus c ON c.organization_id = m.organization_id
         JOIN assigned_role ar ON ar.membership_id = m.id
         RETURNING id
       )
       SELECT o.id AS "organizationId", c.id AS "campusId", m.id AS "membershipId"
       FROM created_org o
       JOIN created_campus c ON c.organization_id = o.id
       JOIN created_membership m ON m.organization_id = o.id
       JOIN assigned_role ar ON ar.membership_id = m.id
       CROSS JOIN audit`,
      [body.slug, (body.organizationName as string).trim(), body.campusCode, (body.campusName as string).trim(), userId],
    );
    if (!result.rows[0]) { reply(res, 409, { error: "first_organization_already_initialized_or_owner_role_missing" }); return true; }
    reply(res, 201, { data: result.rows[0], message: "First institution owner initialized. Store the organization ID securely." });
  } catch (reason) {
    const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
    reply(res, code === "23505" ? 409 : code === "23503" ? 422 : 500,
      { error: code === "23505" ? "organization_slug_or_campus_code_exists" : code === "23503" ? "bootstrap_role_or_reference_missing" : "organization_bootstrap_failed" });
  }
  return true;
}
