import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  const applicantUserId = "923e4567-e89b-42d3-a456-426614174000";
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ allowed: true }] };
    if (sql.startsWith("SELECT id, requested_by, status")) return { rows: [{ id: requestId, requested_by: applicantUserId, status: "pending" }] };
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
  assert.equal(insert.values[2], applicantUserId, "activation token remains bound to the applicant, not the approver");
});

test("a Super Admin cannot approve their own institution activation request", async () => {
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ allowed: true }] };
    if (sql.startsWith("SELECT id, requested_by, status")) return { rows: [{ id: requestId, requested_by: userId, status: "pending" }] };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request(`/v1/platform/admin/activation-requests/${requestId}/approve`, "POST"), res, pool, userId);
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, "activation_request_self_approval_forbidden");
  assert.ok(!calls.some((call) => call.sql.startsWith("INSERT INTO platform.activation_tokens")));
  assert.ok(!calls.some((call) => call.sql.startsWith("UPDATE platform.activation_requests")));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
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


test("first tenant bootstrap is super-admin-only, verified-user-bound and atomic", async () => {
  const calls = [];
  const { pool } = poolWithClient(async (sql, values) => {
    calls.push({ sql, values });
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ allowed: true }] };
    if (sql.startsWith("SELECT count(*)::int AS total")) return { rows: [{ total: 0 }] };
    if (sql.startsWith("SELECT id FROM core.roles")) return { rows: [{ id: requestId }] };
    if (sql.startsWith("INSERT INTO core.organizations")) return { rows: [{ id: "323e4567-e89b-42d3-a456-426614174000" }] };
    if (sql.startsWith("INSERT INTO core.organization_memberships")) return { rows: [{ id: "423e4567-e89b-42d3-a456-426614174000" }] };
    if (sql.startsWith("INSERT INTO core.campuses")) return { rows: [{ id: "523e4567-e89b-42d3-a456-426614174000" }] };
    return { rows: [] };
  }, async (sql) => {
    if (sql.includes('FROM neon_auth."user"')) return { rows: [{ email: "admin@example.org" }] };
    throw new Error("unexpected owner query: " + sql);
  });
  const res = response();
  await handlePlatformRequest(request("/v1/platform/admin/bootstrap-first-tenant", "POST", {
    contactName: "Administrator", organizationName: "Pondok Contoh", organizationSlug: "pondok-contoh",
    organizationType: "pesantren", campusCode: "UTAMA", campusName: "Kampus Utama"
  }), res, pool, userId);
  assert.equal(res.status, 201);
  const data = JSON.parse(res.body).data;
  assert.equal(data.organizationId, "323e4567-e89b-42d3-a456-426614174000");
  assert.ok(calls.some(call => call.sql.startsWith("SELECT pg_advisory_xact_lock")));
  assert.ok(calls.some(call => call.sql.startsWith("INSERT INTO core.membership_roles")));
  assert.ok(calls.some(call => call.sql.startsWith("INSERT INTO audit.audit_events")));
  assert.ok(calls.some(call => call.sql.startsWith("INSERT INTO platform.audit_events")));
  assert.ok(calls.some(call => call.sql === "COMMIT"));
});

test("first tenant bootstrap is one-time and refuses when any organization already exists", async () => {
  const { pool } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ allowed: true }] };
    if (sql.startsWith("SELECT count(*)::int AS total")) return { rows: [{ total: 1 }] };
    return { rows: [] };
  }, async () => ({ rows: [{ email: "admin@example.org" }] }));
  const res = response();
  await handlePlatformRequest(request("/v1/platform/admin/bootstrap-first-tenant", "POST", {
    contactName: "Administrator", organizationName: "Pondok Contoh", organizationSlug: "pondok-contoh",
    organizationType: "pesantren", campusCode: "UTAMA", campusName: "Kampus Utama"
  }), res, pool, userId);
  assert.equal(res.status, 409);
  assert.equal(JSON.parse(res.body).error, "first_tenant_already_exists");
});


