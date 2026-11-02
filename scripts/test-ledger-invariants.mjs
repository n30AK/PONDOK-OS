import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for ledger invariant tests.");

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
const organizationId = randomUUID();
const periodId = randomUUID();
const assetAccountId = randomUUID();
const revenueAccountId = randomUUID();
const balancedJournalId = randomUUID();
const unbalancedJournalId = randomUUID();
const itemId = randomUUID();
const warehouseId = randomUUID();
const employeeId = randomUUID();
const payrollPeriodId = randomUUID();
const payrollRunId = randomUUID();

async function expectSqlCode(action, expectedCode, label) {
  await client.query("SAVEPOINT invariant_check");
  try {
    await action();
    await client.query("ROLLBACK TO SAVEPOINT invariant_check");
    throw new Error(`Expected SQLSTATE ${expectedCode} for ${label}, but the operation succeeded.`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expected SQLSTATE")) throw error;
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    await client.query("ROLLBACK TO SAVEPOINT invariant_check");
    assert.equal(code, expectedCode, `${label} should fail with SQLSTATE ${expectedCode}`);
  } finally {
    await client.query("RELEASE SAVEPOINT invariant_check");
  }
}

try {
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO core.organizations (id, slug, name, organization_type, status) VALUES ($1, $2, $3, 'pesantren', 'active')",
    [organizationId, `ci-${organizationId.slice(0, 8)}`, "PONDOK CI INVARIANT TEST"],
  );

  await client.query(
    "INSERT INTO finance.fiscal_periods (id, organization_id, code, name, starts_on, ends_on) VALUES ($1,$2,'FY-CI','CI Fiscal Year','2026-01-01','2026-12-31')",
    [periodId, organizationId],
  );
  await client.query(
    "INSERT INTO finance.accounts (id, organization_id, account_code, account_name, account_type) VALUES ($1,$2,'1000','Kas','asset'),($3,$2,'4000','Pendapatan','revenue')",
    [assetAccountId, organizationId, revenueAccountId],
  );

  await client.query(
    "INSERT INTO finance.journal_entries (id, organization_id, fiscal_period_id, entry_number, entry_date, description) VALUES ($1,$2,$3,'CI-JE-001','2026-06-01','Balanced journal test')",
    [balancedJournalId, organizationId, periodId],
  );
  await client.query(
    "INSERT INTO finance.journal_lines (organization_id,journal_entry_id,line_number,account_id,debit,credit) VALUES ($1,$2,1,$3,100,0),($1,$2,2,$4,0,100)",
    [organizationId, balancedJournalId, assetAccountId, revenueAccountId],
  );
  await client.query("UPDATE finance.journal_entries SET status='posted' WHERE organization_id=$1 AND id=$2", [organizationId, balancedJournalId]);
  const posted = await client.query("SELECT status, posted_at FROM finance.journal_entries WHERE id=$1", [balancedJournalId]);
  assert.equal(posted.rows[0]?.status, "posted");
  assert.ok(posted.rows[0]?.posted_at, "posted journal must have posted_at");
  await expectSqlCode(
    () => client.query("UPDATE finance.journal_entries SET description='tampered' WHERE id=$1", [balancedJournalId]),
    "55000",
    "posted journal immutability",
  );

  await client.query(
    "INSERT INTO finance.journal_entries (id, organization_id, fiscal_period_id, entry_number, entry_date, description) VALUES ($1,$2,$3,'CI-JE-002','2026-06-02','Unbalanced journal test')",
    [unbalancedJournalId, organizationId, periodId],
  );
  await client.query(
    "INSERT INTO finance.journal_lines (organization_id,journal_entry_id,line_number,account_id,debit,credit) VALUES ($1,$2,1,$3,100,0),($1,$2,2,$4,0,50)",
    [organizationId, unbalancedJournalId, assetAccountId, revenueAccountId],
  );
  await expectSqlCode(
    () => client.query("UPDATE finance.journal_entries SET status='posted' WHERE id=$1", [unbalancedJournalId]),
    "23514",
    "unbalanced journal posting",
  );

  await client.query(
    "INSERT INTO inventory.items (id,organization_id,item_code,item_name,unit_code) VALUES ($1,$2,'CI-ITEM','Test stock item','pcs')",
    [itemId, organizationId],
  );
  await client.query(
    "INSERT INTO inventory.warehouses (id,organization_id,warehouse_code,warehouse_name) VALUES ($1,$2,'CI-WH','Test warehouse')",
    [warehouseId, organizationId],
  );
  const movement = await client.query(
    "INSERT INTO inventory.stock_movements (organization_id,item_id,warehouse_id,movement_type,quantity) VALUES ($1,$2,$3,'receipt',10) RETURNING id",
    [organizationId, itemId, warehouseId],
  );
  await expectSqlCode(
    () => client.query("UPDATE inventory.stock_movements SET quantity=999 WHERE id=$1", [movement.rows[0]?.id]),
    "55000",
    "append-only inventory movement",
  );

  await client.query(
    "INSERT INTO hr.employees (id,organization_id,employee_number,legal_name,joined_on) VALUES ($1,$2,'CI-EMP-001','Pegawai Uji','2026-01-01')",
    [employeeId, organizationId],
  );
  await client.query(
    "INSERT INTO hr.payroll_periods (id,organization_id,period_code,starts_on,ends_on,pay_date) VALUES ($1,$2,'CI-PAY-2026-06','2026-06-01','2026-06-30','2026-07-01')",
    [payrollPeriodId, organizationId],
  );
  await client.query(
    "INSERT INTO hr.payroll_runs (id,organization_id,payroll_period_id,run_number) VALUES ($1,$2,$3,'CI-PR-001')",
    [payrollRunId, organizationId, payrollPeriodId],
  );
  await client.query(
    "INSERT INTO hr.payroll_lines (organization_id,payroll_run_id,employee_id,component_code,component_name,component_type,amount) VALUES ($1,$2,$3,'BASE','Gaji pokok','earning',100),($1,$2,$3,'DEDUCT','Potongan','deduction',10)",
    [organizationId, payrollRunId, employeeId],
  );
  await client.query("UPDATE hr.payroll_runs SET status='approved' WHERE id=$1", [payrollRunId]);
  const approved = await client.query("SELECT status, approved_at FROM hr.payroll_runs WHERE id=$1", [payrollRunId]);
  assert.equal(approved.rows[0]?.status, "approved");
  assert.ok(approved.rows[0]?.approved_at, "approved payroll must have approved_at");
  await client.query("UPDATE hr.payroll_runs SET status='paid' WHERE id=$1", [payrollRunId]);
  const paid = await client.query("SELECT status, paid_at FROM hr.payroll_runs WHERE id=$1", [payrollRunId]);
  assert.equal(paid.rows[0]?.status, "paid");
  assert.ok(paid.rows[0]?.paid_at, "paid payroll must have paid_at");
  await expectSqlCode(
    () => client.query("UPDATE hr.payroll_lines SET amount=999 WHERE payroll_run_id=$1", [payrollRunId]),
    "55000",
    "paid payroll line immutability",
  );

  await client.query("ROLLBACK");
  process.stdout.write("Ledger invariants passed: balanced posting, posted journal immutability, append-only stock, and approved/paid payroll immutability.\n");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
