import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { handleFirstOrganizationBootstrap, validateFirstOrganizationInput } from "../dist/first-organization-bootstrap.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const organizationId = "223e4567-e89b-42d3-a456-426614174000";
const membershipId = "423e4567-e89b-42d3-a456-426614174000";
const campusId = "323e4567-e89b-42d3-a456-426614174000";
const roleId = "523e4567-e89b-42d3-a456-426614174000";
const validBody = { slug: "pondok-contoh", organizationName: "Pondok Contoh", campusCode: "UTAMA", campusName: "Kampus Utama" };

function request(body, token) {
  return {
    url: "/v1/bootstrap/organization", method: "POST",
    headers: { "x-bootstrap-token": token },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); }
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
function bootstrapPool({ failAt } = {}) {
  const statements = [];
  let released = false;
  const client = {
    async query(sql, values = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      statements.push({ sql: normalized, values });
      if (failAt && normalized.startsWith(failAt)) {
        const error = new Error("simulated database failure");
        error.code = "42501";
        throw error;
      }
      if (normalized.startsWith("SELECT EXISTS")) return { rows: [{ exists: false }] };
      if (normalized.startsWith("SELECT id FROM core.roles")) return { rows: [{ id: roleId }] };
      if (normalized.startsWith("INSERT INTO core.organizations")) return { rows: [{ id: organizationId }] };
      if (normalized.startsWith("INSERT INTO core.organization_memberships")) return { rows: [{ id: membershipId }] };
      if (normalized.startsWith("INSERT INTO core.campuses")) return { rows: [{ id: campusId }] };
      return { rows: [] };
    },
    release() { released = true; }
  };
  return {
    statements,
    get released() { return released; },
    connect: async () => client
  };
}

test("validates first organization details", () => {
  assert.equal(validateFirstOrganizationInput(validBody), null);
  assert.equal(validateFirstOrganizationInput({ ...validBody, slug: "Pondok Contoh" }), "invalid_organization_slug");
});

test("requires a valid one-time setup token before database access", async () => {
  let connected = false;
  const res = response();
  await handleFirstOrganizationBootstrap(request(validBody, "x".repeat(32)), res,
    { connect: async () => { connected = true; throw new Error("must not connect"); } }, userId, "0".repeat(64));
  assert.equal(res.status, 403);
  assert.equal(connected, false);
});

test("creates the first institution with membership before FORCE RLS tenant writes", async () => {
  const token = "pondok-bootstrap-token-with-high-entropy";
  const hash = createHash("sha256").update(token).digest("hex");
  const res = response();
  const pool = bootstrapPool();
  await handleFirstOrganizationBootstrap(request(validBody, token), res, pool, userId, hash);
  assert.equal(res.status, 201);
  assert.deepEqual(JSON.parse(res.body).data, { organizationId, campusId, membershipId });

  const sql = pool.statements.map((entry) => entry.sql);
  const membershipAt = sql.findIndex((statement) => statement.startsWith("INSERT INTO core.organization_memberships"));
  const contextAt = sql.findIndex((statement) => statement.startsWith("SELECT set_config"));
  const campusAt = sql.findIndex((statement) => statement.startsWith("INSERT INTO core.campuses"));
  const auditAt = sql.findIndex((statement) => statement.startsWith("INSERT INTO audit.audit_events"));
  assert.ok(membershipAt >= 0 && membershipAt < contextAt, "membership must exist before tenant context is installed");
  assert.ok(contextAt < campusAt, "tenant context must be installed before campus insertion");
  assert.ok(campusAt < auditAt, "campus and audit writes must occur after active membership/context");
  assert.equal(sql.at(-1), "COMMIT");
  assert.equal(pool.released, true);
});

test("rolls back and releases the connection when an RLS-protected insert fails", async () => {
  const token = "pondok-bootstrap-token-with-high-entropy";
  const hash = createHash("sha256").update(token).digest("hex");
  const res = response();
  const pool = bootstrapPool({ failAt: "INSERT INTO core.campuses" });
  await handleFirstOrganizationBootstrap(request(validBody, token), res, pool, userId, hash);
  assert.equal(res.status, 500);
  assert.ok(pool.statements.some((entry) => entry.sql === "ROLLBACK"));
  assert.equal(pool.released, true);
});
