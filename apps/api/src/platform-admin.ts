import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { TenantDatabase } from "./tenant-db.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Json = Record<string, unknown>;
type QueryClient = { query<T = unknown>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> ; release(): void };

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Json | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > 16_384) return null;
    chunks.push(part);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
  } catch { return null; }
}

export function validateActivationRequest(value: Json): string | null {
  if (typeof value.contactEmail !== "string" || value.contactEmail.trim().length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contactEmail.trim())) return "invalid_contact_email";
  if (typeof value.contactName !== "string" || value.contactName.trim().length < 2 || value.contactName.length > 120) return "invalid_contact_name";
  if (typeof value.organizationName !== "string" || value.organizationName.trim().length < 3 || value.organizationName.length > 180) return "invalid_organization_name";
  if (typeof value.organizationSlug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.organizationSlug) || value.organizationSlug.length > 80) return "invalid_organization_slug";
  if (typeof value.organizationType !== "string" || !["pesantren","madrasah","sekolah","yayasan","other"].includes(value.organizationType)) return "invalid_organization_type";
  if (typeof value.campusCode !== "string" || !/^[A-Z0-9_-]{2,24}$/.test(value.campusCode)) return "invalid_campus_code";
  if (typeof value.campusName !== "string" || value.campusName.trim().length < 2 || value.campusName.length > 120) return "invalid_campus_name";
  return null;
}

async function isSuperAdmin(pool: TenantDatabase, userId: string): Promise<boolean> {
  const result = await pool.query<{ allowed: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM platform.super_admins WHERE user_id = $1::uuid AND status = 'active') AS allowed",
    [userId],
  );
  return result.rows[0]?.allowed === true;
}

async function auditPlatform(client: Pick<QueryClient, "query">, actor: string, action: string, resourceType: string, resourceId: string | null, metadata: Json = {}): Promise<void> {
  await client.query(
    "INSERT INTO platform.audit_events (actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid, $2, $3, $4, $5::jsonb)",
    [actor, action, resourceType, resourceId, JSON.stringify(metadata)],
  );
}

