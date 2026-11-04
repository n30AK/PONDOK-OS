import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { Pool } from "pg";
import { readBearerToken, verifyAccessToken } from "./identity.js";
import { loadTenantContext } from "./tenant-access.js";
import { handleAcademicRequest } from "./academic.js";
import { handleSyncRequest } from "./sync.js";
import { handleFinanceRequest } from "./finance.js";
import { handleInventoryRequest } from "./inventory.js";
import { handleHrRequest } from "./hr.js";
import { handleFirstOrganizationBootstrap } from "./first-organization-bootstrap.js";
import { withTenantScope, type TenantDatabase } from "./tenant-db.js";

export const SERVICE_NAME = "pondok-os-api";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ApiDependencies {
  jwks?: JWTVerifyGetKey;
  issuer?: string;
  pool?: TenantDatabase;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  });
  response.end(JSON.stringify(body));
}

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApiDependencies = {},
): Promise<void> {
  const method = request.method ?? "GET";
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const origin = request.headers.origin;
  const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const developmentOrigins = process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:5173", "http://127.0.0.1:5173"];
  const originAllowed = typeof origin === "string"
    && [...configuredOrigins, ...developmentOrigins].includes(origin);
  if (originAllowed && origin) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("access-control-allow-methods", "GET, HEAD, POST, PATCH, OPTIONS");
    response.setHeader("access-control-allow-headers", "Authorization, Content-Type, X-Organization-Id, X-Bootstrap-Token");
    response.setHeader("access-control-max-age", "600");
    response.setHeader("vary", "Origin");
  }
  if (method === "OPTIONS") {
    if (!originAllowed) {
      sendJson(response, 403, { error: "cors_origin_not_allowed" });
      return;
    }
    response.writeHead(204);
    response.end();
    return;
  }

  const writeRoute = pathname.startsWith("/v1/academic/") || pathname.startsWith("/v1/sync/") || pathname.startsWith("/v1/finance/") || pathname.startsWith("/v1/inventory/") || pathname.startsWith("/v1/hr/") || pathname.startsWith("/v1/bootstrap/");
  const allowedMethods = pathname.startsWith("/v1/academic/")
    ? ["GET", "HEAD", "POST", "PATCH"]
    : writeRoute ? ["GET", "HEAD", "POST"] : ["GET", "HEAD"];
  if (!allowedMethods.includes(method)) {
    response.setHeader("allow", allowedMethods.join(", "));
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  if (pathname === "/health/live") {
    sendJson(response, 200, { status: "ok", service: SERVICE_NAME });
    return;
  }

  if (pathname === "/health/ready") {
    if (!dependencies.pool) {
      sendJson(response, 503, { status: "not_ready", dependency: "database_not_configured" });
      return;
    }
    try {
      await dependencies.pool.query("SELECT 1");
      sendJson(response, 200, { status: "ready", service: SERVICE_NAME, dependencies: { database: "ok" } });
    } catch {
      sendJson(response, 503, { status: "not_ready", dependency: "database_unavailable" });
    }
    return;
  }

  if (pathname === "/v1/tenant/context") {
    if (!dependencies.jwks || !dependencies.issuer || !dependencies.pool) {
      sendJson(response, 503, { error: "identity_or_database_not_configured" });
      return;
    }

    const token = readBearerToken(request.headers.authorization);
    if (!token) {
      sendJson(response, 401, { error: "unauthorized" });
      return;
    }

    const organizationId = request.headers["x-organization-id"];
    if (typeof organizationId !== "string" || !UUID_PATTERN.test(organizationId)) {
      sendJson(response, 400, { error: "invalid_organization_id" });
      return;
    }

    let identity;
    try {
      identity = await verifyAccessToken(token, dependencies.jwks, dependencies.issuer);
    } catch {
      sendJson(response, 401, { error: "invalid_token" });
      return;
    }

    try {
      const context = await withTenantScope(dependencies.pool, identity.userId, organizationId, (tenantPool) => loadTenantContext(tenantPool, identity.userId, organizationId));
      if (!context) {
        sendJson(response, 403, { error: "active_membership_required" });
        return;
      }
      sendJson(response, 200, {
        userId: identity.userId,
        organizationId: context.organizationId,
        membershipId: context.membershipId,
        roles: context.roles,
        permissions: context.permissions,
      });
    } catch {
      sendJson(response, 500, { error: "tenant_context_unavailable" });
    }
    return;
  }

  if (pathname.startsWith("/v1/academic/")) {
    if (!dependencies.jwks || !dependencies.issuer || !dependencies.pool) {
      sendJson(response, 503, { error: "identity_or_database_not_configured" });
      return;
    }
    const token = readBearerToken(request.headers.authorization);
    if (!token) { sendJson(response, 401, { error: "unauthorized" }); return; }
    const organizationId = request.headers["x-organization-id"];
    if (typeof organizationId !== "string" || !UUID_PATTERN.test(organizationId)) {
      sendJson(response, 400, { error: "invalid_organization_id" }); return;
    }
    let identity;
    try {
      identity = await verifyAccessToken(token, dependencies.jwks, dependencies.issuer);
    } catch {
      sendJson(response, 401, { error: "invalid_token" }); return;
    }
    try {
      if (await withTenantScope(dependencies.pool, identity.userId, organizationId, (tenantPool) => handleAcademicRequest(request, response, tenantPool, identity.userId, organizationId))) return;
    } catch {
      sendJson(response, 500, { error: "academic_service_unavailable" }); return;
    }
  }

  if (pathname.startsWith("/v1/sync/")) {
    if (!dependencies.jwks || !dependencies.issuer || !dependencies.pool) {
      sendJson(response, 503, { error: "identity_or_database_not_configured" });
      return;
    }
    const token = readBearerToken(request.headers.authorization);
    if (!token) { sendJson(response, 401, { error: "unauthorized" }); return; }
    const organizationId = request.headers["x-organization-id"];
    if (typeof organizationId !== "string" || !UUID_PATTERN.test(organizationId)) {
      sendJson(response, 400, { error: "invalid_organization_id" }); return;
    }
    let identity;
    try {
      identity = await verifyAccessToken(token, dependencies.jwks, dependencies.issuer);
    } catch {
      sendJson(response, 401, { error: "invalid_token" }); return;
    }
    try {
      if (await withTenantScope(dependencies.pool, identity.userId, organizationId, (tenantPool) => handleSyncRequest(request, response, tenantPool, identity.userId, organizationId))) return;
    } catch {
      sendJson(response, 500, { error: "sync_service_unavailable" }); return;
    }
  }

  if (pathname.startsWith("/v1/finance/") || pathname.startsWith("/v1/inventory/")) {
    if (!dependencies.jwks || !dependencies.issuer || !dependencies.pool) {
      sendJson(response, 503, { error: "identity_or_database_not_configured" });
      return;
    }
    const token = readBearerToken(request.headers.authorization);
    if (!token) { sendJson(response, 401, { error: "unauthorized" }); return; }
    const organizationId = request.headers["x-organization-id"];
    if (typeof organizationId !== "string" || !UUID_PATTERN.test(organizationId)) {
      sendJson(response, 400, { error: "invalid_organization_id" }); return;
    }
    let identity;
    try {
      identity = await verifyAccessToken(token, dependencies.jwks, dependencies.issuer);
    } catch {
      sendJson(response, 401, { error: "invalid_token" }); return;
    }
    try {
      if (pathname.startsWith("/v1/finance/") &&
          await withTenantScope(dependencies.pool, identity.userId, organizationId, (tenantPool) => handleFinanceRequest(request, response, tenantPool, identity.userId, organizationId))) return;
      if (pathname.startsWith("/v1/inventory/") &&
          await withTenantScope(dependencies.pool, identity.userId, organizationId, (tenantPool) => handleInventoryRequest(request, response, tenantPool, identity.userId, organizationId))) return;
    } catch {
      sendJson(response, 500, { error: "operational_service_unavailable" }); return;
    }
  }

  if (pathname.startsWith("/v1/hr/")) {
    if (!dependencies.jwks || !dependencies.issuer || !dependencies.pool) {
      sendJson(response, 503, { error: "identity_or_database_not_configured" });
      return;
    }
    const token = readBearerToken(request.headers.authorization);
    if (!token) { sendJson(response, 401, { error: "unauthorized" }); return; }
    const organizationId = request.headers["x-organization-id"];
    if (typeof organizationId !== "string" || !UUID_PATTERN.test(organizationId)) {
      sendJson(response, 400, { error: "invalid_organization_id" }); return;
    }
    let identity;
    try {
      identity = await verifyAccessToken(token, dependencies.jwks, dependencies.issuer);
    } catch {
      sendJson(response, 401, { error: "invalid_token" }); return;
    }
    try {
      if (await withTenantScope(dependencies.pool, identity.userId, organizationId, (tenantPool) => handleHrRequest(request, response, tenantPool, identity.userId, organizationId))) return;
    } catch {
      sendJson(response, 500, { error: "hr_service_unavailable" }); return;
    }
  }

  if (pathname === "/v1/bootstrap/organization") {
    if (!dependencies.jwks || !dependencies.issuer || !dependencies.pool) {
      sendJson(response, 503, { error: "identity_or_database_not_configured" });
      return;
    }
    const token = readBearerToken(request.headers.authorization);
    if (!token) { sendJson(response, 401, { error: "unauthorized" }); return; }
    let identity;
    try {
      identity = await verifyAccessToken(token, dependencies.jwks, dependencies.issuer);
    } catch {
      sendJson(response, 401, { error: "invalid_token" }); return;
    }
    if (!dependencies.pool.connect) {
      sendJson(response, 503, { error: "bootstrap_transaction_unavailable" });
      return;
    }
    try {
      if (await handleFirstOrganizationBootstrap(
        request, response, dependencies.pool, identity.userId, process.env.PONDOK_BOOTSTRAP_TOKEN_SHA256,
      )) return;
    } catch {
      sendJson(response, 500, { error: "organization_bootstrap_unavailable" }); return;
    }
  }

  sendJson(response, 404, { error: "not_found" });
}

export function createApiServer(dependencies: ApiDependencies = {}) {
  return createServer((request, response) => {
    void handleRequest(request, response, dependencies);
  });
}

function start(): void {
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
  const databaseUrl = process.env.DATABASE_URL;
  const dependencies: ApiDependencies = {};

  if (authBaseUrl && jwksUrl) {
    dependencies.issuer = authBaseUrl;
    dependencies.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  let pool: Pool | undefined;
  if (databaseUrl) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    dependencies.pool = pool;
  }

  const server = createApiServer(dependencies);
  server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`PONDOK OS API listening on port ${port}\n`);
  });

  const shutdown = (signal: string) => {
    process.stdout.write(`Received ${signal}; closing HTTP server\n`);
    server.close((error) => {
      if (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
      }
      if (pool) void pool.end();
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  start();
}
