import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { loadTenantContext } from "./tenant-access.js";

type AuditPool = Pick<Pool, "query">;

function reply(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(payload));
}

/**
 * Tenant audit reader. Runs only inside withTenantScope, and still applies an
 * explicit organization predicate as defense in depth. Metadata is deliberately
 * excluded because arbitrary module metadata may contain personal or secret data.
 */
export async function handleTenantAuditRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pool: AuditPool,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname !== "/v1/audit/events") return false;
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("allow", "GET, HEAD");
    reply(res, 405, { error: "method_not_allowed" });
    return true;
  }

  const tenant = await loadTenantContext(pool, userId, organizationId);
  if (!tenant) {
    reply(res, 403, { error: "active_membership_required" });
    return true;
  }
  if (!tenant.permissions.includes("audit.events.read")) {
    reply(res, 403, { error: "permission_required", permission: "audit.events.read" });
    return true;
  }

  const rawLimit = url.searchParams.get("limit");
  const parsedLimit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    reply(res, 400, { error: "invalid_limit", maximum: 100 });
    return true;
  }
  const before = url.searchParams.get("before");
  if (before !== null && (!Number.isFinite(Date.parse(before)) || before.length > 64)) {
    reply(res, 400, { error: "invalid_before_cursor" });
    return true;
  }

  const values: unknown[] = [organizationId];
  const cursorClause = before === null ? "" : "AND occurred_at < $2::timestamptz";
  if (before !== null) values.push(before);
  values.push(parsedLimit);
  const limitParameter = "$" + String(values.length);

  const result = await pool.query(
    `SELECT id, action, resource_type, resource_id, occurred_at
       FROM audit.audit_events
      WHERE organization_id = $1::uuid
        ${cursorClause}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${limitParameter}`,
    values,
  );
  reply(res, 200, {
    data: result.rows,
    pagination: { limit: parsedLimit, returned: result.rows.length, before: before ?? null },
  });
  return true;
}
