import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformOperationsRequest } from "../dist/platform-operations.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";

function request(path, method = "GET") {
  return { url: path, method, headers: {}, async *[Symbol.asyncIterator]() {} };
}
function response() {
  return {
    status: 0,
    headers: {},
    body: "",
    setHeader(key, value) { this.headers[key] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); },
    end(value = "") { this.body = value; }
  };
}
function createPool(isAdmin = true) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT EXISTS(SELECT 1 FROM platform.super_admins")) return { rows: [{ allowed: isAdmin }] };
      if (sql.includes("FROM platform.module_entitlements e")) return { rows: [{
        id: "223e4567-e89b-42d3-a456-426614174000",
        customerName: "Pesantren Uji",
        installationName: "Instalasi Cloud",
        moduleKey: "pondok.academic",
        status: "enabled",
        billingMode: "recurring"
      }] };
      if (sql.includes("FROM platform.module_orders o")) return { rows: [{
        id: "323e4567-e89b-42d3-a456-426614174000",
        orderNumber: "MOD-2026-0001",
        action: "add",
        activationStatus: "active",
        billingStatus: "paid"
      }] };
      if (sql.includes("FROM platform.module_lifecycle_events e")) return { rows: [{
        id: "423e4567-e89b-42d3-a456-426614174000",
        orderNumber: "MOD-2026-0001",
        eventType: "activated",
        actorType: "staff"
      }] };
      return { rows: [] };
    },
    release() { calls.push({ sql: "RELEASE", values: [] }); }
  };
  return { pool: { async connect() { return client; } }, calls };
}

test("module operations registry returns entitlement, order and lifecycle datasets to Super Admin", async () => {
  const { pool, calls } = createPool(true);
  const res = response();
  const handled = await handlePlatformOperationsRequest(request("/v1/platform/erp/operations/modules"), res, pool, userId);
  assert.equal(handled, true);
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.data.domain, "modules");
  assert.equal(body.data.readOnly, true);
  assert.equal(body.data.writeEnabled, false);
  assert.deepEqual(body.data.datasets.map((dataset) => dataset.key), ["entitlements", "orders", "lifecycleEvents"]);
  assert.equal(body.data.datasets[0].rows[0].status, "enabled");
  assert.equal(body.data.datasets[1].rows[0].billingStatus, "paid");
  assert.equal(body.data.datasets[2].rows[0].eventType, "activated");
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("module operations registry denies non Super Admin before reading lifecycle tables", async () => {
  const { pool, calls } = createPool(false);
  const res = response();
  await handlePlatformOperationsRequest(request("/v1/platform/erp/operations/modules"), res, pool, userId);
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, "platform_super_admin_required");
  assert.ok(!calls.some((call) => call.sql.includes("FROM platform.module_entitlements e")));
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
});
