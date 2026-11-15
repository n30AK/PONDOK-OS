import test from "node:test";
import assert from "node:assert/strict";
import { handleFinanceRequest, validateAccountInput, validateJournalInput } from "../dist/finance.js";
import { Readable } from "node:stream";

const uuidA = "123e4567-e89b-42d3-a456-426614174000";
const uuidB = "223e4567-e89b-42d3-a456-426614174000";
const validJournal = {
  fiscalPeriodId: uuidA, entryNumber: "JV-001", entryDate: "2026-11-02",
  description: "Setoran awal", lines: [
    { accountId: uuidA, debit: 1000000, credit: 0 },
    { accountId: uuidB, debit: 0, credit: 1000000 }
  ]
};

test("accepts valid chart-of-account input", () => {
  assert.equal(validateAccountInput({ accountCode: "1001", accountName: "Kas", accountType: "asset" }), null);
});
test("rejects invalid account type and parent identifier", () => {
  assert.equal(validateAccountInput({ accountCode: "1001", accountName: "Kas", accountType: "bank" }), "invalid_account_type");
  assert.equal(validateAccountInput({ accountCode: "1001", accountName: "Kas", accountType: "asset", parentAccountId: "bad" }), "invalid_parent_account_id");
});
test("accepts a balanced journal with debit and credit lines", () => {
  assert.equal(validateJournalInput(validJournal), null);
});
test("rejects unbalanced journals and lines with both debit and credit", () => {
  assert.equal(validateJournalInput({ ...validJournal, lines: [
    { accountId: uuidA, debit: 100, credit: 0 }, { accountId: uuidB, debit: 0, credit: 90 }
  ] }), "journal_not_balanced");
  assert.equal(validateJournalInput({ ...validJournal, lines: [
    { accountId: uuidA, debit: 100, credit: 100 }, { accountId: uuidB, debit: 0, credit: 0 }
  ] }), "journal_line_must_be_debit_or_credit");
});


test("finance APIs fail closed for scoped members and platform operators", async () => {
  const organizationId = "223e4567-e89b-42d3-a456-426614174000";
  const userId = "323e4567-e89b-42d3-a456-426614174000";
  const membershipId = "423e4567-e89b-42d3-a456-426614174000";
  function response() {
    return { statusCode: 0, headers: {}, body: "", writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, end(body) { this.body = body ?? ""; } };
  }
  function request(method, url, body) {
    const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    stream.method = method; stream.url = url; stream.headers = {};
    return stream;
  }
  for (const roles of [["finance_officer"], ["platform_super_admin"]]) {
    const pool = { async query(sql) {
      if (sql.includes("FROM core.organization_memberships")) {
        return { rows: [{ membership_id: membershipId, organization_id: organizationId, roles, permissions: ["finance.accounts.read", "finance.journals.read", "finance.journals.write"] }] };
      }
      throw new Error("finance SQL must not execute for a non-tenant-wide role");
    }};
    const get = response();
    await handleFinanceRequest(request("GET", "/v1/finance/journals"), get, pool, userId, organizationId);
    assert.equal(get.statusCode, 403);
    assert.equal(JSON.parse(get.body).error, "finance_access_requires_tenant_authority");

    const post = response();
    await handleFinanceRequest(request("POST", "/v1/finance/accounts", {
      accountCode: "1001", accountName: "Kas", accountType: "asset"
    }), post, pool, userId, organizationId);
    assert.equal(post.statusCode, 403);
    assert.equal(JSON.parse(post.body).error, "finance_access_requires_tenant_authority");
  }
});
