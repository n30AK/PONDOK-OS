import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString=process.env.DATABASE_URL;
if(!connectionString) throw new Error("DATABASE_URL is required");
const pool=new Pool({connectionString,max:1});
const client=await pool.connect();
try {
  const names=["chart_of_accounts","journal_entries","journal_lines","client_repair_events","warranty_claim_events"];
  const tables=await client.query(`
    SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='platform' AND c.relname=ANY($1::text[])
  `,[names]);
  assert.equal(tables.rowCount,5,"ledger and append-only repair/warranty timeline tables exist");
  for(const row of tables.rows){
    assert.equal(row.relrowsecurity,true,`${row.relname}: RLS enabled`);
    assert.equal(row.relforcerowsecurity,true,`${row.relname}: FORCE RLS enabled`);
  }
  const grants=await client.query(`
    SELECT
      has_table_privilege('pondok_platform_runtime','platform.journal_entries','UPDATE') AS entry_update,
      has_table_privilege('pondok_platform_runtime','platform.journal_entries','DELETE') AS entry_delete,
      has_table_privilege('pondok_platform_runtime','platform.journal_lines','UPDATE') AS line_update,
      has_table_privilege('pondok_platform_runtime','platform.journal_lines','DELETE') AS line_delete,
      has_table_privilege('pondok_platform_runtime','platform.client_repair_events','UPDATE') AS repair_event_update,
      has_table_privilege('pondok_platform_runtime','platform.client_repair_events','DELETE') AS repair_event_delete,
      has_table_privilege('pondok_platform_runtime','platform.warranty_claim_events','UPDATE') AS warranty_event_update,
      has_table_privilege('pondok_platform_runtime','platform.warranty_claim_events','DELETE') AS warranty_event_delete
  `);
  for(const key of Object.keys(grants.rows[0])) assert.equal(grants.rows[0][key],false,`${key} denied`);
  const triggers=await client.query(`
    SELECT count(*)::int AS n FROM pg_trigger
    WHERE tgname IN ('platform_journal_lines_balanced','platform_journal_header_balanced')
      AND NOT tgisinternal
  `);
  assert.equal(triggers.rows[0].n,2,"deferred journal balance triggers installed");
  const refs=await client.query(`
    SELECT table_name,column_name FROM information_schema.columns
    WHERE table_schema='platform' AND (table_name,column_name) IN
      (('invoices','journal_entry_id'),('payments','journal_entry_id'))
  `);
  assert.equal(refs.rowCount,2,"invoice and payment posting references exist");
  process.stdout.write("Central Command ledger checks passed: double-entry schema, deferred balancing triggers, RLS and immutable repair/warranty/ledger evidence.\\n");
} finally { client.release(); await pool.end(); }
