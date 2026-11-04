import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformRequest, validateActivationRequest } from "../dist/platform-admin.js";
import { handleRequest } from "../dist/main.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const requestId = "223e4567-e89b-42d3-a456-426614174000";
const valid = {
  contactEmail: "admin@pondok.example",
  contactName: "Administrator",
  organizationName: "Pondok Contoh",
  organizationSlug: "pondok-contoh",
  organizationType: "pesantren",
  campusCode: "UTAMA",
  campusName: "Kampus Utama"
};

function request(path, method = "GET", body = {}) {
  return {
    url: path, method, headers: {},
    async *[Symbol.asyncIterator]() { if (method !== "GET") yield Buffer.from(JSON.stringify(body)); }
  };
}
function response() {
  return {
    status: 0, headers: {}, body: "",
    setHeader(key, value) { this.headers[key] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); },
    end(body = "") { this.body = body; }
  };
}
function poolWithClient(queryImpl, ownerQuery = async () => ({ rows: [] })) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql: sql.trim(), values });
      return queryImpl(sql.trim(), values);
    },
    release() {}
  };
  return { calls, pool: { query: ownerQuery, connect: async () => client } };
}

test("validates the institution application and rejects unsafe slugs or unsupported types", () => {
  assert.equal(validateActivationRequest(valid), null);
  assert.equal(validateActivationRequest({ ...valid, organizationSlug: "../other" }), "invalid_organization_slug");
  assert.equal(validateActivationRequest({ ...valid, organizationType: "bank" }), "invalid_organization_type");
  assert.equal(validateActivationRequest({ ...valid, campusCode: "x" }), "invalid_campus_code");
});

test("a normal authenticated user cannot access company approval endpoints", async () => {
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ allowed: false }] };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request("/v1/platform/admin/activation-requests"), res, pool, userId);
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, "platform_super_admin_required");
  assert.ok(calls.some((call) => call.sql === "SET LOCAL ROLE pondok_platform_runtime") === false);
});

test("applicant request is created and audited under the restricted platform role", async () => {
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("INSERT INTO platform.activation_requests")) return { rows: [{ id: requestId, status: "pending" }] };
    return { rows: [] };
  }, async () => ({ rows: [{ email: valid.contactEmail }] }));
  const res = response();
  await handlePlatformRequest(request("/v1/platform/activation-requests", "POST", valid), res, pool, userId);
  assert.equal(res.status, 201);
  assert.equal(JSON.parse(res.body).data.status, "pending");
  assert.ok(calls.some((call) => call.sql === "SET LOCAL ROLE pondok_platform_runtime"));
  assert.ok(calls.some((call) => call.sql.startsWith("INSERT INTO platform.audit_events")));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
  assert.doesNotMatch(res.body, /activationToken|organizationId/);
});

test("approval creates a high-entropy token and returns it once after commit", async () => {
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ allowed: true }] };
    if (sql.startsWith("SELECT id, requested_by, status")) return { rows: [{ id: requestId, requested_by: userId, status: "pending" }] };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request(`/v1/platform/admin/activation-requests/${requestId}/approve`, "POST"), res, pool, userId);
  const body = JSON.parse(res.body);
  assert.equal(res.status, 200);
  assert.equal(body.data.expiresInHours, 24);
  assert.match(body.data.activationToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.ok(calls.some((call) => call.sql === "SET LOCAL ROLE pondok_platform_runtime"));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
  const insert = calls.find((call) => call.sql.startsWith("INSERT INTO platform.activation_tokens"));
  assert.ok(insert);
  assert.equal(Buffer.isBuffer(insert.values[0]), true);
  assert.equal(insert.values[0].length, 32);
  assert.notEqual(insert.values[0].toString("utf8"), body.data.activationToken);
});

test("legacy public bootstrap endpoint is disabled by the centralized distribution model", async () => {
  const req = { method: "POST", url: "/v1/bootstrap/organization", headers: {} };
  const res = response();
  await handleRequest(req, res);
  assert.equal(res.status, 410);
  assert.equal(JSON.parse(res.body).error, "legacy_bootstrap_disabled_use_central_activation");
});

test("company super admin can read the tenant registry under the restricted platform role", async () => {
  const { pool, calls } = poolWithClient(async (sql) => {
    // The production code checks the administrator on the same connection
    // before switching to the restricted platform role. Keep this authority
    // check in the client mock rather than the pool-level query mock.
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ allowed: true }] };
    if (sql.startsWith("SELECT o.id AS")) return { rows: [{ organizationId: requestId, name: "Pondok Contoh", slug: "pondok-contoh", status: "active", memberCount: 2 }] };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request("/v1/platform/admin/tenants"), res, pool, userId);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).data[0].memberCount, 2);
  const authorityCheck = calls.findIndex((call) => call.sql.startsWith("SELECT EXISTS"));
  const roleSwitch = calls.findIndex((call) => call.sql === "SET LOCAL ROLE pondok_platform_runtime");
  assert.ok(authorityCheck >= 0);
  assert.ok(roleSwitch > authorityCheck, "super-admin authority must be checked before switching roles");
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("non-admin cannot read the tenant registry", async () => {
  const { pool, calls } = poolWithClient(async () => ({ rows: [] }), async () => ({ rows: [{ allowed: false }] }));
  const res = response();
  await handlePlatformRequest(request("/v1/platform/admin/tenants"), res, pool, userId);
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, "platform_super_admin_required");
  assert.ok(!calls.some((call) => call.sql === "SET LOCAL ROLE pondok_platform_runtime"));
});
