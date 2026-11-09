import assert from "node:assert/strict";

const required = [
  "PONDOK_API_BASE_URL",
  "TENANT_A_BEARER_TOKEN",
  "TENANT_B_BEARER_TOKEN",
  "TENANT_A_ORGANIZATION_ID",
  "TENANT_B_ORGANIZATION_ID",
];
for (const key of required) {
  if (!process.env[key]?.trim()) throw new Error(`Missing required environment variable: ${key}`);
}

const base = new URL(process.env.PONDOK_API_BASE_URL);
const developmentHost = "br-proud-paper-b312lfxi-pondokapi.compute.c-4.ap-southeast-1.aws.neon.tech";
if (base.protocol !== "https:" || base.hostname !== developmentHost) {
  throw new Error(`Refusing live acceptance outside the approved Neon Development endpoint (${developmentHost})`);
}
const tokenA = process.env.TENANT_A_BEARER_TOKEN.trim();
const tokenB = process.env.TENANT_B_BEARER_TOKEN.trim();
const organizationA = process.env.TENANT_A_ORGANIZATION_ID.trim();
const organizationB = process.env.TENANT_B_ORGANIZATION_ID.trim();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
assert.match(organizationA, uuid, "Tenant A organization ID must be a UUID");
assert.match(organizationB, uuid, "Tenant B organization ID must be a UUID");
assert.notEqual(organizationA, organizationB, "The two UAT users must belong to different tenants");

function subject(token) {
  const parts = token.split(".");
  assert.equal(parts.length, 3, "Each Neon Auth access token must be a JWT");
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    assert.equal(typeof payload.sub, "string", "JWT must contain a subject");
    return payload.sub;
  } catch {
    throw new Error("A supplied access token is not a decodable JWT");
  }
}
assert.notEqual(subject(tokenA), subject(tokenB), "Tenant A and B must use two different authenticated users");

async function call(path, token, organizationId, method = "GET", body) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "x-organization-id": organizationId,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

async function verifyTenant(label, token, ownOrganization, foreignOrganization, ownSentinel, foreignSentinel) {
  const context = await call("/v1/tenant/context", token, ownOrganization);
  assert.equal(context.status, 200, `${label}: own tenant context must be accessible`);
  assert.equal(context.data?.organizationId, ownOrganization, `${label}: context must resolve the correct tenant`);
  assert.equal(context.data?.security?.runtimeRole, "pondok_runtime", `${label}: API must use the restricted tenant runtime role`);
  assert.equal(
    context.data?.security?.protectedTables,
    context.data?.security?.tenantTables,
    `${label}: every tenant-owned table must be protected by the readiness contract`,
  );

  const programs = await call("/v1/modules/programs", token, ownOrganization);
  assert.equal(programs.status, 200, `${label}: own tenant program list must be accessible`);
  assert.ok(Array.isArray(programs.data?.data), `${label}: program list must return a data array`);
  const serialized = JSON.stringify(programs.data);
  if (ownSentinel) {
    assert.ok(programs.data.data.some((row) => row.code === ownSentinel), `${label}: own tenant sentinel must be visible`);
  }
  if (foreignSentinel) {
    assert.equal(serialized.includes(foreignSentinel), false, `${label}: foreign tenant sentinel must never be disclosed`);
  }

  const wrongContext = await call("/v1/tenant/context", token, foreignOrganization);
  assert.equal(wrongContext.status, 403, `${label}: changing tenant context must be denied`);
  assert.equal(wrongContext.data?.error, "active_membership_required");

  const wrongRead = await call("/v1/modules/programs", token, foreignOrganization);
  assert.equal(wrongRead.status, 403, `${label}: cross-tenant reads must be denied`);

  // Deliberately invalid payload: even if a future authorization regression occurs,
  // domain validation prevents this probe from creating a record.
  const wrongWrite = await call("/v1/modules/programs", token, foreignOrganization, "POST", {});
  assert.equal(wrongWrite.status, 403, `${label}: cross-tenant writes must be denied before payload validation`);
}

const [a, b] = await Promise.all([
  verifyTenant("Tenant A", tokenA, organizationA, organizationB,
    process.env.TENANT_A_SENTINEL_PROGRAM_CODE?.trim() || null,
    process.env.TENANT_B_SENTINEL_PROGRAM_CODE?.trim() || null),
  verifyTenant("Tenant B", tokenB, organizationB, organizationA,
    process.env.TENANT_B_SENTINEL_PROGRAM_CODE?.trim() || null,
    process.env.TENANT_A_SENTINEL_PROGRAM_CODE?.trim() || null),
]);

process.stdout.write("LIVE NEON AUTH ACCEPTANCE PASSED: two distinct users, two distinct Development tenants, own-context access, restricted runtime role, cross-tenant context/read/write denial, and optional sentinel non-disclosure. No records were created or changed.\n");
