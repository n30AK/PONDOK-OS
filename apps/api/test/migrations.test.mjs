import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { applyMigrationFiles } from "../dist/migrations.js";

function fakePool(existing = new Map()) {
  const statements = [];
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      if (sql.startsWith("SELECT checksum_sha256")) {
        const checksum = existing.get(params[0]);
        return { rows: checksum ? [{ checksum_sha256: checksum }] : [] };
      }
      if (sql.startsWith("INSERT INTO core.schema_migrations")) {
        existing.set(params[0], params[2]);
      }
      return { rows: [] };
    },
    release() { statements.push({ sql: "RELEASE" }); },
  };
  return { connect: async () => client, statements, existing };
}

const migration = {
  version: "0001",
  name: "first",
  sql: "BEGIN;\nCREATE TABLE example (id integer);\nCOMMIT;\n",
};
const digest = createHash("sha256").update(migration.sql).digest("hex");

test("applies a migration and records its checksum", async () => {
  const pool = fakePool();
  const result = await applyMigrationFiles(pool, [migration]);
  assert.deepEqual(result, { applied: ["0001"], skipped: [] });
  assert.equal(pool.existing.get("0001"), digest);
  assert.ok(pool.statements.some((item) => item.sql === "COMMIT"));
  assert.ok(pool.statements.some((item) => item.sql === "SELECT pg_advisory_unlock(hashtext($1))"));
});

test("skips a migration already applied with the same checksum", async () => {
  const pool = fakePool(new Map([["0001", digest]]));
  const result = await applyMigrationFiles(pool, [migration]);
  assert.deepEqual(result, { applied: [], skipped: ["0001"] });
});

test("rejects edits to an already-applied migration", async () => {
  const pool = fakePool(new Map([["0001", "f".repeat(64)]]));
  await assert.rejects(
    applyMigrationFiles(pool, [migration]),
    /Checksum mismatch/,
  );
});

test("rolls back a migration when its SQL fails", async () => {
  const pool = fakePool();
  const broken = { ...migration, sql: "BEGIN;\nINVALID SQL;\nCOMMIT;" };
  const originalQuery = (await pool.connect()).query;
  const client = await pool.connect();
  client.query = async (sql, params = []) => {
    if (sql === "INVALID SQL;") throw new Error("syntax error");
    return originalQuery(sql, params);
  };
  pool.connect = async () => client;
  await assert.rejects(applyMigrationFiles(pool, [broken]), /syntax error/);
  assert.ok(pool.statements.some((item) => item.sql === "ROLLBACK"));
});
