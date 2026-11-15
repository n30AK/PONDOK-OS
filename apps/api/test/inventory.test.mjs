import test from "node:test";
import assert from "node:assert/strict";
import { handleInventoryRequest, validateInventoryItemInput, validateMovementInput } from "../dist/inventory.js";
import { Readable } from "node:stream";

const item = "123e4567-e89b-42d3-a456-426614174000";
const whA = "223e4567-e89b-42d3-a456-426614174000";
const whB = "323e4567-e89b-42d3-a456-426614174000";

test("validates inventory item master data", () => {
  assert.equal(validateInventoryItemInput({ itemCode: "BRG-001", itemName: "Beras", unitCode: "kg", reorderLevel: 20 }), null);
  assert.equal(validateInventoryItemInput({ itemCode: "BRG-001", itemName: "Beras", unitCode: "kg", reorderLevel: -1 }), "invalid_reorder_level");
});
test("accepts receipt and issue movements", () => {
  assert.equal(validateMovementInput({ itemId: item, warehouseId: whA, movementType: "receipt", quantity: 10 }), null);
  assert.equal(validateMovementInput({ itemId: item, warehouseId: whA, movementType: "issue", quantity: 2 }), null);
});
test("validates transfer pair and positive quantity", () => {
  assert.equal(validateMovementInput({ itemId: item, movementType: "transfer", fromWarehouseId: whA, toWarehouseId: whB, quantity: 3 }), null);
  assert.equal(validateMovementInput({ itemId: item, movementType: "transfer", fromWarehouseId: whA, toWarehouseId: whA, quantity: 3 }), "transfer_warehouses_must_differ");
  assert.equal(validateMovementInput({ itemId: item, warehouseId: whA, movementType: "issue", quantity: 0 }), "invalid_quantity");
});


const organizationId = "223e4567-e89b-42d3-a456-426614174000";
const membershipId = "423e4567-e89b-42d3-a456-426614174000";
const userId = "323e4567-e89b-42d3-a456-426614174000";
function inventoryResponse() {
  return { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body ?? ""; } };
}
function inventoryRequest(method, url, body) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  stream.method = method; stream.url = url; stream.headers = {};
  return stream;
}
function inventoryTenant(permissions, roles = ["warehouse_operator"]) {
  return { membership_id: membershipId, organization_id: organizationId, roles, permissions };
}

test("scoped warehouse list and movement list bind the caller membership scope", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships")) return { rows: [inventoryTenant(["inventory.items.read", "inventory.movements.read"])] };
    if (sql.includes("FROM inventory.warehouses w")) return { rows: [] };
    if (sql.includes("FROM inventory.stock_movements m")) return { rows: [] };
    throw new Error("unexpected query: " + sql);
  }};
  const warehouses = inventoryResponse();
  await handleInventoryRequest(inventoryRequest("GET", "/v1/inventory/warehouses"), warehouses, pool, userId, organizationId);
  assert.equal(warehouses.statusCode, 200);
  const warehouseQuery = calls.find(call => call.sql.includes("FROM inventory.warehouses w"));
  assert.ok(warehouseQuery.sql.includes("membership_campus_scopes"));
  assert.deepEqual(warehouseQuery.values, [organizationId, membershipId]);

  const movements = inventoryResponse();
  await handleInventoryRequest(inventoryRequest("GET", "/v1/inventory/movements"), movements, pool, userId, organizationId);
  assert.equal(movements.statusCode, 200);
  const movementQuery = calls.find(call => call.sql.includes("FROM inventory.stock_movements m"));
  assert.ok(movementQuery.sql.includes("membership_campus_scopes"));
  assert.deepEqual(movementQuery.values, [organizationId, membershipId, 50]);
});

test("scoped item on-hand totals include only movements in authorized warehouses", async () => {
  let query = "";
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [inventoryTenant(["inventory.items.read"])] };
    query = sql;
    return { rows: [] };
  }};
  const res = inventoryResponse();
  await handleInventoryRequest(inventoryRequest("GET", "/v1/inventory/items"), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  assert.ok(query.includes("LEFT JOIN inventory.warehouses w"));
  assert.ok(query.includes("w.id IS NOT NULL AND m.movement_type"));
  assert.ok(query.includes("membership_campus_scopes"));
});

test("scoped member cannot create warehouse outside assigned campus", async () => {
  let insertQuery = "";
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [inventoryTenant(["inventory.items.write"])] };
    insertQuery = sql;
    return { rows: [] };
  }};
  const res = inventoryResponse();
  await handleInventoryRequest(inventoryRequest("POST", "/v1/inventory/warehouses", {
    warehouseCode: "G-01", warehouseName: "Gudang Kampus", campusId: "523e4567-e89b-42d3-a456-426614174000"
  }), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, "warehouse_campus_outside_member_scope");
  assert.ok(insertQuery.includes("membership_campus_scopes"));
});

test("scoped member cannot post stock movement to an out-of-scope warehouse", async () => {
  let insertQuery = "";
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [inventoryTenant(["inventory.movements.write"])] };
    insertQuery = sql;
    return { rows: [] };
  }};
  const res = inventoryResponse();
  await handleInventoryRequest(inventoryRequest("POST", "/v1/inventory/movements", {
    itemId: item, warehouseId: whA, movementType: "receipt", quantity: 10
  }), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, "inventory_item_or_warehouse_outside_member_scope");
  assert.ok(insertQuery.includes("membership_campus_scopes"));
  assert.ok(insertQuery.includes("INSERT INTO inventory.stock_movements"));
});

test("scoped member cannot mutate the tenant-wide item catalog", async () => {
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [inventoryTenant(["inventory.items.write"])] };
    throw new Error("catalog write must be rejected before SQL");
  }};
  const res = inventoryResponse();
  await handleInventoryRequest(inventoryRequest("POST", "/v1/inventory/items", {
    itemCode: "BRG-001", itemName: "Beras", unitCode: "kg"
  }), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(JSON.parse(res.body).error, "inventory_item_catalog_management_requires_tenant_authority");
});


test("scoped transfer requires both source and destination warehouses in scope", async () => {
  let insertQuery = "";
  let insertValues = [];
  const pool = { async query(sql, values) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [inventoryTenant(["inventory.movements.write"])] };
    insertQuery = sql; insertValues = values;
    return { rows: [] };
  }};
  const res = inventoryResponse();
  await handleInventoryRequest(inventoryRequest("POST", "/v1/inventory/movements", {
    itemId: item, movementType: "transfer", fromWarehouseId: whA, toWarehouseId: whB, quantity: 3
  }), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.ok(insertQuery.includes("authorized_warehouses"));
  assert.ok(insertQuery.includes("(SELECT COUNT(*) FROM authorized_warehouses)=2"));
  assert.ok(insertQuery.includes("membership_campus_scopes"));
  assert.deepEqual(insertValues.slice(0, 5), [organizationId, membershipId, item, whA, whB]);
});


test("inventory campus options expose only active campus grants to scoped operators", async () => {
  let query = "";
  let values = [];
  const pool = { async query(sql, params) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [inventoryTenant(["inventory.items.read"])] };
    query = sql; values = params; return { rows: [] };
  }};
  const res = inventoryResponse();
  await handleInventoryRequest(inventoryRequest("GET", "/v1/inventory/campuses"), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  assert.ok(query.includes("membership_campus_scopes"));
  assert.ok(query.includes("mcs.campus_id=c.id"));
  assert.deepEqual(values, [organizationId, membershipId, false]);
});
