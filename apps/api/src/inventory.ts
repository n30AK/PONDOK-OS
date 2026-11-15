import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { hasTenantWideOperationalAccess, loadTenantContext } from "./tenant-access.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Json = Record<string, unknown>;

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}
async function readJson(req: IncomingMessage): Promise<Json | null> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += part.length;
    if (size > 32_768) return null; chunks.push(part);
  }
  try { const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8")); return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Json : null; }
  catch { return null; }
}

export function validateInventoryItemInput(value: Json): string | null {
  if (typeof value.itemCode !== "string" || !/^[A-Za-z0-9._-]{1,48}$/.test(value.itemCode)) return "invalid_item_code";
  if (typeof value.itemName !== "string" || value.itemName.trim().length < 2 || value.itemName.length > 180) return "invalid_item_name";
  if (typeof value.unitCode !== "string" || !/^[A-Za-z0-9._-]{1,16}$/.test(value.unitCode)) return "invalid_unit_code";
  if (value.reorderLevel !== undefined && (typeof value.reorderLevel !== "number" || !Number.isFinite(value.reorderLevel) || value.reorderLevel < 0)) return "invalid_reorder_level";
  return null;
}

export function validateMovementInput(value: Json): string | null {
  if (typeof value.itemId !== "string" || !UUID.test(value.itemId)) return "invalid_item_id";
  if (typeof value.movementType !== "string" || !["receipt","issue","transfer"].includes(value.movementType)) return "invalid_movement_type";
  if (typeof value.quantity !== "number" || !Number.isFinite(value.quantity) || value.quantity <= 0 || value.quantity > 1_000_000_000) return "invalid_quantity";
  if (value.unitCost !== undefined && value.unitCost !== null && (typeof value.unitCost !== "number" || !Number.isFinite(value.unitCost) || value.unitCost < 0)) return "invalid_unit_cost";
  if (typeof value.referenceId !== "undefined" && value.referenceId !== null && (typeof value.referenceId !== "string" || value.referenceId.length > 128)) return "invalid_reference_id";
  if (typeof value.notes !== "undefined" && value.notes !== null && (typeof value.notes !== "string" || value.notes.length > 500)) return "invalid_notes";
  if (value.movementType === "transfer") {
    if (typeof value.fromWarehouseId !== "string" || !UUID.test(value.fromWarehouseId)) return "invalid_source_warehouse_id";
    if (typeof value.toWarehouseId !== "string" || !UUID.test(value.toWarehouseId)) return "invalid_destination_warehouse_id";
    if (value.fromWarehouseId === value.toWarehouseId) return "transfer_warehouses_must_differ";
  } else if (typeof value.warehouseId !== "string" || !UUID.test(value.warehouseId)) return "invalid_warehouse_id";
  return null;
}

