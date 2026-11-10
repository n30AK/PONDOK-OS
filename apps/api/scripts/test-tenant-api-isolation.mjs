import assert from "node:assert/strict";
import { Pool } from "pg";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApiServer } from "../dist/main.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for tenant API isolation tests");

const issuer = "https://pondok-api-isolation.invalid";
const tenantA = "a1000000-0000-4000-8000-000000000001";
const tenantB = "b1000000-0000-4000-8000-000000000002";
const userA = "a2000000-0000-4000-8000-000000000001";
const userB = "b2000000-0000-4000-8000-000000000002";
const pool = new Pool({ connectionString, max: 8 });
let server;

async function createToken(userId, privateKey, kid) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setSubject(userId)
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO core.organizations (id,slug,name,organization_type,status)
       VALUES ($1,'api-isolation-a','API Isolation Tenant A','pesantren','active'),
              ($2,'api-isolation-b','API Isolation Tenant B','pesantren','active')`,
      [tenantA, tenantB],
    );
    const memberships = await client.query(
      `INSERT INTO core.organization_memberships (organization_id,user_id,membership_status)
       VALUES ($1,$2,'active'),($3,$4,'active')
       RETURNING id, organization_id`,
      [tenantA, userA, tenantB, userB],
    );
    await client.query(
      `INSERT INTO platform.tenant_licenses (organization_id,plan_code,status,starts_at,ends_at,created_by)
       VALUES ($1,'ci-active','active',now(),NULL,$2),($3,'ci-active','active',now(),NULL,$4)`,
      [tenantA, userA, tenantB, userB],
    );
    const ownerRole = await client.query(
      "SELECT id FROM core.roles WHERE organization_id IS NULL AND role_key='institution_owner' AND is_system=true LIMIT 1",
    );
    assert.ok(ownerRole.rows[0]?.id, "institution owner role template must exist");
    for (const membership of memberships.rows) {
      await client.query(
        "INSERT INTO core.membership_roles (membership_id,role_id) VALUES ($1::uuid,$2::uuid)",
        [membership.id, ownerRole.rows[0].id],
      );
    }
    await client.query(
      "INSERT INTO academic.programs (organization_id,code,name) VALUES ($1,'ONLY-A','Tenant A program'),($2,'ONLY-B','Tenant B program')",
      [tenantA, tenantB],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const kid = "pondok-api-isolation-ci";
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid, alg: "EdDSA", use: "sig" });
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const tokenA = await createToken(userA, privateKey, kid);
  const tokenB = await createToken(userB, privateKey, kid);

  server = createApiServer({ jwks, issuer, pool });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function api(path, token, organizationId, method = "GET", body) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "x-organization-id": organizationId,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  const contextA = await api("/v1/tenant/context", tokenA, tenantA);
  assert.equal(contextA.status, 200, "tenant A's authenticated user can load its own context");
  const contextAData = await contextA.json();
  assert.equal(contextAData.organizationId, tenantA);
  assert.equal(contextAData.security.runtimeRole, "pondok_runtime");
  assert.equal(contextAData.security.protectedTables, contextAData.security.tenantTables);

  const programsA = await api("/v1/modules/programs", tokenA, tenantA);
  assert.equal(programsA.status, 200, "tenant A can read its own module records");
  const programsAData = await programsA.json();
  assert.deepEqual(programsAData.data.map((row) => row.code), ["ONLY-A"]);
  assert.equal(JSON.stringify(programsAData).includes("ONLY-B"), false, "tenant A response must not disclose tenant B records");

  const wrongTenantContext = await api("/v1/tenant/context", tokenA, tenantB);
  assert.equal(wrongTenantContext.status, 403, "changing the organization header cannot grant tenant B membership");
  assert.deepEqual(await wrongTenantContext.json(), { error: "active_membership_required" });

  const wrongTenantRead = await api("/v1/modules/programs", tokenA, tenantB);
  assert.equal(wrongTenantRead.status, 403, "cross-tenant module reads are denied at the API boundary");

  const wrongTenantWrite = await api(
    "/v1/modules/programs",
    tokenA,
    tenantB,
    "POST",
    { code: "CROSS-TENANT", name: "Must never be created" },
  );
  assert.equal(wrongTenantWrite.status, 403, "cross-tenant module writes are denied at the API boundary");

  const contextB = await api("/v1/tenant/context", tokenB, tenantB);
  assert.equal(contextB.status, 200, "tenant B's authenticated user can load its own context");
  const programsB = await api("/v1/modules/programs", tokenB, tenantB);
  assert.equal(programsB.status, 200);
  const programsBData = await programsB.json();
  assert.deepEqual(programsBData.data.map((row) => row.code), ["ONLY-B"]);
  assert.equal(JSON.stringify(programsBData).includes("ONLY-A"), false, "tenant B response must not disclose tenant A records");

  process.stdout.write("Tenant API isolation passed: signed identities, own-tenant reads, changed-header denial, and cross-tenant read/write denial.\n");
} finally {
  if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
}
