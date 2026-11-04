import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeModuleManifest, handlePlatformRequest } from "../dist/platform-admin.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const organizationId = "323e4567-e89b-42d3-a456-426614174000";
const requestId = "223e4567-e89b-42d3-a456-426614174000";
const digest = Buffer.alloc(32, 9);
const manifest = {
  manifestVersion: 1,
  moduleId: "org.example.education",
  version: "1.0.0",
  displayName: "Example Education",
  publisher: "Example Publisher",
  category: "education",
  dependencies: [],
  menu: [{ id: "education.home", label: "Education", route: "/workspace/education/home", permission: "education.read" }],
  permissions: ["education.read"],
  data: { schemaNamespace: "education_data", tenantScoped: true, classification: "internal" },
  forms: [],
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

test("canonical manifest hashing sorts object keys recursively and preserves array order", () => {
  assert.equal(
    canonicalizeModuleManifest({ z: 1, a: { y: 2, x: 3 }, list: ["b", "a"] }),
    '{"a":{"x":3,"y":2},"list":["b","a"],"z":1}',
  );
});

test("module publisher can submit a validated manifest with a server-computed digest and atomic event", async () => {
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT id, organization_id AS")) return { rows: [] };
    if (sql.startsWith("SELECT id FROM core.organizations")) return { rows: [{ id: organizationId }] };
    if (sql.startsWith("INSERT INTO platform.module_requests")) return {
      rows: [{ id: requestId, organizationId, moduleId: manifest.moduleId, moduleVersion: manifest.version, status: "submitted" }],
    };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request("/v1/platform/modules/requests", "POST", {
    organizationId, idempotencyKey: "module-submit-0001", manifest,
  }), res, pool, userId);
  assert.equal(res.status, 201);
  assert.equal(JSON.parse(res.body).data.status, "submitted");
  const insert = calls.find((call) => call.sql.startsWith("INSERT INTO platform.module_requests"));
  assert.ok(insert);
  assert.equal(Buffer.isBuffer(insert.values[4]), true);
  assert.equal(insert.values[4].length, 32);
  assert.ok(calls.some((call) => call.sql.startsWith("INSERT INTO platform.module_request_events")));
  assert.ok(calls.some((call) => call.sql.startsWith("INSERT INTO platform.audit_events")));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("client-supplied manifest digest is rejected before database access", async () => {
  const { pool, calls } = poolWithClient(async () => ({ rows: [] }));
  const res = response();
  await handlePlatformRequest(request("/v1/platform/modules/requests", "POST", {
    organizationId, idempotencyKey: "module-submit-0002", manifest, manifestDigest: "f".repeat(64),
  }), res, pool, userId);
  assert.equal(res.status, 400);
  assert.equal(JSON.parse(res.body).error, "manifest_digest_must_be_computed_by_server");
  assert.equal(calls.length, 0);
});

test("non-publisher submission is denied by database RLS", async () => {
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT id, organization_id AS")) return { rows: [] };
    if (sql.startsWith("SELECT id FROM core.organizations")) return { rows: [{ id: organizationId }] };
    if (sql.startsWith("INSERT INTO platform.module_requests")) {
      const error = new Error("row-level security denied");
      error.code = "42501";
      throw error;
    }
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request("/v1/platform/modules/requests", "POST", {
    organizationId, idempotencyKey: "module-submit-0003", manifest,
  }), res, pool, userId);
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, "active_module_publisher_required");
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
});

test("idempotent retry returns the existing request without adding another event", async () => {
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT id, organization_id AS")) return { rows: [{ id: requestId, status: "submitted" }] };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request("/v1/platform/modules/requests", "POST", {
    organizationId, idempotencyKey: "module-submit-0001", manifest,
  }), res, pool, userId);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).data.id, requestId);
  assert.equal(calls.some((call) => call.sql.startsWith("INSERT INTO platform.module_request_events")), false);
});

test("non-admin cannot access the Module Registry review queue", async () => {
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ allowed: false }] };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request("/v1/platform/admin/modules/requests"), res, pool, userId);
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, "platform_super_admin_required");
  assert.equal(calls.some((call) => call.sql === "SET LOCAL ROLE pondok_platform_runtime"), false);
});

test("Super Admin approval locks the request and appends the transition event", async () => {
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ allowed: true }] };
    if (sql.includes("FOR UPDATE")) return { rows: [{
      id: requestId, organization_id: organizationId, module_id: manifest.moduleId,
      manifest_digest: digest, submitted_by: "423e4567-e89b-42d3-a456-426614174000",
      status: "submitted", created_at: new Date("2026-11-01T00:00:00.000Z"),
      updated_at: new Date("2026-11-01T00:00:00.000Z"),
    }] };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request(`/v1/platform/admin/modules/requests/${requestId}/approve`, "POST"), res, pool, userId);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).data.status, "approved");
  assert.ok(calls.some((call) => call.sql === "SET LOCAL ROLE pondok_platform_runtime"));
  assert.ok(calls.some((call) => call.sql.startsWith("UPDATE platform.module_requests")));
  assert.ok(calls.some((call) => call.sql.startsWith("INSERT INTO platform.module_request_events")));
  assert.ok(calls.some((call) => call.sql.startsWith("INSERT INTO platform.audit_events")));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("submitter cannot approve their own module request", async () => {
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ allowed: true }] };
    if (sql.includes("FOR UPDATE")) return { rows: [{
      id: requestId, organization_id: organizationId, module_id: manifest.moduleId,
      manifest_digest: digest, submitted_by: userId, status: "submitted",
      created_at: new Date("2026-11-01T00:00:00.000Z"),
      updated_at: new Date("2026-11-01T00:00:00.000Z"),
    }] };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request(`/v1/platform/admin/modules/requests/${requestId}/approve`, "POST"), res, pool, userId);
  assert.equal(res.status, 409);
  assert.equal(JSON.parse(res.body).error, "self_approval_forbidden");
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
  assert.equal(calls.some((call) => call.sql.startsWith("UPDATE platform.module_requests")), false);
});