test("platform audit feed is Super Admin-only, bounded, and read-only", async () => {
  const { pool, calls } = poolWithClient(async (sql, values) => {
    if (sql.startsWith("SELECT EXISTS")) return { rows: [{ allowed: true }] };
    if (sql.startsWith("SELECT id, actor_user_id")) return { rows: [{ id: requestId, actorUserId: userId, action: "activation.approved", resourceType: "activation_request", resourceId: requestId, metadata: {}, occurredAt: new Date().toISOString() }] };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request("/v1/platform/admin/audit-events?limit=500"), res, pool, userId);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).data[0].action, "activation.approved");
  const query = calls.find((call) => call.sql.startsWith("SELECT id, actor_user_id"));
  assert.ok(query);
  assert.deepEqual(query.values, [200], "audit feed limit is capped at 200");
  assert.ok(calls.findIndex((call) => call.sql === "SET LOCAL ROLE pondok_platform_runtime") > calls.findIndex((call) => call.sql.startsWith("SELECT EXISTS")));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("non-admin cannot read platform audit feed", async () => {
  const { pool, calls } = poolWithClient(async () => ({ rows: [] }));
  const res = response();
  await handlePlatformRequest(request("/v1/platform/admin/audit-events"), res, pool, userId);
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, "platform_super_admin_required");
  assert.ok(!calls.some((call) => call.sql.startsWith("SELECT id, actor_user_id")));
});


test("activation redemption creates the tenant atomically and consumes a user-bound token", async () => {
  const activationToken = "activation-token-with-more-than-forty-characters-1234567890";
  const organizationId = "323e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  const campusId = "523e4567-e89b-42d3-a456-426614174000";
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT t.request_id")) return { rows: [{
      request_id: requestId, requested_by: userId, organization_name: valid.organizationName,
      organization_slug: valid.organizationSlug, organization_type: valid.organizationType,
      campus_code: valid.campusCode, campus_name: valid.campusName, status: "approved"
    }] };
    if (sql.startsWith("SELECT id FROM core.roles")) return { rows: [{ id: "623e4567-e89b-42d3-a456-426614174000" }] };
    if (sql.startsWith("INSERT INTO core.organizations")) return { rows: [{ id: organizationId }] };
    if (sql.startsWith("INSERT INTO core.organization_memberships")) return { rows: [{ id: membershipId }] };
    if (sql.startsWith("INSERT INTO core.campuses")) return { rows: [{ id: campusId }] };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request("/v1/platform/activate", "POST", { activationToken }), res, pool, userId);
  assert.equal(res.status, 201);
  assert.deepEqual(JSON.parse(res.body).data, { organizationId, membershipId, campusId });
  const tokenLookup = calls.find((call) => call.sql.startsWith("SELECT t.request_id"));
  assert.ok(tokenLookup);
  assert.equal(Buffer.isBuffer(tokenLookup.values[0]), true);
  assert.equal(tokenLookup.values[0].toString("hex"), createHash("sha256").update(activationToken, "utf8").digest("hex"));
  assert.equal(tokenLookup.values[1], userId);
  assert.ok(tokenLookup.sql.includes("t.consumed_at IS NULL"));
  assert.ok(tokenLookup.sql.includes("t.expires_at > now()"));
  assert.ok(tokenLookup.sql.includes("r.status = 'approved'"));
  const roleSwitch = calls.findIndex((call) => call.sql === "SET LOCAL ROLE pondok_platform_runtime");
  const tokenCheck = calls.findIndex((call) => call.sql.startsWith("SELECT t.request_id"));
  const organizationInsert = calls.findIndex((call) => call.sql.startsWith("INSERT INTO core.organizations"));
  const tokenConsume = calls.findIndex((call) => call.sql.startsWith("UPDATE platform.activation_tokens"));
  const membershipInsert = calls.findIndex((call) => call.sql.startsWith("INSERT INTO core.organization_memberships"));
  const campusInsert = calls.findIndex((call) => call.sql.startsWith("INSERT INTO core.campuses"));
  assert.ok(roleSwitch >= 0 && roleSwitch < tokenCheck);
  assert.ok(tokenCheck < organizationInsert && organizationInsert < tokenConsume);
  assert.ok(tokenConsume < membershipInsert && membershipInsert < campusInsert);
  const trialLicense = calls.find((call) => call.sql.startsWith("INSERT INTO platform.tenant_licenses"));
  assert.ok(trialLicense, "redeeming the approved activation must issue a trial license");
  assert.ok(trialLicense.sql.includes("NULL"), "trial entitlement remains pending until first workspace access");
  assert.ok(!trialLicense.sql.includes("14 days"), "activation must not start the 14-day countdown");
  assert.deepEqual(trialLicense.values, [organizationId, userId]);
  assert.ok(calls.indexOf(trialLicense) > campusInsert, "trial entitlement is issued inside the tenant activation transaction");
  assert.ok(calls.some((call) => call.sql.startsWith("INSERT INTO platform.audit_events")));
  assert.ok(calls.some((call) => call.sql.startsWith("INSERT INTO audit.audit_events")));
  assert.ok(calls.some((call) => call.sql === "COMMIT"));
});

