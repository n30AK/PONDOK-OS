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
  assert.equal(response.headers.get("allow"), "GET, HEAD, POST");
});
