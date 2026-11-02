import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { applyMigrationFiles, type MigrationFile } from "./migrations.js";

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const directory = resolve(
    process.env.PONDOK_MIGRATIONS_DIR ?? "../../database/migrations",
  );
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const migrations: MigrationFile[] = await Promise.all(
    names.map(async (name) => {
      const match = /^(\d{4})_(.+)\.sql$/.exec(name);
      if (!match || !match[1] || !match[2]) {
        throw new Error(`Invalid migration filename: ${name}`);
      }
      return {
        version: match[1],
        name: match[2],
        sql: await readFile(resolve(directory, name), "utf8"),
      };
    }),
  );

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    application_name: "pondok-os-migration-runner",
  });

  try {
    const result = await applyMigrationFiles(pool, migrations);
    process.stdout.write(
      `Migrations complete. Applied: ${result.applied.join(", ") || "none"}; skipped: ${result.skipped.join(", ") || "none"}\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Migration failed"}\n`);
  process.exitCode = 1;
});
