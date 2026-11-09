import assert from "node:assert/strict";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for contract subscription tests");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
const admin = "11111111-1111-4111-8111-111111111111";

try {
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO platform.super_admins (user_id,email,display_name,status) VALUES ($1,'subscription-ci@example.invalid','Subscription CI Admin','active') ON CONFLICT (user_id) DO UPDATE SET status='active'",
    [admin],
  );
  await client.query("SET LOCAL ROLE pondok_platform_runtime");
  await client.query("SELECT set_config('app.user_id',$1,true)", [admin]);

  const customer = await client.query(
    "INSERT INTO platform.customers (customer_code,legal_name,display_name,status) VALUES ('CI-SUB-CUSTOMER-1','Yayasan Subscription CI','Pondok Subscription CI','prospect') RETURNING id",
  );
  const product = await client.query(
    "INSERT INTO platform.product_catalog (product_code,product_name,product_type,base_price,currency,billing_interval,is_active) VALUES ('CI-SUB-PRODUCT-1','Paket Langganan CI','subscription',100000,'IDR','monthly',true) RETURNING id",
  );
  const quote = await client.query(
    "INSERT INTO platform.quotes (quote_number,customer_id,status,currency,subtotal,discount_total,tax_total,grand_total,created_by) VALUES ('CI-SUB-QUOTE-1',$1,'approved','IDR',200000,5000,0,195000,$2) RETURNING id",
    [customer.rows[0].id, admin],
  );
  const line = await client.query(
    "INSERT INTO platform.quote_lines (quote_id,product_id,description,quantity,unit_price,discount_amount,tax_amount,line_total) VALUES ($1,$2,'Paket bulanan',2,100000,5000,0,195000) RETURNING id",
    [quote.rows[0].id, product.rows[0].id],
  );
  const contract = await client.query(
    "INSERT INTO platform.contracts (contract_number,customer_id,quote_id,status,starts_on,ends_on,created_by) VALUES ('CI-SUB-CONTRACT-1',$1,$2,'active','2027-01-01','2027-12-31',$3) RETURNING id",
    [customer.rows[0].id, quote.rows[0].id, admin],
  );

  const uniqueIndex = await client.query(
    "SELECT indexdef FROM pg_indexes WHERE schemaname='platform' AND indexname='platform_subscriptions_one_per_quote_line'",
  );
  assert.equal(uniqueIndex.rowCount, 1, "one subscription per approved quote line must be enforced");
  const columns = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='platform' AND table_name='subscriptions' AND column_name IN ('quote_line_id','billing_interval','discount_amount','tax_amount','line_total')",
  );
  assert.equal(columns.rowCount, 5, "subscription must retain quote-line and recurring price snapshots");

  const subscription = await client.query(
    `INSERT INTO platform.subscriptions
      (customer_id,contract_id,product_id,quote_line_id,status,starts_at,ends_at,next_billing_at,quantity,unit_price,
       discount_amount,tax_amount,line_total,currency,billing_interval,created_by)
     VALUES ($1,$2,$3,$4,'scheduled','2027-01-01T00:00:00Z','2027-12-31T23:59:59Z','2027-01-01T00:00:00Z',2,100000,5000,0,195000,'IDR','monthly',$5)
     RETURNING id,status,quote_line_id,billing_interval,discount_amount,tax_amount,line_total`,
    [customer.rows[0].id, contract.rows[0].id, product.rows[0].id, line.rows[0].id, admin],
  );
  assert.equal(subscription.rows[0].status, "scheduled");
  assert.equal(subscription.rows[0].quote_line_id, line.rows[0].id);
  assert.equal(subscription.rows[0].billing_interval, "monthly");
  assert.equal(Number(subscription.rows[0].discount_amount), 5000);
  assert.equal(Number(subscription.rows[0].line_total), 195000);

  await client.query("SAVEPOINT duplicate_quote_line_subscription");
  await assert.rejects(
    () => client.query(
      `INSERT INTO platform.subscriptions
        (customer_id,contract_id,product_id,quote_line_id,status,starts_at,quantity,unit_price,created_by)
       VALUES ($1,$2,$3,$4,'active',now(),2,100000,$5)`,
      [customer.rows[0].id, contract.rows[0].id, product.rows[0].id, line.rows[0].id, admin],
    ),
    (error) => error?.code === "23505",
    "a recurring quote line cannot create duplicate subscriptions",
  );
  await client.query("ROLLBACK TO SAVEPOINT duplicate_quote_line_subscription");
  await client.query("RELEASE SAVEPOINT duplicate_quote_line_subscription");

  await client.query("SAVEPOINT invalid_billing_interval");
  await assert.rejects(
    () => client.query(
      `INSERT INTO platform.subscriptions
        (customer_id,contract_id,product_id,status,starts_at,quantity,unit_price,billing_interval,created_by)
       VALUES ($1,$2,$3,'active',now(),1,100,'weekly',$4)`,
      [customer.rows[0].id, contract.rows[0].id, product.rows[0].id, admin],
    ),
    (error) => error?.code === "23514",
    "subscription billing interval must match supported catalog periods",
  );
  await client.query("ROLLBACK TO SAVEPOINT invalid_billing_interval");
  await client.query("RELEASE SAVEPOINT invalid_billing_interval");

  await client.query("ROLLBACK");
  process.stdout.write("Contract subscription integrity passed: quote-line FK, unique conversion, scheduled status, interval and immutable price snapshots.\n");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
