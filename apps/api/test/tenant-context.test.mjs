import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { createApiServer } from "../dist/main.js";

const issuer = "https://auth.example.test";
const userId = "a7e6e2e2-8c2a-4e10-9b2e-3a18f9a6d4c1";
const organizationId = "b8f7f3f3-9d3b-4f21-8c3f-4b29a0b7e5d2";

async function setupServer(context, membershipRows) {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: "tenant-test-key", alg: "EdDSA", use: "sig" });
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", kid: "tenant-test-key" })
    .setSubject(userId).setIssuer(issuer).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  let queryArgs;
  const pool = {
    async query(_sql, values) {
      queryArgs = values;
      return { rows: membershipRows };
    },
  };
  const server = createApiServer({ jwks, issuer, pool });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    token,
    get queryArgs() { return queryArgs; },
    request: (headers = {}) => fetch(`http://127.0.0.1:${address.port}/v1/tenant/context`, { headers }),
  };
}

test("tenant context rejects requests without a bearer token", async (context) => {
  const app = await setupServer(context, []);
  const response = await app.request({ "x-organization-id": organizationId });
  assert.equal(response.status, 401);
});

test("tenant context denies a valid identity without active membership", async (context) => {
  const app = await setupServer(context, []);
  const response = await app.request({
    authorization: `Bearer ${app.token}`,
    "x-organization-id": organizationId,
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "active_membership_required" });
  assert.deepEqual(app.queryArgs, [userId, organizationId]);
});

test("tenant context returns roles and permissions from database membership", async (context) => {
  const app = await setupServer(context, [{
    membership_id: "c9a8a4a4-0e4c-4a32-9d4f-5c30b1c8f6e3",
    organization_id: organizationId,
    roles: ["academic_admin"],
    permissions: ["academic.students.read", "academic.attendance.write"],
  }]);
  const response = await app.request({
    authorization: `Bearer ${app.token}`,
    "x-organization-id": organizationId,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    userId,
    organizationId,
    membershipId: "c9a8a4a4-0e4c-4a32-9d4f-5c30b1c8f6e3",
    roles: ["academic_admin"],
    permissions: ["academic.students.read", "academic.attendance.write"],
  });
});
