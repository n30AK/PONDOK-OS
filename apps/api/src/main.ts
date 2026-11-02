import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { Pool } from "pg";
import { readBearerToken, verifyAccessToken } from "./identity.js";
import { loadTenantContext } from "./tenant-access.js";

export const SERVICE_NAME = "pondok-os-api";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ApiDependencies {
  jwks?: JWTVerifyGetKey;
  issuer?: string;
  pool?: Pick<Pool, "query">;
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

  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("allow", "GET, HEAD");
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  if (pathname === "/health/live") {
    sendJson(response, 200, { status: "ok", service: SERVICE_NAME });
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

    try {
      const identity = await verifyAccessToken(token, dependencies.jwks, dependencies.issuer);
      const context = await loadTenantContext(dependencies.pool, identity.userId, organizationId);
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
    process.stdout.write(`PONDOK OS API listening on port ${port}\\n`);
  });

  const shutdown = (signal: string) => {
    process.stdout.write(`Received ${signal}; closing HTTP server\\n`);
    server.close((error) => {
      if (error) {
        process.stderr.write(`${error.message}\\n`);
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
