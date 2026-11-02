import test from "node:test";
import assert from "node:assert/strict";
import { assertTenantAccess, hasPermission } from "../dist/index.js";

test("allows access within the active organization", () => {
  assert.doesNotThrow(() =>
    assertTenantAccess({ organizationId: "org-a", userId: "user-1", permissions: new Set() }, "org-a"),
  );
});

test("rejects access across organizations", () => {
  assert.throws(
    () => assertTenantAccess({ organizationId: "org-a", userId: "user-1", permissions: new Set() }, "org-b"),
    { message: "TENANT_ACCESS_DENIED" },
  );
});

test("checks explicit permission membership", () => {
  const context = { organizationId: "org-a", userId: "user-1", permissions: new Set(["student.read"]) };
  assert.equal(hasPermission(context, "student.read"), true);
  assert.equal(hasPermission(context, "finance.post"), false);
});
