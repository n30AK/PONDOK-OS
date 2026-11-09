import test from "node:test";
import assert from "node:assert/strict";
import { createApiServer } from "../dist/main.js";

test("GET /health/live returns service liveness", async (context) => {
  const server = createApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/health/live`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "pondok-os-api" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("unknown routes return JSON 404", async (context) => {
  const server = createApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/unknown`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});

test("unsupported methods return 405 and Allow header", async (context) => {
  const server = createApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/health/live`, { method: "POST" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});

test("academic student POST route is not blocked by global method guard", async (context) => {
  const server = createApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/academic/students`, { method: "POST" });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "identity_or_database_not_configured" });
});

test("academic routes advertise POST while rejecting unsupported methods", async (context) => {
  const server = createApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/academic/students`, { method: "PUT" });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD, POST, PATCH");
});

test("readiness is distinct from liveness and requires database connectivity", async (context) => {
  const unavailable = createApiServer();
  await new Promise((resolve) => unavailable.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => unavailable.close((error) => error ? reject(error) : resolve())));
  const first = unavailable.address();
  assert.ok(first && typeof first === "object");
  const notReady = await fetch(`http://127.0.0.1:${first.port}/health/ready`);
  assert.equal(notReady.status, 503);
  assert.deepEqual(await notReady.json(), { status: "not_ready", dependency: "database_not_configured" });
});

function secureReadinessPool({ tenantProtected = 63, platformProtected = 79, failRoleSwitch = false } = {}) {
  return {
    query: async () => ({ rows: [{ "?column?": 1 }] }),
    connect: async () => ({
      query: async (sql) => {
        if (failRoleSwitch && sql === "SET LOCAL ROLE pondok_runtime") throw new Error("role_switch_denied");
        if (sql.includes("tenant_table_count")) return { rows: [{
          runtime_role: "pondok_runtime",
          role_can_login: false,
          role_bypasses_rls: false,
          memberships_rls: true,
          tenant_table_count: 63,
          protected_table_count: tenantProtected,
        }] };
        if (sql.includes("platform_table_count")) return { rows: [{
          runtime_role: "pondok_platform_runtime",
          role_can_login: false,
          role_bypasses_rls: false,
          platform_table_count: 79,
          protected_platform_table_count: platformProtected,
        }] };
        return { rows: [] };
      },
      release() {},
    }),
  };
}

test("readiness requires database connectivity and both restricted RLS runtime roles", async (context) => {
  const server = createApiServer({ pool: secureReadinessPool() });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ready",
    service: "pondok-os-api",
    dependencies: { database: "ok", tenantSecurity: "ok", platformSecurity: "ok" },
  });
});

test("readiness fails closed when any tenant table lacks its FORCE RLS isolation policy", async (context) => {
  const server = createApiServer({ pool: secureReadinessPool({ tenantProtected: 62 }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "not_ready", dependency: "database_security_controls_unavailable" });
});

test("readiness fails closed when the tenant runtime role cannot be assumed", async (context) => {
  const server = createApiServer({ pool: secureReadinessPool({ failRoleSwitch: true }) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "not_ready", dependency: "database_security_controls_unavailable" });
});

test("development CORS preflight allows the local Vite origin", async (context) => {
  const server = createApiServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/v1/academic/students`, {
    method: "OPTIONS",
    headers: { origin: "http://localhost:5173", "access-control-request-method": "POST" }
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.match(response.headers.get("access-control-allow-headers") ?? "", /X-Organization-Id/i);
});