export async function handleInventoryRequest(
  req: IncomingMessage, res: ServerResponse, pool: Pick<Pool, "query">, userId: string, organizationId: string,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (!path.startsWith("/v1/inventory/")) return false;
  const tenant = await loadTenantContext(pool, userId, organizationId);
  if (!tenant) { reply(res, 403, { error: "active_membership_required" }); return true; }
  const tenantWide = hasTenantWideOperationalAccess(tenant.roles);
  const warehouseScope = (alias: string) => `(${tenantWide ? "true" : "false"}::boolean OR EXISTS (
    SELECT 1 FROM core.membership_campus_scopes mcs
    WHERE mcs.organization_id = $1::uuid AND mcs.membership_id = $2::uuid
      AND mcs.campus_id = ${alias}.campus_id
      AND mcs.revoked_at IS NULL AND mcs.valid_from <= now()
      AND (mcs.valid_until IS NULL OR mcs.valid_until > now())
  ))`;
  if (path === "/v1/inventory/campuses" && req.method === "GET") {
    if (!tenant.permissions.includes("inventory.items.read")) { reply(res, 403, { error: "permission_required", permission: "inventory.items.read" }); return true; }
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


  if (path === "/v1/inventory/items" && req.method === "GET") {
    if (!tenant.permissions.includes("inventory.items.read")) { reply(res, 403, { error: "permission_required", permission: "inventory.items.read" }); return true; }
    const result = await pool.query(
      `SELECT i.id, i.item_code AS "itemCode", i.item_name AS "itemName", i.unit_code AS "unitCode",
              i.reorder_level AS "reorderLevel", i.is_active AS "isActive",
              COALESCE(SUM(CASE WHEN w.id IS NOT NULL AND m.movement_type IN ('receipt','transfer_in') THEN m.quantity
                                WHEN w.id IS NOT NULL AND m.movement_type IN ('issue','transfer_out') THEN -m.quantity ELSE 0 END),0) AS "onHand"
       FROM inventory.items i
       LEFT JOIN inventory.stock_movements m
         ON m.organization_id = i.organization_id AND m.item_id = i.id
       LEFT JOIN inventory.warehouses w
         ON w.organization_id = m.organization_id AND w.id = m.warehouse_id
        AND ${warehouseScope("w")}
       WHERE i.organization_id = $1::uuid AND i.is_active = true
       GROUP BY i.id ORDER BY i.item_code LIMIT 500`, [organizationId, tenant.membershipId],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/inventory/items" && req.method === "POST") {
    if (!tenant.permissions.includes("inventory.items.write")) { reply(res, 403, { error: "permission_required", permission: "inventory.items.write" }); return true; }
    if (!tenantWide) { reply(res, 403, { error: "inventory_item_catalog_management_requires_tenant_authority" }); return true; }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const error = validateInventoryItemInput(body);
    if (error) { reply(res, 422, { error }); return true; }
    try {
      const result = await pool.query(
        `INSERT INTO inventory.items (organization_id, item_code, item_name, unit_code, reorder_level)
         VALUES ($1::uuid, $2, $3, $4, $5)
         RETURNING id, item_code AS "itemCode", item_name AS "itemName", unit_code AS "unitCode", reorder_level AS "reorderLevel"`,
        [organizationId, body.itemCode, (body.itemName as string).trim(), body.unitCode, body.reorderLevel ?? 0],
      );
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : 500, { error: code === "23505" ? "item_code_already_exists" : "item_create_failed" });
    }
    return true;
  }

  if (path === "/v1/inventory/warehouses" && req.method === "GET") {
    if (!tenant.permissions.includes("inventory.items.read")) { reply(res, 403, { error: "permission_required", permission: "inventory.items.read" }); return true; }
    const result = await pool.query(
      `SELECT id, campus_id AS "campusId", warehouse_code AS "warehouseCode",
              warehouse_name AS "warehouseName", is_active AS "isActive"
       FROM inventory.warehouses w WHERE w.organization_id = $1::uuid AND w.is_active = true
         AND ${warehouseScope("w")}
       ORDER BY w.warehouse_code LIMIT 200`, [organizationId, tenant.membershipId],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/inventory/warehouses" && req.method === "POST") {
    if (!tenant.permissions.includes("inventory.items.write")) { reply(res, 403, { error: "permission_required", permission: "inventory.items.write" }); return true; }
    const body = await readJson(req);
    if (!body || typeof body.warehouseCode !== "string" || !/^[A-Za-z0-9._-]{1,32}$/.test(body.warehouseCode)
      || typeof body.warehouseName !== "string" || body.warehouseName.trim().length < 2 || body.warehouseName.length > 160
      || (body.campusId !== undefined && body.campusId !== null && (typeof body.campusId !== "string" || !UUID.test(body.campusId)))) {
      reply(res, 422, { error: "invalid_warehouse_input" }); return true;
    }
    try {
      if (!tenantWide && typeof body.campusId !== "string") {
        reply(res, 403, { error: "warehouse_campus_scope_required" }); return true;
      }
      const result = await pool.query(
        `INSERT INTO inventory.warehouses (organization_id, campus_id, warehouse_code, warehouse_name)
         SELECT $1::uuid, $2::uuid, $3, $4
         WHERE $5::boolean OR EXISTS (
           SELECT 1 FROM core.campuses c
           JOIN core.membership_campus_scopes mcs
             ON mcs.organization_id=c.organization_id AND mcs.campus_id=c.id
           WHERE c.organization_id=$1::uuid AND c.id=$2::uuid
             AND mcs.membership_id=$6::uuid AND mcs.revoked_at IS NULL
             AND mcs.valid_from<=now() AND (mcs.valid_until IS NULL OR mcs.valid_until>now())
         )
         RETURNING id, campus_id AS "campusId", warehouse_code AS "warehouseCode", warehouse_name AS "warehouseName"`,
        [organizationId, body.campusId ?? null, body.warehouseCode, (body.warehouseName as string).trim(), tenantWide, tenant.membershipId],
      );
      if (!result.rows[0]) { reply(res, 403, { error: "warehouse_campus_outside_member_scope" }); return true; }
      reply(res, 201, { data: result.rows[0] });
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23505" ? 409 : code === "23503" ? 422 : 500, { error: code === "23505" ? "warehouse_code_already_exists" : code === "23503" ? "campus_not_found" : "warehouse_create_failed" });
    }
    return true;
  }

  if (path === "/v1/inventory/movements" && req.method === "GET") {
    if (!tenant.permissions.includes("inventory.movements.read")) { reply(res, 403, { error: "permission_required", permission: "inventory.movements.read" }); return true; }
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;
    const result = await pool.query(
      `SELECT m.id, m.item_id AS "itemId", i.item_name AS "itemName",
              m.warehouse_id AS "warehouseId", w.warehouse_name AS "warehouseName",
              m.movement_group_id AS "movementGroupId", m.movement_type AS "movementType",
              m.quantity, m.unit_cost AS "unitCost", m.reference_type AS "referenceType",
              m.reference_id AS "referenceId", m.notes, m.occurred_at AS "occurredAt"
       FROM inventory.stock_movements m
       JOIN inventory.items i ON i.organization_id = m.organization_id AND i.id = m.item_id
       JOIN inventory.warehouses w ON w.organization_id = m.organization_id AND w.id = m.warehouse_id
       WHERE m.organization_id = $1::uuid AND ${warehouseScope("w")}
       ORDER BY m.occurred_at DESC LIMIT $3`,
      [organizationId, tenant.membershipId, limit],
    );
    reply(res, 200, { data: result.rows }); return true;
  }

  if (path === "/v1/inventory/movements" && req.method === "POST") {
    if (!tenant.permissions.includes("inventory.movements.write")) { reply(res, 403, { error: "permission_required", permission: "inventory.movements.write" }); return true; }
    const body = await readJson(req);
    if (!body) { reply(res, 400, { error: "invalid_json_or_body_too_large" }); return true; }
    const error = validateMovementInput(body);
    if (error) { reply(res, 422, { error }); return true; }
    try {
      if (body.movementType === "transfer") {
        const result = await pool.query(
          `WITH authorized_warehouses AS (
             SELECT w.id FROM inventory.warehouses w
             WHERE w.organization_id=$1::uuid AND w.id IN ($4::uuid,$5::uuid)
               AND ${warehouseScope("w")}
           ), group_ref AS (SELECT gen_random_uuid() AS id),
           inserted AS (
             INSERT INTO inventory.stock_movements
               (organization_id, item_id, warehouse_id, movement_group_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, recorded_by)
             SELECT $1::uuid, $3::uuid, v.warehouse_id, group_ref.id, v.movement_type, $6, $7, 'transfer', $8, $9, $10::uuid
             FROM group_ref CROSS JOIN (VALUES ($4::uuid, 'transfer_out'), ($5::uuid, 'transfer_in')) AS v(warehouse_id, movement_type)
             WHERE (SELECT COUNT(*) FROM authorized_warehouses)=2
               AND EXISTS (SELECT 1 FROM inventory.items i WHERE i.organization_id=$1::uuid AND i.id=$3::uuid AND i.is_active=true)
             RETURNING id, movement_type AS "movementType", warehouse_id AS "warehouseId", quantity
           )
           SELECT group_ref.id AS "movementGroupId", json_agg(inserted) AS movements FROM group_ref, inserted GROUP BY group_ref.id`,
          [organizationId, tenant.membershipId, body.itemId, body.fromWarehouseId, body.toWarehouseId, body.quantity, body.unitCost ?? null, body.referenceId ?? null, body.notes ?? null, userId],
        );
        if (!result.rows[0]) { reply(res, 403, { error: "inventory_item_or_warehouse_outside_member_scope" }); return true; }
        reply(res, 201, { data: result.rows[0] });
      } else {
        const result = await pool.query(
          `INSERT INTO inventory.stock_movements
             (organization_id, item_id, warehouse_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, recorded_by)
           SELECT $1::uuid, i.id, w.id, $5, $6, $7, 'manual', $8, $9, $10::uuid
           FROM inventory.items i JOIN inventory.warehouses w ON w.organization_id=i.organization_id
           WHERE i.organization_id=$1::uuid AND i.id=$3::uuid AND i.is_active=true
             AND w.id=$4::uuid AND w.is_active=true AND ${warehouseScope("w")}
           RETURNING id, item_id AS "itemId", warehouse_id AS "warehouseId", movement_type AS "movementType",
                     quantity, unit_cost AS "unitCost", occurred_at AS "occurredAt"`,
          [organizationId, tenant.membershipId, body.itemId, body.warehouseId, body.movementType, body.quantity, body.unitCost ?? null, body.referenceId ?? null, body.notes ?? null, userId],
        );
        if (!result.rows[0]) { reply(res, 403, { error: "inventory_item_or_warehouse_outside_member_scope" }); return true; }
        reply(res, 201, { data: result.rows[0] });
      }
    } catch (reason) {
      const code = typeof reason === "object" && reason !== null && "code" in reason ? String((reason as { code: unknown }).code) : "";
      reply(res, code === "23503" ? 422 : code === "23514" ? 409 : 500,
        { error: code === "23503" ? "item_or_warehouse_not_found" : code === "23514" ? "stock_movement_rejected" : "stock_movement_failed" });
    }
    return true;
  }

  if (path.startsWith("/v1/inventory/")) { res.setHeader("allow", "GET, POST"); reply(res, 405, { error: "method_not_allowed" }); return true; }
  return false;
}
