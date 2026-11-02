import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { loadTenantContext } from "./tenant-access.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z0-9_.-]{1,63}$/;
const MAX_BODY_BYTES = 65_536;
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
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Json : null;
  } catch { return null; }
}

export function validateSyncEventInput(value: Json): string | null {
  if (typeof value.deviceId !== "string" || !UUID.test(value.deviceId)) return "invalid_device_id";
  if (typeof value.eventId !== "string" || !UUID.test(value.eventId)) return "invalid_event_id";
  if (typeof value.idempotencyKey !== "string" || value.idempotencyKey.length < 8 || value.idempotencyKey.length > 128) return "invalid_idempotency_key";
  if (typeof value.aggregateType !== "string" || !KEY.test(value.aggregateType)) return "invalid_aggregate_type";
  if (typeof value.aggregateId !== "string" || value.aggregateId.length < 1 || value.aggregateId.length > 128) return "invalid_aggregate_id";
  if (typeof value.eventType !== "string" || !KEY.test(value.eventType)) return "invalid_event_type";
  if (!Number.isInteger(value.schemaVersion) || Number(value.schemaVersion) < 1 || Number(value.schemaVersion) > 1000) return "invalid_schema_version";
  if (typeof value.occurredAt !== "string" || Number.isNaN(Date.parse(value.occurredAt))) return "invalid_occurred_at";
  if (value.payload === null || typeof value.payload !== "object" || Array.isArray(value.payload)) return "invalid_payload";
  if (Buffer.byteLength(JSON.stringify(value.payload), "utf8") > 48_000) return "payload_too_large";
  return null;
}

export async function handleSyncRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pool: Pick<Pool, "query">,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (!path.startsWith("/v1/sync/")) return false;

  const tenant = await loadTenantContext(pool, userId, organizationId);
  if (!tenant) { reply(res, 403, { error: "active_membership_required" }); return true; }

  if (path === "/v1/sync/devices" && req.method === "POST") {
    if (!tenant.permissions.includes("sync.devices.manage")) {
      reply(res, 403, { error: "permission_required", permission: "sync.devices.manage" }); return true;
    }
    const body = await readJson(req);
    if (!body || typeof body.deviceKey !== "string" || !/^[a-zA-Z0-9._:-]{4,100}$/.test(body.deviceKey)
      || typeof body.deviceName !== "string" || body.deviceName.trim().length < 2 || body.deviceName.length > 120
      || !["server","desktop","mobile","kiosk"].includes(String(body.deviceType))) {
      reply(res, 422, { error: "invalid_device_input" }); return true;
    }
    const result = await pool.query(
      `INSERT INTO sync.devices (organization_id, device_key, device_name, device_type, registered_by)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid)
       RETURNING id, device_key AS "deviceKey", device_name AS "deviceName",
                 device_type AS "deviceType", device_status AS status, created_at AS "createdAt"`,
      [organizationId, body.deviceKey, body.deviceName.trim(), body.deviceType, userId],
    );
    reply(res, 201, { data: result.rows[0] }); return true;
  }

  const approveMatch = path.match(/^\/v1\/sync\/devices\/([0-9a-f-]{36})\/approve$/i);
  if (approveMatch && req.method === "POST") {
    if (!tenant.permissions.includes("sync.devices.manage")) {
      reply(res, 403, { error: "permission_required", permission: "sync.devices.manage" }); return true;
    }
    const result = await pool.query(
      `UPDATE sync.devices SET device_status = 'active', approved_by = $3::uuid,
              approved_at = now()
       WHERE organization_id = $1::uuid AND id = $2::uuid AND device_status = 'pending'
       RETURNING id, device_key AS "deviceKey", device_name AS "deviceName", device_status AS status`,
      [organizationId, approveMatch[1], userId],
    );
    if (!result.rows[0]) { reply(res, 409, { error: "device_not_pending_or_not_found" }); return true; }
    reply(res, 200, { data: result.rows[0] }); return true;
  }

  if (path === "/v1/sync/events" && req.method === "GET") {
    if (!tenant.permissions.includes("sync.events.read")) {
      reply(res, 403, { error: "permission_required", permission: "sync.events.read" }); return true;
    }
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const result = await pool.query(
      `SELECT event_id AS "eventId", device_id AS "deviceId", aggregate_type AS "aggregateType",
              aggregate_id AS "aggregateId", event_type AS "eventType", processing_status AS status,
              received_at AS "receivedAt", processing_error AS "processingError"
       FROM sync.inbox_events WHERE organization_id = $1::uuid
       ORDER BY received_at DESC LIMIT $2`,
      [organizationId, limit],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/sync/events" && req.method === "POST") {
    if (!tenant.permissions.includes("sync.events.submit")) {
      reply(res, 403, { error: "permission_required", permission: "sync.events.submit" }); return true;
    }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const validationError = validateSyncEventInput(body);
    if (validationError) { reply(res, 422, { error: validationError }); return true; }
    const inserted = await pool.query(
      `INSERT INTO sync.inbox_events
        (organization_id, device_id, event_id, idempotency_key, aggregate_type, aggregate_id,
         event_type, schema_version, payload, occurred_at)
       SELECT $1::uuid, d.id, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamptz
       FROM sync.devices d
       WHERE d.organization_id = $1::uuid AND d.id = $2::uuid AND d.device_status = 'active'
       ON CONFLICT (organization_id, idempotency_key) DO NOTHING
       RETURNING event_id AS "eventId", processing_status AS status, received_at AS "receivedAt"`,
      [organizationId, body.deviceId, body.eventId, body.idempotencyKey, body.aggregateType,
       body.aggregateId, body.eventType, body.schemaVersion, JSON.stringify(body.payload), body.occurredAt],
    );
    if (inserted.rows[0]) { reply(res, 202, { data: inserted.rows[0], acceptedForProcessing: false }); return true; }
    const existing = await pool.query(
      `SELECT event_id AS "eventId", aggregate_type AS "aggregateType", aggregate_id AS "aggregateId",
              event_type AS "eventType", schema_version AS "schemaVersion", payload,
              processing_status AS status
       FROM sync.inbox_events WHERE organization_id = $1::uuid AND idempotency_key = $2`,
      [organizationId, body.idempotencyKey],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0] as Record<string, unknown>;
      const same = row.eventId === body.eventId && row.aggregateType === body.aggregateType
        && row.aggregateId === body.aggregateId && row.eventType === body.eventType
        && Number(row.schemaVersion) === body.schemaVersion
        && JSON.stringify(row.payload) === JSON.stringify(body.payload);
      if (!same) { reply(res, 409, { error: "idempotency_key_payload_mismatch" }); return true; }
      reply(res, 200, { data: { eventId: row.eventId, status: row.status }, duplicate: true, acceptedForProcessing: false }); return true;
    }
    reply(res, 403, { error: "active_sync_device_required" }); return true;
  }

  if (path.startsWith("/v1/sync/")) {
    res.setHeader("allow", "GET, POST");
    reply(res, 405, { error: "method_not_allowed" }); return true;
  }
  return false;
}
