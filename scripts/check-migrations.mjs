import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const directory = join(process.cwd(), "database", "migrations");
const files = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
if (files.length === 0) {
  throw new Error("No SQL migrations found.");
}
const seen = new Set();
for (const file of files) {
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) {
    throw new Error(`Invalid migration filename: ${file}`);
  }
  const prefix = file.slice(0, 4);
  if (seen.has(prefix)) throw new Error(`Duplicate migration version: ${prefix}`);
  seen.add(prefix);
  const sql = readFileSync(join(directory, file), "utf8");
  if (!/\bBEGIN\s*;/i.test(sql) || !/\bCOMMIT\s*;/i.test(sql)) {
    throw new Error(`Migration must be transaction-wrapped: ${file}`);
  }
  if (/\b(DROP\s+SCHEMA|DROP\s+DATABASE|TRUNCATE)\b/i.test(sql)) {
    throw new Error(`Destructive SQL requires manual review: ${file}`);
  }
}
console.log(`Validated ${files.length} migration file(s): ${files.join(", ")}`);
