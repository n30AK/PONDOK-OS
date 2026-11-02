import test from "node:test";
import assert from "node:assert/strict";
import { validateSyncEventInput } from "../dist/sync.js";

const valid = {
  deviceId: "123e4567-e89b-42d3-a456-426614174000",
  eventId: "223e4567-e89b-42d3-a456-426614174000",
  idempotencyKey: "device-001:event-0001",
  aggregateType: "academic.student",
  aggregateId: "SAN-001",
  eventType: "student.created",
  schemaVersion: 1,
  occurredAt: "2026-11-02T10:00:00.000Z",
  payload: { studentNumber: "SAN-001", legalName: "Ahmad Fulan" }
};

test("accepts a well-formed sync event envelope", () => {
  assert.equal(validateSyncEventInput(valid), null);
});
test("rejects invalid device/event identifiers and idempotency keys", () => {
  assert.equal(validateSyncEventInput({ ...valid, deviceId: "bad" }), "invalid_device_id");
  assert.equal(validateSyncEventInput({ ...valid, eventId: "bad" }), "invalid_event_id");
  assert.equal(validateSyncEventInput({ ...valid, idempotencyKey: "x" }), "invalid_idempotency_key");
});
test("rejects invalid schema versions, timestamps and non-object payloads", () => {
  assert.equal(validateSyncEventInput({ ...valid, schemaVersion: 0 }), "invalid_schema_version");
  assert.equal(validateSyncEventInput({ ...valid, occurredAt: "yesterday" }), "invalid_occurred_at");
  assert.equal(validateSyncEventInput({ ...valid, payload: [] }), "invalid_payload");
});
test("rejects oversized sync payloads", () => {
  assert.equal(validateSyncEventInput({ ...valid, payload: { text: "x".repeat(50_000) } }), "payload_too_large");
});
