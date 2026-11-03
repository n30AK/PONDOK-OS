import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createNeonClient } from "@neon/sdk";
import { Pool } from "pg";

const apiKey = process.env.NEON_API_KEY;
if (!apiKey) throw new Error("NEON_API_KEY is required. Use a project-scoped key.");

const projectId = "frosty-cherry-92983148";
const branchId = "br-proud-paper-b312lfxi";
const functionSlug = "pondokapi";
const apiBase = "https://console.neon.tech/api/v2";

async function getConnectionUri(roleName) {
  const url = new URL(`${apiBase}/projects/${projectId}/connection_uri`);
  url.searchParams.set("branch_id", branchId);
  url.searchParams.set("database_name", "neondb");
  url.searchParams.set("role_name", roleName);
  url.searchParams.set("pooled", "true");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Neon connection URI request failed with HTTP ${response.status}`);
  const payload = await response.json();
  if (typeof payload.uri !== "string" || !payload.uri.startsWith("postgres")) {
    throw new Error("Neon did not return a valid connection URI.");
  }
  return payload.uri;
}

const adminUri = await getConnectionUri("neondb_owner");
const adminPool = new Pool({ connectionString: adminUri, max: 1, connectionTimeoutMillis: 10_000 });
let appUri;

try {
  const client = await adminPool.connect();
  try {
    const roleState = await client.query("SELECT rolcanlogin FROM pg_roles WHERE rolname = 'pondok_app'");
    if (roleState.rowCount === 0 || !roleState.rows[0].rolcanlogin) {
      const password = randomBytes(48).toString("base64url");
      const statement = roleState.rowCount === 0
        ? "CREATE ROLE pondok_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L"
        : "ALTER ROLE pondok_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD %L";
      const command = await client.query("SELECT format($1, $2) AS sql", [statement, password]);
      await client.query(command.rows[0].sql);
    } else {
      await client.query(
        "ALTER ROLE pondok_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT",
      );
    }
  } finally {
    client.release();
  }

  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  console.log("Applying pending development migrations with the managed admin connection.");
  const migration = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["db:migrate"],
    {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: adminUri },
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  if (migration.error) throw migration.error;
  if (migration.status !== 0) throw new Error(`Migration runner exited with status ${migration.status}`);

  appUri = await getConnectionUri("pondok_app");
  const appPool = new Pool({ connectionString: appUri, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    const role = await appPool.query(
      "SELECT current_user, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolinherit FROM pg_roles WHERE rolname = current_user",
    );
    const attributes = role.rows[0];
    if (!attributes || attributes.rolsuper || attributes.rolbypassrls || attributes.rolcreatedb || attributes.rolcreaterole || attributes.rolinherit) {
      throw new Error("The application connection is not a restricted NOBYPASSRLS role.");
    }
    const protectedTables = await appPool.query(`
      SELECT count(*)::int AS count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('academic','admissions','assets','audit','boarding','cms','config','core','crm','finance','hr','inventory','library','procurement','sync')
        AND c.relkind = 'r'
        AND c.relrowsecurity
        AND c.relforcerowsecurity
        AND EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid AND a.attname = 'organization_id'
            AND a.attnum > 0 AND NOT a.attisdropped
        )
    `);
    if (protectedTables.rows[0]?.count !== 60) {
      throw new Error(`Expected 60 FORCE RLS tables; found ${protectedTables.rows[0]?.count ?? "unknown"}.`);
    }
  } finally {
    await appPool.end();
  }

  const neon = createNeonClient({ apiKey, throwOnError: true, requestTimeoutMs: 60_000 });
  await neon.functions.deploy({
    projectId,
    branchId,
    slug: functionSlug,
    environment: JSON.stringify({
      PONDOK_DATABASE_URL: appUri,
      CORS_ALLOWED_ORIGINS: "https://n30ak.github.io",
    }),
  });

  const deadline = Date.now() + 5 * 60_000;
  let deployedFunction;
  while (Date.now() < deadline) {
    deployedFunction = await neon.functions.get({ projectId, branchId, slug: functionSlug });
    const status = deployedFunction.current_deployment?.status;
    if (status === "completed") break;
    if (status === "failed" || status === "error") {
      throw new Error(`Neon Function environment deployment ended with status: ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  if (deployedFunction?.current_deployment?.status !== "completed" || !deployedFunction.invocation_url) {
    throw new Error("Neon Function did not finish applying the restricted database environment.");
  }

  const healthUrl = `${deployedFunction.invocation_url.replace(/\/$/, "")}/health/ready`;
  const health = await fetch(healthUrl, { signal: AbortSignal.timeout(15_000) });
  if (!health.ok) throw new Error(`API readiness check failed with HTTP ${health.status}`);

  console.log("Development activation complete.");
  console.log(`NEON_FUNCTION_URL=${deployedFunction.invocation_url}`);
  console.log("Verified: pondok_app is NOBYPASSRLS/NOINHERIT; 60 organization-owned tables have ENABLE + FORCE RLS.");
  console.log("Database URLs and generated role password were not printed.");
} finally {
  await adminPool.end();
}
