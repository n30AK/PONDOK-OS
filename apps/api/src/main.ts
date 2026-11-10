import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";
import { Pool } from "pg";
import { readBearerToken, verifyAccessToken } from "./identity.js";
import { loadTenantContext } from "./tenant-access.js";
import { handleAcademicRequest } from "./academic.js";
import { handleAdmissionsRequest } from "./admissions.js";
import { handleSyncRequest } from "./sync.js";
import { handleFinanceRequest } from "./finance.js";
import { handleInventoryRequest } from "./inventory.js";
import { handleHrRequest } from "./hr.js";
import { handleModuleRecordsRequest } from "./module-records.js";
import { handlePlatformRequest, listUserOrganizations } from "./platform-admin.js";
import { handlePlatformErpRequest } from "./platform-erp.js";
import { handlePlatformOperationsRequest } from "./platform-operations.js";
import { handlePlatformCommercialRequest } from "./platform-commercial.js";
import { handlePlatformBillingRequest } from "./platform-billing.js";
import { handlePlatformCustomerCatalogRequest } from "./platform-customer-catalog.js";
import { TenantLicenseExpiredError, withTenantScope, type TenantDatabase } from "./tenant-db.js";

export const SERVICE_NAME = "pondok-os-api";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ApiDependencies {
  jwks?: JWTVerifyGetKey;
  issuer?: string;
  pool?: TenantDatabase;
}

async function verifyDatabaseSecurity(pool: TenantDatabase): Promise<boolean> {
  if (!pool.connect) return false;
  const client = await pool.connect();
  let transaction = false;
  try {
    await client.query("BEGIN");
    transaction = true;
    await client.query("SET LOCAL ROLE pondok_runtime");
    const tenant = await client.query<{
      runtime_role: string;
      role_can_login: boolean;
      role_bypasses_rls: boolean;
      memberships_rls: boolean;
      tenant_table_count: number;
      protected_table_count: number;
    }>(
      `SELECT current_user::text AS runtime_role,
              r.rolcanlogin AS role_can_login,
              (r.rolsuper OR r.rolbypassrls) AS role_bypasses_rls,
              (SELECT c.relrowsecurity AND c.relforcerowsecurity
                 FROM pg_class c WHERE c.oid='core.organization_memberships'::regclass) AS memberships_rls,
              (SELECT count(*)::int
                 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname IN ('academic','admissions','assets','audit','boarding','cms','config','core','crm','finance','hr','inventory','library','procurement','sync')
                  AND c.relkind='r'
                  AND NOT (n.nspname='core' AND c.relname='organization_memberships')
                  AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0 AND NOT a.attisdropped)) AS tenant_table_count,
              (SELECT count(*)::int
                 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname IN ('academic','admissions','assets','audit','boarding','cms','config','core','crm','finance','hr','inventory','library','procurement','sync')
                  AND c.relkind='r'
                  AND NOT (n.nspname='core' AND c.relname='organization_memberships')
                  AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0 AND NOT a.attisdropped)
                  AND c.relrowsecurity AND c.relforcerowsecurity
                  AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='tenant_isolation')) AS protected_table_count
         FROM pg_roles r WHERE r.rolname=current_user`,
    );
    await client.query("ROLLBACK");
    transaction = false;

    await client.query("BEGIN");
    transaction = true;
    await client.query("SET LOCAL ROLE pondok_platform_runtime");
    const platform = await client.query<{
      runtime_role: string;
      role_can_login: boolean;
      role_bypasses_rls: boolean;
      platform_table_count: number;
      protected_platform_table_count: number;
    }>(
      `SELECT current_user::text AS runtime_role,
              r.rolcanlogin AS role_can_login,
              (r.rolsuper OR r.rolbypassrls) AS role_bypasses_rls,
              (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='platform' AND c.relkind='r' AND c.relname <> 'super_admins') AS platform_table_count,
              (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='platform' AND c.relkind='r' AND c.relname <> 'super_admins'
                  AND c.relrowsecurity AND c.relforcerowsecurity
                  AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid)) AS protected_platform_table_count
         FROM pg_roles r WHERE r.rolname=current_user`,
    );
    await client.query("ROLLBACK");
    transaction = false;

    const tenantState = tenant.rows[0];
    const platformState = platform.rows[0];
    return Boolean(
      tenantState
      && tenantState.runtime_role === "pondok_runtime"
      && tenantState.role_can_login === false
      && tenantState.role_bypasses_rls === false
      && tenantState.memberships_rls === true
      && Number(tenantState.tenant_table_count) > 0
      && Number(tenantState.protected_table_count) === Number(tenantState.tenant_table_count)
      && platformState
      && platformState.runtime_role === "pondok_platform_runtime"
      && platformState.role_can_login === false
      && platformState.role_bypasses_rls === false
      && Number(platformState.platform_table_count) > 0
      && Number(platformState.protected_platform_table_count) === Number(platformState.platform_table_count)
    );
  } catch {
    if (transaction) await client.query("ROLLBACK").catch(() => undefined);
    return false;
  } finally {
    client.release();
  }
}

