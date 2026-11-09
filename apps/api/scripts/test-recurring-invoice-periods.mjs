import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for recurring invoice period tests");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const admin = "11111111-1111-4111-8111-111111111111";
const customer = "22222222-2222-4222-8222-222222222222";
const product = "33333333-3333-4333-8333-333333333333";
const contract = "44444444-4444-4444-8444-444444444444";
const subscription = "55555555-5555-4555-8555-555555555555";

try {
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO platform.super_admins (user_id,email,display_name,status) VALUES ($1,'recurring-period-ci@example.invalid','Recurring Period CI','active')",
    [admin],
  );
  await client.query(
    "INSERT INTO platform.customers (id,customer_code,legal_name,display_name,status) VALUES ($1,'CI-RECUR-1','CI Recurring Foundation','CI Recurring Foundation','active')",
    [customer],
  );
  await client.query(
    "INSERT INTO platform.product_catalog (id,product_code,product_name,product_type,base_price,currency,billing_interval,is_active) VALUES ($1,'CI-RECUR-PROD','CI Recurring Product','subscription',100,'IDR','monthly',true)",
    [product],
  );
  await client.query(
    "INSERT INTO platform.contracts (id,contract_number,customer_id,status,starts_on,created_by) VALUES ($1,'CI-RECUR-CONTRACT',$2,'active','2026-01-01',$3)",
    [contract, customer, admin],
  );
  await client.query(
    "INSERT INTO platform.subscriptions (id,customer_id,contract_id,product_id,status,starts_at,next_billing_at,quantity,unit_price,currency,created_by,billing_interval,line_total) VALUES ($1,$2,$3,$4,'active','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',1,100,'IDR',$5,'monthly',100)",
    [subscription, customer, contract, product, admin],
  );

  const periodIndex = await client.query(
    "SELECT indexdef FROM pg_indexes WHERE schemaname='platform' AND indexname='platform_invoices_one_per_subscription_period'",
  );
  const openIndex = await client.query(
    "SELECT indexdef FROM pg_indexes WHERE schemaname='platform' AND indexname='platform_invoices_one_open_per_subscription'",
  );
  assert.equal(periodIndex.rowCount, 1, "a subscription must have at most one invoice per billing period");
  assert.equal(openIndex.rowCount, 1, "a subscription must not accumulate multiple open invoices");

  await client.query("SET LOCAL ROLE pondok_platform_runtime");
  await client.query("SELECT set_config('app.user_id',$1,true)", [admin]);
  const first = await client.query(
    "INSERT INTO platform.invoices (invoice_number,customer_id,contract_id,subscription_id,status,currency,due_on,billing_period_start,billing_period_end,created_by) VALUES ('CI-INV-RECUR-1',$1,$2,$3,'draft','IDR','2026-01-15','2026-01-01','2026-01-31',$4) RETURNING id",
    [customer, contract, subscription, admin],
  );
  assert.equal(first.rowCount, 1);

  await client.query("UPDATE platform.invoices SET status='paid' WHERE id=$1", [first.rows[0].id]);
  await client.query("SAVEPOINT duplicate_period");
  await assert.rejects(
    () => client.query(
      "INSERT INTO platform.invoices (invoice_number,customer_id,contract_id,subscription_id,status,currency,due_on,billing_period_start,billing_period_end,created_by) VALUES ('CI-INV-RECUR-DUP',$1,$2,$3,'draft','IDR','2026-01-20','2026-01-01','2026-01-31',$4)",
      [customer, contract, subscription, admin],
    ),
    (error) => error?.code === "23505",
    "the same subscription billing period cannot be invoiced twice",
  );
  await client.query("ROLLBACK TO SAVEPOINT duplicate_period");
  await client.query("RELEASE SAVEPOINT duplicate_period");

  const second = await client.query(
    "INSERT INTO platform.invoices (invoice_number,customer_id,contract_id,subscription_id,status,currency,due_on,billing_period_start,billing_period_end,created_by) VALUES ('CI-INV-RECUR-2',$1,$2,$3,'draft','IDR','2026-02-15','2026-02-01','2026-02-28',$4) RETURNING id",
    [customer, contract, subscription, admin],
  );
  assert.equal(second.rowCount, 1);

  await client.query("SAVEPOINT second_open_invoice");
  await assert.rejects(
    () => client.query(
      "INSERT INTO platform.invoices (invoice_number,customer_id,contract_id,subscription_id,status,currency,due_on,billing_period_start,billing_period_end,created_by) VALUES ('CI-INV-RECUR-3',$1,$2,$3,'draft','IDR','2026-03-15','2026-03-01','2026-03-31',$4)",
      [customer, contract, subscription, admin],
    ),
    (error) => error?.code === "23505",
    "a subscription cannot have two simultaneously open invoices",
  );
  await client.query("ROLLBACK TO SAVEPOINT second_open_invoice");
  await client.query("RELEASE SAVEPOINT second_open_invoice");

  await client.query("UPDATE platform.invoices SET status='paid' WHERE id=$1", [second.rows[0].id]);

  await client.query("SAVEPOINT invalid_period_pair");
  await assert.rejects(
    () => client.query(
      "INSERT INTO platform.invoices (invoice_number,customer_id,contract_id,subscription_id,status,currency,due_on,billing_period_start,billing_period_end,created_by) VALUES ('CI-INV-RECUR-BAD',$1,$2,$3,'draft','IDR','2026-04-15','2026-04-01',NULL,$4)",
      [customer, contract, subscription, admin],
    ),
    (error) => error?.code === "23514",
    "billing period start and end must be supplied together",
  );
  await client.query("ROLLBACK TO SAVEPOINT invalid_period_pair");
  await client.query("RELEASE SAVEPOINT invalid_period_pair");

  await client.query("ROLLBACK");
  process.stdout.write("Recurring invoice invariants passed: one invoice per subscription period, one open invoice per subscription, paired period dates.\n");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
