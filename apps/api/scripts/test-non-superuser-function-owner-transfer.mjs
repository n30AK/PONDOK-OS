import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for function-owner transfer tests.");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  await client.query(
    "CREATE ROLE pondok_migration_transfer_test NOLOGIN CREATEROLE NOBYPASSRLS NOINHERIT",
  );
  await client.query(
    "CREATE ROLE pondok_transfer_owner_test NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT ADMIN pondok_migration_transfer_test",
  );
  await client.query("GRANT CREATE ON SCHEMA core TO pondok_transfer_owner_test");
  await client.query("GRANT CREATE ON SCHEMA core TO pondok_migration_transfer_test");
  await client.query(
    "CREATE FUNCTION core.migration_owner_transfer_test() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$",
  );
  await client.query(
    "ALTER FUNCTION core.migration_owner_transfer_test() OWNER TO pondok_migration_transfer_test",
  );
  await client.query("SET LOCAL ROLE pondok_migration_transfer_test");

  await client.query(`
    DO $ownership$
    DECLARE
      migration_role text := current_user;
      migration_is_superuser boolean;
      added_membership boolean := false;
    BEGIN
      SELECT rolsuper INTO migration_is_superuser
      FROM pg_roles WHERE rolname = migration_role;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_auth_members m
        JOIN pg_roles granted_role ON granted_role.oid = m.roleid
        JOIN pg_roles member_role ON member_role.oid = m.member
        WHERE granted_role.rolname = 'pondok_transfer_owner_test'
          AND member_role.rolname = migration_role
          AND m.admin_option
      ) THEN
        RAISE EXCEPTION 'Migration role must have ADMIN membership in the helper owner role';
      END IF;

      EXECUTE 'ALTER FUNCTION core.migration_owner_transfer_test() OWNER TO pondok_transfer_owner_test';
      EXECUTE format('REVOKE pondok_transfer_owner_test FROM %I', migration_role);
    END
    $ownership$;
  `);

  await client.query("RESET ROLE");
  const owner = await client.query(`
    SELECT r.rolname
    FROM pg_proc p
    JOIN pg_roles r ON r.oid = p.proowner
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'core' AND p.proname = 'migration_owner_transfer_test'
  `);
  assert.equal(owner.rows[0]?.rolname, "pondok_transfer_owner_test", "non-superuser migrator must transfer function ownership");
  const retainedMembership = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_auth_members m
      JOIN pg_roles granted_role ON granted_role.oid = m.roleid
      JOIN pg_roles member_role ON member_role.oid = m.member
      WHERE granted_role.rolname = 'pondok_transfer_owner_test'
        AND member_role.rolname = 'pondok_migration_transfer_test'
    ) AS retained
  `);
  assert.equal(retainedMembership.rows[0].retained, false, "temporary helper-role membership must be revoked");
  await client.query("ROLLBACK");
  process.stdout.write("Non-superuser migration role safely transferred the RLS predicate owner without retaining helper-role membership.\n");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