test("activation token cannot be redeemed by another user or replayed after consumption", async () => {
  const activationToken = "activation-token-with-more-than-forty-characters-1234567890";
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT t.request_id")) return { rows: [] };
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request("/v1/platform/activate", "POST", { activationToken }), res, pool, "923e4567-e89b-42d3-a456-426614174000");
  assert.equal(res.status, 403);
  assert.equal(JSON.parse(res.body).error, "activation_token_invalid_expired_or_used");
  assert.ok(!calls.some((call) => call.sql.startsWith("INSERT INTO core.organizations")));
  assert.ok(!calls.some((call) => call.sql.startsWith("INSERT INTO core.organization_memberships")));
  const tokenLookup = calls.find((call) => call.sql.startsWith("SELECT t.request_id"));
  assert.ok(tokenLookup);
  assert.equal(tokenLookup.values[1], "923e4567-e89b-42d3-a456-426614174000");
  assert.ok(calls.some((call) => call.sql === "COMMIT"), "a rejected read-only token lookup closes its transaction cleanly");
  assert.ok(!calls.some((call) => call.sql === "ROLLBACK"));
});

test("activation redemption rolls back all tenant creation when a later insert fails", async () => {
  const activationToken = "activation-token-with-more-than-forty-characters-1234567890";
  const { pool, calls } = poolWithClient(async (sql) => {
    if (sql.startsWith("SELECT t.request_id")) return { rows: [{
      request_id: requestId, requested_by: userId, organization_name: valid.organizationName,
      organization_slug: valid.organizationSlug, organization_type: valid.organizationType,
      campus_code: valid.campusCode, campus_name: valid.campusName, status: "approved"
    }] };
    if (sql.startsWith("SELECT id FROM core.roles")) return { rows: [{ id: "623e4567-e89b-42d3-a456-426614174000" }] };
    if (sql.startsWith("INSERT INTO core.organizations")) return { rows: [{ id: "323e4567-e89b-42d3-a456-426614174000" }] };
    if (sql.startsWith("INSERT INTO core.organization_memberships")) return { rows: [{ id: "423e4567-e89b-42d3-a456-426614174000" }] };
    if (sql.startsWith("INSERT INTO core.campuses")) { const error = new Error("simulated campus failure"); error.code = "23503"; throw error; }
    return { rows: [] };
  });
  const res = response();
  await handlePlatformRequest(request("/v1/platform/activate", "POST", { activationToken }), res, pool, userId);
  assert.equal(res.status, 500);
  assert.equal(JSON.parse(res.body).error, "activation_failed");
  assert.ok(calls.some((call) => call.sql === "ROLLBACK"));
  assert.ok(!calls.some((call) => call.sql === "COMMIT"));
});