export async function handlePlatformRequest(
  req: IncomingMessage, res: ServerResponse, pool: TenantDatabase, userId: string,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (!path.startsWith("/v1/platform/")) return false;

  if (path === "/v1/platform/admin/me" && req.method === "GET") {
    try {
      const allowed = await isSuperAdmin(pool, userId);
      reply(res, 200, { data: { isSuperAdmin: allowed } });
    } catch {
      reply(res, 503, { error: "platform_control_plane_not_installed" });
    }
    return true;
  }

  if (path === "/v1/platform/activation-requests" && req.method === "POST") {
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const validation = validateActivationRequest(body);
    if (validation) { reply(res, 422, { error: validation }); return true; }
    try {
      const result = await pool.query(
        `INSERT INTO platform.activation_requests
          (requested_by, contact_email, contact_name, organization_name, organization_slug,
           organization_type, campus_code, campus_name)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, status, created_at AS "createdAt"`,
        [userId, (body.contactEmail as string).trim().toLowerCase(), (body.contactName as string).trim(),
          (body.organizationName as string).trim(), body.organizationSlug, body.organizationType,
          body.campusCode, (body.campusName as string).trim()],
      );
      await pool.query(
        "INSERT INTO platform.audit_events (actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid, 'activation.requested', 'activation_request', $2, '{}'::jsonb)",
        [userId, result.rows[0]?.id],
      );
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      if (code === "23505") {
        const existing = await pool.query(
          "SELECT id, status, created_at AS \"createdAt\" FROM platform.activation_requests WHERE requested_by = $1::uuid AND status IN ('pending','approved') ORDER BY created_at DESC LIMIT 1",
          [userId],
        );
        reply(res, 409, { error: "activation_request_already_open", data: existing.rows[0] ?? null });
      } else if (code === "42P01" || code === "3F000") reply(res, 503, { error: "platform_control_plane_not_installed" });
      else reply(res, 500, { error: "activation_request_failed" });
    }
    return true;
  }

  if (path === "/v1/platform/activation-requests/mine" && req.method === "GET") {
    try {
      const result = await pool.query(
        `SELECT id, contact_email AS "contactEmail", contact_name AS "contactName",
                organization_name AS "organizationName", organization_slug AS "organizationSlug",
                organization_type AS "organizationType", campus_code AS "campusCode",
                campus_name AS "campusName", status, review_note AS "reviewNote",
                created_at AS "createdAt", reviewed_at AS "reviewedAt"
         FROM platform.activation_requests WHERE requested_by = $1::uuid
         ORDER BY created_at DESC LIMIT 20`,
        [userId],
      );
      reply(res, 200, { data: result.rows });
    } catch { reply(res, 503, { error: "platform_control_plane_not_installed" }); }
    return true;
  }

  if (path.startsWith("/v1/platform/admin/")) {
    let allowed = false;
    try { allowed = await isSuperAdmin(pool, userId); }
    catch { reply(res, 503, { error: "platform_control_plane_not_installed" }); return true; }
    if (!allowed) { reply(res, 403, { error: "platform_super_admin_required" }); return true; }

    if (path === "/v1/platform/admin/activation-requests" && req.method === "GET") {
      const status = url.searchParams.get("status");
      const validStatus = status && ["pending","approved","rejected","activated","cancelled"].includes(status) ? status : null;
      const result = await pool.query(
        `SELECT id, requested_by AS "requestedBy", contact_email AS "contactEmail",
                contact_name AS "contactName", organization_name AS "organizationName",
                organization_slug AS "organizationSlug", organization_type AS "organizationType",
                campus_code AS "campusCode", campus_name AS "campusName", status,
                reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt",
                review_note AS "reviewNote", created_at AS "createdAt"
         FROM platform.activation_requests
         WHERE ($1::text IS NULL OR status = $1)
         ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at ASC
         LIMIT 200`,
        [validStatus],
      );
      reply(res, 200, { data: result.rows });
      return true;
    }

    const approve = path.match(/^\/v1\/platform\/admin\/activation-requests\/([0-9a-f-]{36})\/approve$/i);
    if (approve && req.method === "POST") {
      const requestId = approve[1]!;
      if (!UUID.test(requestId)) { reply(res, 400, { error: "invalid_activation_request_id" }); return true; }
      if (!pool.connect) { reply(res, 503, { error: "platform_transaction_unavailable" }); return true; }
      const client = await pool.connect() as QueryClient;
      let transaction = false;
      try {
        await client.query("BEGIN"); transaction = true;
        const locked = await client.query<{ id: string; requested_by: string; status: string }>(
          "SELECT id, requested_by, status FROM platform.activation_requests WHERE id = $1::uuid FOR UPDATE",
          [requestId],
        );
        const request = locked.rows[0];
        if (!request) { await client.query("ROLLBACK"); transaction = false; reply(res, 404, { error: "activation_request_not_found" }); return true; }
        if (request.status !== "pending") { await client.query("ROLLBACK"); transaction = false; reply(res, 409, { error: "activation_request_not_pending" }); return true; }
        const rawToken = randomBytes(32).toString("base64url");
        const digest = createHash("sha256").update(rawToken, "utf8").digest();
        await client.query(
          "INSERT INTO platform.activation_tokens (token_hash, request_id, requested_by, expires_at, created_by) VALUES ($1, $2::uuid, $3::uuid, now() + interval '24 hours', $4::uuid)",
          [digest, requestId, request.requested_by, userId],
        );
        await client.query(
          "UPDATE platform.activation_requests SET status = 'approved', reviewed_by = $2::uuid, reviewed_at = now(), updated_at = now() WHERE id = $1::uuid",
          [requestId, userId],
        );
        await auditPlatform(client, userId, "activation.approved", "activation_request", requestId);
        await client.query("COMMIT"); transaction = false;
        reply(res, 200, { data: { requestId, expiresInHours: 24, activationToken: rawToken }, message: "Token ditampilkan satu kali. Salin dan kirim melalui kanal resmi kepada pemohon." });
      } catch {
        if (transaction) await client.query("ROLLBACK").catch(() => undefined);
        reply(res, 500, { error: "activation_approval_failed" });
      } finally { client.release(); }
      return true;
    }

    const reject = path.match(/^\/v1\/platform\/admin\/activation-requests\/([0-9a-f-]{36})\/reject$/i);
    if (reject && req.method === "POST") {
      const requestId = reject[1]!;
      const body = await readJson(req);
      if (!body || typeof body.note !== "string" || body.note.trim().length < 3 || body.note.length > 1000) {
        reply(res, 422, { error: "review_note_required" }); return true;
      }
      const result = await pool.query(
        `UPDATE platform.activation_requests
         SET status = 'rejected', reviewed_by = $2::uuid, reviewed_at = now(),
             review_note = $3, updated_at = now()
         WHERE id = $1::uuid AND status = 'pending'
         RETURNING id, status`,
        [requestId, userId, body.note.trim()],
      );
      if (!result.rows[0]) { reply(res, 409, { error: "activation_request_not_pending" }); return true; }
      await pool.query(
        "INSERT INTO platform.audit_events (actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1::uuid, 'activation.rejected', 'activation_request', $2, $3::jsonb)",
        [userId, requestId, JSON.stringify({ note: body.note.trim() })],
      );
      reply(res, 200, { data: result.rows[0] });
      return true;
    }
  }

  if (path === "/v1/platform/activate" && req.method === "POST") {
    const body = await readJson(req);
    if (!body || typeof body.activationToken !== "string" || body.activationToken.length < 40 || body.activationToken.length > 128) {
      reply(res, 422, { error: "invalid_activation_token" }); return true;
    }
    if (!pool.connect) { reply(res, 503, { error: "platform_transaction_unavailable" }); return true; }
    const digest = createHash("sha256").update(body.activationToken, "utf8").digest();
    const client = await pool.connect() as QueryClient;
    let transaction = false;
    try {
      await client.query("BEGIN"); transaction = true;
      const tokenResult = await client.query<{
        request_id: string; requested_by: string; expires_at: Date | string; consumed_at: Date | string | null;
        organization_name: string; organization_slug: string; organization_type: string; campus_code: string; campus_name: string; status: string;
      }>(
        `SELECT t.request_id, t.requested_by, t.expires_at, t.consumed_at,
                r.organization_name, r.organization_slug, r.organization_type,
                r.campus_code, r.campus_name, r.status
         FROM platform.activation_tokens t
         JOIN platform.activation_requests r ON r.id = t.request_id
         WHERE t.token_hash = $1 FOR UPDATE OF t, r`,
        [digest],
      );
      const activation = tokenResult.rows[0];
      if (!activation || activation.requested_by !== userId || activation.consumed_at
        || new Date(activation.expires_at).getTime() <= Date.now() || activation.status !== "approved") {
        await client.query("ROLLBACK"); transaction = false;
        reply(res, 403, { error: "activation_token_invalid_expired_or_used" }); return true;
      }
      const role = await client.query<{ id: string }>(
        "SELECT id FROM core.roles WHERE organization_id IS NULL AND role_key = 'institution_owner' AND is_system = true LIMIT 1",
      );
      if (!role.rows[0]) throw new Error("institution_owner_role_missing");
      const org = await client.query<{ id: string }>(
        "INSERT INTO core.organizations (slug, name, organization_type, status) VALUES ($1, $2, $3, 'active') RETURNING id",
        [activation.organization_slug, activation.organization_name, activation.organization_type],
      );
      const organizationId = org.rows[0]?.id;
      if (!organizationId) throw new Error("organization_insert_failed");
      const membership = await client.query<{ id: string }>(
        "INSERT INTO core.organization_memberships (organization_id, user_id, membership_status) VALUES ($1::uuid, $2::uuid, 'active') RETURNING id",
        [organizationId, userId],
      );
      const membershipId = membership.rows[0]?.id;
      if (!membershipId) throw new Error("membership_insert_failed");
      await client.query(
        "UPDATE platform.activation_tokens SET consumed_at = now() WHERE token_hash = $1",
        [digest],
      );
      await client.query(
        "UPDATE platform.activation_requests SET status = 'activated', organization_id = $2::uuid, updated_at = now() WHERE id = $1::uuid",
        [activation.request_id, organizationId],
      );
      await auditPlatform(client, userId, "activation.redeemed", "activation_request", activation.request_id, { organizationId });
      await client.query(
        "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)",
        [userId, organizationId],
      );
      await client.query("SET LOCAL ROLE pondok_runtime");
      const campus = await client.query<{ id: string }>(
        "INSERT INTO core.campuses (organization_id, code, name, campus_type, status) VALUES ($1::uuid, $2, $3, 'main', 'active') RETURNING id",
        [organizationId, activation.campus_code, activation.campus_name],
      );
      const campusId = campus.rows[0]?.id;
      if (!campusId) throw new Error("campus_insert_failed");
      await client.query(
        "INSERT INTO core.membership_roles (membership_id, role_id) VALUES ($1::uuid, $2::uuid)",
        [membershipId, role.rows[0].id],
      );
      await client.query(
        `INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata)
         VALUES ($1::uuid, $2::uuid, 'organization.activated', 'organization', $3,
           jsonb_build_object('campus_id', $4::text, 'membership_id', $5::text, 'activation_request_id', $6::text))`,
        [organizationId, userId, organizationId, campusId, membershipId, activation.request_id],
      );
      await client.query("COMMIT"); transaction = false;
      reply(res, 201, { data: { organizationId, membershipId, campusId }, message: "Lembaga berhasil diaktifkan." });
    } catch (reason) {
      if (transaction) await client.query("ROLLBACK").catch(() => undefined);
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : 500, { error: code === "23505" ? "organization_slug_or_campus_code_exists" : "activation_failed" });
    } finally { client.release(); }
    return true;
  }

  reply(res, 404, { error: "platform_route_not_found" });
  return true;
}
