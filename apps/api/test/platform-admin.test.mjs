import test from "node:test";
import assert from "node:assert/strict";
import { handlePlatformRequest, validateActivationRequest } from "../dist/platform-admin.js";

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

test("validates the institution application and rejects unsafe slugs or unsupported types", () => {
  assert.equal(validateActivationRequest(valid), null);
  assert.equal(validateActivationRequest({ ...valid, organizationSlug: "../other" }), "invalid_organization_slug");
  assert.equal(validateActivationRequest({ ...valid, organizationType: "bank" }), "invalid_organization_type");
  assert.equal(validateActivationRequest({ ...valid, campusCode: "x" }), "invalid_campus_code");
});

test("a normal authenticated user cannot access company approval endpoints", async () => {
  const pool = { query: async () => ({ rows: [{ allowed: false }] }) };
  const res = response();
  await handlePlatformRequest(request("/v1/platform/admin/activation-requests"), res, pool, userId);
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, "platform_super_admin_required");
});

test("applicant can create a request without receiving a tenant or activation token", async () => {
  const calls = [];
  const pool = { query: async (sql, values = []) => {
    calls.push({ sql, values });
    if (sql.startsWith("INSERT INTO platform.activation_requests")) return { rows: [{ id: requestId, status: "pending" }] };
    return { rows: [] };
  } };
  const res = response();
  await handlePlatformRequest(request("/v1/platform/activation-requests", "POST", valid), res, pool, userId);
  assert.equal(res.status, 201);
  assert.equal(JSON.parse(res.body).data.status, "pending");
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /INSERT INTO platform\.activation_requests/);
  assert.doesNotMatch(res.body, /activationToken|organizationId/);
});

test("approval creates a high-entropy token and returns it once after commit", async () => {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("SELECT id, requested_by, status")) return { rows: [{ id: requestId, requested_by: userId, status: "pending" }] };
      return { rows: [] };
    },
    release() {}
  };
  const pool = {
    query: async () => ({ rows: [{ allowed: true }] }),
    connect: async () => client
  };
  const res = response();
  await handlePlatformRequest(request(`/v1/platform/admin/activation-requests/${requestId}/approve`, "POST"), res, pool, userId);
  const body = JSON.parse(res.body);
  assert.equal(res.status, 200);
  assert.equal(body.data.expiresInHours, 24);
  assert.match(body.data.activationToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
  const insert = calls.find((call) => call.sql.startsWith("INSERT INTO platform.activation_tokens"));
  assert.ok(insert);
  assert.equal(Buffer.isBuffer(insert.values[0]), true);
  assert.equal(insert.values[0].length, 32);
  assert.notEqual(insert.values[0].toString("utf8"), body.data.activationToken);
});
