import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const LOCK_KEY = "706f6e646f6b6f73";

function checksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

function migrationBody(sql: string): string {
  // Migration files may begin with SQL comments before the transaction wrapper.
  // Remove those comments before stripping BEGIN so the runner owns the transaction.
  const withoutHeaderComments = sql
    .replace(/^\uFEFF/, "")
    .replace(/^\s*(?:(?:--[^\r\n]*(?:\r?\n|$))|(?:\/\*[\s\S]*?\*\/\s*))*\s*/i, "");
  return withoutHeaderComments
    .replace(/^BEGIN\s*;\s*/i, "")
    .replace(/\s*COMMIT\s*;\s*$/i, "");
}

export async function applyMigrationFiles(
  pool: Pick<Pool, "connect">,
  migrations: MigrationFile[],
): Promise<MigrationResult> {
  const client: PoolClient = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  let lockAcquired = false;

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [LOCK_KEY]);
    lockAcquired = true;
    await client.query("CREATE SCHEMA IF NOT EXISTS core");
    await client.query(`CREATE TABLE IF NOT EXISTS core.schema_migrations (
      version varchar(32) PRIMARY KEY,
      migration_name text NOT NULL,
      checksum_sha256 char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      applied_by text NOT NULL DEFAULT current_user
    )`);

    const seen = new Set<string>();
    for (const migration of migrations) {
      if (!/^\d{4}$/.test(migration.version)) {
        throw new Error(`Invalid migration version: ${migration.version}`);
      }
      if (seen.has(migration.version)) {
        throw new Error(`Duplicate migration version: ${migration.version}`);
      }
      seen.add(migration.version);
    }

    for (const migration of [...migrations].sort((a, b) => a.version.localeCompare(b.version))) {
      const digest = checksum(migration.sql);
      const existing = await client.query<{ checksum_sha256: string }>(
        "SELECT checksum_sha256 FROM core.schema_migrations WHERE version = $1",
        [migration.version],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum_sha256.trim() !== digest) {
          throw new Error(`Checksum mismatch for applied migration ${migration.version}; do not edit applied migrations.`);
        }
        skipped.push(migration.version);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(migrationBody(migration.sql));
        await client.query(
          `INSERT INTO core.schema_migrations (version, migration_name, checksum_sha256)
           VALUES ($1, $2, $3)`,
          [migration.version, migration.name, digest],
        );
        await client.query("COMMIT");
        applied.push(migration.version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return { applied, skipped };
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [LOCK_KEY]);
      } finally {
        client.release();
      }
    } else {
      client.release();
    }
  }
}
