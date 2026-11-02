import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { handleFirstOrganizationBootstrap, validateFirstOrganizationInput } from "../dist/first-organization-bootstrap.js";

const userId = "123e4567-e89b-42d3-a456-426614174000";
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

test("validates first organization details", () => {
  assert.equal(validateFirstOrganizationInput(validBody), null);
  assert.equal(validateFirstOrganizationInput({ ...validBody, slug: "Pondok Contoh" }), "invalid_organization_slug");
});
test("requires a valid one-time setup token before database access", async () => {
  let queried = false;
  const res = response();
  await handleFirstOrganizationBootstrap(request(validBody, "x".repeat(32)), res,
    { query: async () => { queried = true; return { rows: [] }; } }, userId, "0".repeat(64));
  assert.equal(res.status, 403);
  assert.equal(queried, false);
});
test("creates the first institution only after a verified token", async () => {
  const token = "pondok-bootstrap-token-with-high-entropy";
  const hash = createHash("sha256").update(token).digest("hex");
  const res = response();
  const pool = { query: async () => ({ rows: [{ organizationId: "223e4567-e89b-42d3-a456-426614174000", campusId: "323e4567-e89b-42d3-a456-426614174000", membershipId: "423e4567-e89b-42d3-a456-426614174000" }] }) };
  await handleFirstOrganizationBootstrap(request(validBody, token), res, pool, userId, hash);
  assert.equal(res.status, 201);
  assert.equal(JSON.parse(res.body).data.organizationId, "223e4567-e89b-42d3-a456-426614174000");
});