function sendTenantScopeError(response: ServerResponse, reason: unknown, fallback: string): void {
  if (reason instanceof TenantLicenseExpiredError) {
    sendJson(response, 402, { error: "tenant_trial_expired", message: "Masa trial PONDOK OS telah berakhir. Data tetap tersimpan dan akses dapat dipulihkan setelah aktivasi lisensi." });
    return;
  }
  sendJson(response, 500, { error: fallback });
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
    response.setHeader("access-control-allow-headers", "Authorization, Content-Type, X-Organization-Id");
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

  if (pathname === "/v1/bootstrap/organization") {
    sendJson(response, 410, { error: "legacy_bootstrap_disabled_use_central_activation" });
    return;
  }

  const writeRoute = pathname.startsWith("/v1/academic/") || pathname.startsWith("/v1/admissions/") || pathname.startsWith("/v1/sync/") || pathname.startsWith("/v1/finance/") || pathname.startsWith("/v1/inventory/") || pathname.startsWith("/v1/hr/") || pathname.startsWith("/v1/modules/") || pathname.startsWith("/v1/platform/");
  const allowedMethods = pathname.startsWith("/v1/academic/") || pathname.startsWith("/v1/modules/") || pathname.startsWith("/v1/platform/erp/")
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
      const securityReady = await verifyDatabaseSecurity(dependencies.pool);
      if (!securityReady) {
        sendJson(response, 503, { status: "not_ready", dependency: "database_security_controls_unavailable" });
        return;
      }
      sendJson(response, 200, {
        status: "ready",
        service: SERVICE_NAME,
        dependencies: { database: "ok", tenantSecurity: "ok", platformSecurity: "ok" },
      });
    } catch {
      sendJson(response, 503, { status: "not_ready", dependency: "database_unavailable" });
    }
    return;
  }

  if (pathname.startsWith("/v1/platform/")) {
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
      sendJson(response, 401, { error: "invalid_token" });
      return;
    }
    try {
      if (await handlePlatformBillingRequest(request, response, dependencies.pool, identity.userId)) return;
      if (await handlePlatformCommercialRequest(request, response, dependencies.pool, identity.userId)) return;
      if (await handlePlatformCustomerCatalogRequest(request, response, dependencies.pool, identity.userId)) return;
      if (await handlePlatformOperationsRequest(request, response, dependencies.pool, identity.userId)) return;
      if (await handlePlatformErpRequest(request, response, dependencies.pool, identity.userId)) return;
      if (await handlePlatformRequest(request, response, dependencies.pool, identity.userId)) return;
    } catch {
      sendJson(response, 500, { error: "platform_service_unavailable" });
      return;
    }
  }

  if (pathname === "/v1/tenant/organizations") {
    if (method !== "GET") {
      response.setHeader("allow", "GET, HEAD");
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }
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
      sendJson(response, 401, { error: "invalid_token" });
      return;
    }
    try {
      const organizations = await listUserOrganizations(dependencies.pool, identity.userId);
      sendJson(response, 200, { data: organizations });
    } catch {
      sendJson(response, 500, { error: "organization_list_unavailable" });
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
      const scoped = await withTenantScope(dependencies.pool, identity.userId, organizationId, async (tenantPool) => {
        const context = await loadTenantContext(tenantPool, identity.userId, organizationId);
        if (!context) return null;
        // Prove that this request is executing under the restricted tenant role,
        // with the expected transaction-local tenant and a complete RLS policy set.
        const security = await tenantPool.query<{
          runtime_role: string;
          scoped_organization_id: string | null;
          active_membership: boolean;
          membership_rls: boolean;
          protected_table_count: number;
          tenant_table_count: number;
        }>(
          `SELECT current_user::text AS runtime_role,
                  current_setting('app.organization_id', true) AS scoped_organization_id,
                  core.has_active_tenant_membership($1::uuid) AS active_membership,
                  (SELECT c.relrowsecurity AND c.relforcerowsecurity
                     FROM pg_class c WHERE c.oid='core.organization_memberships'::regclass) AS membership_rls,
                  (SELECT count(*)::int
                     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname IN ('academic','admissions','assets','audit','boarding','cms','config','core','crm','finance','hr','inventory','library','procurement','sync')
                      AND c.relkind='r'
                      AND NOT (n.nspname='core' AND c.relname='organization_memberships')
                      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0 AND NOT a.attisdropped)
                      AND c.relrowsecurity AND c.relforcerowsecurity
                      AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='tenant_isolation')) AS protected_table_count,
                  (SELECT count(*)::int
                     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE n.nspname IN ('academic','admissions','assets','audit','boarding','cms','config','core','crm','finance','hr','inventory','library','procurement','sync')
                      AND c.relkind='r'
                      AND NOT (n.nspname='core' AND c.relname='organization_memberships')
                      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='organization_id' AND a.attnum>0 AND NOT a.attisdropped)) AS tenant_table_count`,
          [organizationId],
        );
        const license = await tenantPool.query<{ license: { status: string; planCode: string; startsAt: string; endsAt: string | null } | null }>(
          "SELECT platform.tenant_license_summary($1::uuid) AS license", [organizationId],
        );
        return { context, security: security.rows[0], license: license.rows[0]?.license ?? null };
      });
      if (!scoped) {
        sendJson(response, 403, { error: "active_membership_required" });
        return;
      }
      const security = scoped.security;
      if (!security || security.runtime_role !== "pondok_runtime"
        || security.scoped_organization_id !== organizationId
        || security.active_membership !== true
        || security.membership_rls !== true
        || Number(security.tenant_table_count) < 1
        || Number(security.protected_table_count) !== Number(security.tenant_table_count)) {
        sendJson(response, 503, { error: "tenant_security_context_unavailable" });
        return;
      }
      const context = scoped.context;
      sendJson(response, 200, {
        userId: identity.userId,
        organizationId: context.organizationId,
        membershipId: context.membershipId,
        roles: context.roles,
        permissions: context.permissions,
        security: {
          status: "protected",
          runtimeRole: security.runtime_role,
          protectedTables: Number(security.protected_table_count),
          tenantTables: Number(security.tenant_table_count),
        },
        license: scoped.license,
      });
    } catch (reason) {
      sendTenantScopeError(response, reason, "tenant_context_unavailable");
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
    } catch (reason) {
      sendTenantScopeError(response, reason, "academic_service_unavailable"); return;
    }
  }

  if (pathname.startsWith("/v1/admissions/")) {
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
      if (await withTenantScope(dependencies.pool, identity.userId, organizationId, (tenantPool) => handleAdmissionsRequest(request, response, tenantPool, identity.userId, organizationId))) return;
    } catch (reason) {
      sendTenantScopeError(response, reason, "admissions_service_unavailable"); return;
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
    } catch (reason) {
      sendTenantScopeError(response, reason, "sync_service_unavailable"); return;
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
    } catch (reason) {
      sendTenantScopeError(response, reason, "operational_service_unavailable"); return;
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
    } catch (reason) {
      sendTenantScopeError(response, reason, "hr_service_unavailable"); return;
    }
  }

  if (pathname.startsWith("/v1/modules/")) {
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
      if (await withTenantScope(dependencies.pool, identity.userId, organizationId, (tenantPool) =>
        handleModuleRecordsRequest(request, response, tenantPool, identity.userId, organizationId))) return;
    } catch (reason) {
      sendTenantScopeError(response, reason, "module_service_unavailable"); return;
    }
  }


  sendJson(response, 404, { error: "not_found" });
}

export function createApiServer(dependencies: ApiDependencies = {}) {
  return createServer((request, response) => {
    void handleRequest(request, response, dependencies);
  });
}

export function secureDatabaseConnectionString(value: string): string {
  const url = new URL(value);
  // Neon currently treats these modes as verify-full, but pg v9 will adopt
  // weaker libpq semantics. Pin certificate and hostname verification now.
  if (url.hostname.toLowerCase().endsWith(".neon.tech")) {
    const mode = url.searchParams.get("sslmode")?.toLowerCase();
    if (!mode || ["prefer", "require", "verify-ca"].includes(mode)) {
      url.searchParams.set("sslmode", "verify-full");
    }
  }
  return url.toString();
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
      connectionString: secureDatabaseConnectionString(databaseUrl),
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
