import test from "node:test";
import assert from "node:assert/strict";
import { validateAccountInput, validateJournalInput } from "../dist/finance.js";

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
