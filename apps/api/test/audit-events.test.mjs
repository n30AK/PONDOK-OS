import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleTenantAuditRequest } from "../dist/audit-events.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const organizationId = "223e4567-e89b-42d3-a456-426614174000";

function responseDouble() {
  return {
    statusCode: 0, headers: {}, body: "",
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body ?? ""; }
  };
}
function request(method, url) {
  const stream = Readable.from([]);
  stream.method = method; stream.url = url; stream.headers = {};
  return stream;
}
function tenantRow(permissions) {
  return { membership_id: "423e4567-e89b-42d3-a456-426614174000", organization_id: organizationId, roles: ["auditor"], permissions };
}

test("reads only safe audit columns within the active tenant", async () => {
  const calls = [];
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["audit.events.read"])] };
    if (sql.includes("FROM audit.audit_events")) return { rows: [{ id: "1", action: "module.record.create", resource_type: "academic.programs", resource_id: "2", occurred_at: "2026-11-12T00:00:00Z" }] };
    throw new Error("unexpected query");
  }};
  const res = responseDouble();
  await handleTenantAuditRequest(request("GET", "/v1/audit/events?limit=25"), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).data.length, 1);
  const query = calls.find(call => call.sql.includes("FROM audit.audit_events"));
  assert.deepEqual(query.values, [organizationId, 25]);
  assert.match(query.sql, /WHERE organization_id = \$1::uuid/);
  assert.doesNotMatch(query.sql, /metadata|actor_user_id/);
});

test("denies memberships without audit.events.read before querying audit data", async () => {
  let auditRead = false;
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["reports.read"])] };
    if (sql.includes("FROM audit.audit_events")) auditRead = true;
    throw new Error("unexpected query");
  }};
  const res = responseDouble();
  await handleTenantAuditRequest(request("GET", "/v1/audit/events"), res, pool, userId, organizationId);
  assert.equal(res.statusCode, 403);
  assert.equal(auditRead, false);
});

test("rejects writes and invalid pagination", async () => {
  const pool = { async query(sql) {
    if (sql.includes("FROM core.organization_memberships")) return { rows: [tenantRow(["audit.events.read"])] };
    throw new Error("audit data query must not run");
  }};
  const writeRes = responseDouble();
  await handleTenantAuditRequest(request("POST", "/v1/audit/events"), writeRes, pool, userId, organizationId);
  assert.equal(writeRes.statusCode, 405);
  const limitRes = responseDouble();
  await handleTenantAuditRequest(request("GET", "/v1/audit/events?limit=1000"), limitRes, pool, userId, organizationId);
  assert.equal(limitRes.statusCode, 400);
});
