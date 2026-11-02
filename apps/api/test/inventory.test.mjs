import test from "node:test";
import assert from "node:assert/strict";
import { validateInventoryItemInput, validateMovementInput } from "../dist/inventory.js";

const item = "123e4567-e89b-42d3-a456-426614174000";
const whA = "223e4567-e89b-42d3-a456-426614174000";
const whB = "323e4567-e89b-42d3-a456-426614174000";

test("validates inventory item master data", () => {
  assert.equal(validateInventoryItemInput({ itemCode: "BRG-001", itemName: "Beras", unitCode: "kg", reorderLevel: 20 }), null);
  assert.equal(validateInventoryItemInput({ itemCode: "BRG-001", itemName: "Beras", unitCode: "kg", reorderLevel: -1 }), "invalid_reorder_level");
});
test("accepts receipt and issue movements", () => {
  assert.equal(validateMovementInput({ itemId: item, warehouseId: whA, movementType: "receipt", quantity: 10 }), null);
  assert.equal(validateMovementInput({ itemId: item, warehouseId: whA, movementType: "issue", quantity: 2 }), null);
});
test("validates transfer pair and positive quantity", () => {
  assert.equal(validateMovementInput({ itemId: item, movementType: "transfer", fromWarehouseId: whA, toWarehouseId: whB, quantity: 3 }), null);
  assert.equal(validateMovementInput({ itemId: item, movementType: "transfer", fromWarehouseId: whA, toWarehouseId: whA, quantity: 3 }), "transfer_warehouses_must_differ");
  assert.equal(validateMovementInput({ itemId: item, warehouseId: whA, movementType: "issue", quantity: 0 }), "invalid_quantity");
});
