import test from "node:test";
import assert from "node:assert/strict";

process.env.CORS_ALLOWED_ORIGINS = "https://n30ak.github.io";
process.env.DATABASE_URL = "postgresql://neondb_owner:owner-password@127.0.0.1:5432/pondok";
delete process.env.PONDOK_DATABASE_URL;
const { default: adapter } = await import("../dist/neon-function.js");

test("Neon fetch adapter refuses the managed owner DATABASE_URL fallback", async () => {
  const response = await adapter.fetch(new Request("https://pondok.invalid/health/ready"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    status: "not_ready",
    dependency: "database_not_configured",
  });
});

test("Neon fetch adapter serves the existing API liveness route", async () => {
  const response = await adapter.fetch(new Request("https://pondok.invalid/health/live"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", service: "pondok-os-api" });
});

test("Neon fetch adapter preserves allowed-origin CORS preflight", async () => {
  const response = await adapter.fetch(new Request("https://pondok.invalid/v1/tenant/context", {
    method: "OPTIONS",
    headers: {
      origin: "https://n30ak.github.io",
      "access-control-request-method": "GET",
    },
  }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://n30ak.github.io");
});

test("Neon fetch adapter rejects disallowed-origin preflight", async () => {
  const response = await adapter.fetch(new Request("https://pondok.invalid/v1/tenant/context", {
    method: "OPTIONS",
    headers: { origin: "https://attacker.invalid" },
  }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "cors_origin_not_allowed" });
});

test("Neon fetch adapter suppresses response bodies for HEAD", async () => {
  const response = await adapter.fetch(new Request("https://pondok.invalid/health/live", { method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("Neon fetch adapter bounds request body buffering", async () => {
  const response = await adapter.fetch(new Request("https://pondok.invalid/v1/bootstrap/organization", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "x".repeat(1_048_577),
  }));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "request_body_too_large" });
});
