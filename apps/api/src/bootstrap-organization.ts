import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing required argument --${name}`);
  return value;
}

async function main(): Promise<void> {
  if (process.env.PONDOK_BOOTSTRAP_CONFIRM !== "CREATE_ORGANIZATION") {
    throw new Error("Set PONDOK_BOOTSTRAP_CONFIRM=CREATE_ORGANIZATION to confirm this one-time operation.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  const userId = argument("user-id");
  const slug = argument("slug");
  const organizationName = argument("name");
  const campusCode = argument("campus-code");
  const campusName = argument("campus-name");
  if (!UUID.test(userId)) throw new Error("--user-id must be a UUID from the target branch Neon Auth user.");
  if (!SLUG.test(slug) || slug.length > 80) throw new Error("--slug must be lowercase alphanumeric words separated by hyphens.");
  if (organizationName.trim().length < 3 || organizationName.length > 180) throw new Error("--name must be 3–180 characters.");
  if (!/^[A-Z0-9_-]{2,24}$/.test(campusCode)) throw new Error("--campus-code must be 2–24 uppercase letters, numbers, underscores or hyphens.");
  if (campusName.trim().length < 2 || campusName.length > 120) throw new Error("--campus-name must be 2–120 characters.");

  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const authUser = await client.query<{ id: string }>(
      'SELECT id FROM neon_auth."user" WHERE id = $1::uuid LIMIT 1',
      [userId],
    );
    if (authUser.rowCount !== 1) throw new Error("The supplied user ID does not exist in neon_auth on this database branch.");

    const existing = await client.query<{ exists: boolean }>(
      "SELECT core.first_organization_exists() AS exists",
    );
    if (existing.rows[0]?.exists) throw new Error("The first organization has already been initialized.");

    const organizationId = randomUUID();
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.organization_id', $2, true)",
      [userId, organizationId],
    );
    await client.query(
      `INSERT INTO core.organizations (id, slug, name, organization_type, status)
       VALUES ($1::uuid, $2, $3, 'pesantren', 'active')`,
      [organizationId, slug, organizationName.trim()],
    );
    const membership = await client.query<{ id: string }>(
      `INSERT INTO core.organization_memberships (organization_id, user_id, membership_status)
       VALUES ($1::uuid, $2::uuid, 'active')
       RETURNING id`,
      [organizationId, userId],
    );
    const campus = await client.query<{ id: string }>(
      `INSERT INTO core.campuses (organization_id, code, name, campus_type, status)
       VALUES ($1::uuid, $2, $3, 'main', 'active')
       RETURNING id`,
      [organizationId, campusCode, campusName.trim()],
    );
    const membershipId = membership.rows[0]?.id;
    if (!membershipId || !campus.rows[0]?.id) throw new Error("Membership or main campus creation returned no ID.");
    await client.query(
      "SELECT core.bootstrap_initial_owner_role($1::uuid)",
      [membershipId],
    );
    await client.query(
      `INSERT INTO audit.audit_events (organization_id, actor_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1::uuid, $2::uuid, 'organization.bootstrap', 'organization', $3,
         jsonb_build_object('campus_id', $4::text, 'membership_id', $5::text, 'role_key', 'institution_owner'))`,
      [organizationId, userId, organizationId, campus.rows[0]?.id, membership.rows[0]?.id],
    );
    await client.query("COMMIT");
    process.stdout.write(JSON.stringify({
      status: "created",
      organizationId,
      campusId: campus.rows[0]?.id,
      ownerUserId: userId,
      note: "Store these identifiers securely. The owner role was assigned to the supplied existing Neon Auth user."
    }, null, 2) + "\n");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Bootstrap failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
