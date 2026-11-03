import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TenantDatabase } from "./tenant-db.js";

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

/**
 * Creates the first tenant in ordered statements inside one transaction.
 * The membership authority table intentionally has no RLS policy, so the
 * owner membership must exist before tenant-scoped campus/audit writes run.
 * After membership creation, transaction-local context satisfies FORCE RLS.
 */
export async function handleFirstOrganizationBootstrap(
  req: IncomingMessage,
  res: ServerResponse,
  pool: TenantDatabase,
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
  if (!pool.connect) { reply(res, 503, { error: "bootstrap_transaction_unavailable" }); return true; }

  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext('pondok-os-first-organization')::bigint)");

    const existing = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM core.organizations) AS exists",
    );
    if (existing.rows[0]?.exists) {
      await client.query("ROLLBACK");
      inTransaction = false;
      reply(res, 409, { error: "first_organization_already_initialized" });
      return true;
    }

    const ownerRole = await client.query<{ id: string }>(
      "SELECT id FROM core.roles WHERE organization_id IS NULL AND role_key = 'institution_owner' AND is_system = true LIMIT 1",
    );
    const roleId = ownerRole.rows[0]?.id;
    if (!roleId) {
      await client.query("ROLLBACK");
      inTransaction = false;
      reply(res, 409, { error: "first_organization_owner_role_missing" });
      return true;
    }

    const organization = await client.query<{ id: string }>(
      "INSERT INTO core.organizations (slug, name, organization_type, status) VALUES ($1, $2, 'pesantren', 'active') RETURNING id",
      [body.slug, (body.organizationName as string).trim()],
    );
    const organizationId = organization.rows[0]?.id;
    if (!organizationId) throw new Error("Organization creation returned no ID");

    // This table is the membership authority and is intentionally excluded
    // from tenant RLS to avoid recursive policy evaluation.
    const membership = await client.query<{ id: string }>(
      "INSERT INTO core.organization_memberships (organization_id, user_id, membership_status) VALUES ($1::uuid, $2::uuid, 'active') RETURNING id",
      [organizationId, userId],
    );
    const membershipId = membership.rows[0]?.id;
    if (!membershipId) throw new Error("Owner membership creation returned no ID");

    // Subsequent organization-owned inserts are protected by FORCE RLS.
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)",
      [userId, organizationId],
    );

    const campus = await client.query<{ id: string }>(
      "INSERT INTO core.campuses (organization_id, code, name, campus_type, status) VALUES ($1::uuid, $2, $3, 'main', 'active') RETURNING id",
      [organizationId, body.campusCode, (body.campusName as string).trim()],
    );
    const campusId = campus.rows[0]?.id;
    if (!campusId) throw new Error("Main campus creation returned no ID");

    await client.query(
      "INSERT INTO core.membership_roles (membership_id, role_id) VALUES ($1::uuid, $2::uuid)",
      [membershipId, roleId],
    );
    await client.query(
      `INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1::uuid, $2::uuid, 'organization.bootstrap', 'organization', $3,
         jsonb_build_object('campus_id', $4::text, 'membership_id', $5::text, 'role_key', 'institution_owner'))`,
      [organizationId, userId, organizationId, campusId, membershipId],
    );

    await client.query("COMMIT");
    inTransaction = false;
    reply(res, 201, {
      data: { organizationId, campusId, membershipId },
      message: "First institution owner initialized. Store the organization ID securely.",
    });
  } catch (reason) {
    if (inTransaction) await client.query("ROLLBACK").catch(() => undefined);
    const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
    reply(res, code === "23505" ? 409 : code === "23503" ? 422 : 500,
      { error: code === "23505" ? "organization_slug_or_campus_code_exists" : code === "23503" ? "bootstrap_role_or_reference_missing" : "organization_bootstrap_failed" });
  } finally {
    client.release();
  }
  return true;
}
