import test from "node:test";
import assert from "node:assert/strict";
import { validateEmployeeInput, validatePayrollRunInput } from "../dist/hr.js";

const employeeId = "123e4567-e89b-42d3-a456-426614174000";
const periodId = "223e4567-e89b-42d3-a456-426614174000";
const validEmployee = { employeeNumber: "PGW-001", legalName: "Ahmad Fulan", joinedOn: "2024-07-01" };

test("validates employee master data", () => {
  assert.equal(validateEmployeeInput(validEmployee), null);
  assert.equal(validateEmployeeInput({ ...validEmployee, employeeNumber: "" }), "invalid_employee_number");
});
test("validates payroll lines and component types", () => {
  const valid = {
    payrollPeriodId: periodId, runNumber: "PAY-2026-11", runType: "regular",
    lines: [
      { employeeId, componentCode: "BASE", componentName: "Gaji pokok", componentType: "earning", amount: 5000000 },
      { employeeId, componentCode: "CUT", componentName: "Potongan", componentType: "deduction", amount: 100000 }
    ]
  };
  assert.equal(validatePayrollRunInput(valid), null);
  assert.equal(validatePayrollRunInput({ ...valid, lines: [{ ...valid.lines[0], amount: 0 }] }), "invalid_component_amount");
  assert.equal(validatePayrollRunInput({ ...valid, lines: [{ ...valid.lines[0], componentType: "other" }] }), "invalid_component_type");
});
