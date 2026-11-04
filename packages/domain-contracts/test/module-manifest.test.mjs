import test from "node:test";
import assert from "node:assert/strict";
import { assertValidModuleManifest, validateModuleManifest } from "../dist/index.js";

const validManifest = () => ({
  manifestVersion: 1,
  moduleId: "id.pondokos.cooperative",
  version: "1.0.0",
  displayName: "Koperasi Pesantren",
  publisher: "PONDOK OS",
  category: "business",
  dependencies: ["id.pondokos.core"],
  menu: [{ id: "cooperative.dashboard", label: "Koperasi", route: "/workspace/cooperative", permission: "cooperative.dashboard.read" }],
  permissions: ["cooperative.dashboard.read"],
  data: { schemaNamespace: "cooperative", tenantScoped: true, classification: "confidential" },
  forms: [{ id: "cooperative.member", schemaVersion: 1, fields: [{ name: "memberNumber", type: "string", required: true, classification: "confidential", retentionPolicy: "contractual" }] }],
});

test("accepts a valid declarative module manifest", () => {
  const manifest = validManifest();
  assert.deepEqual(validateModuleManifest(manifest), []);
  assert.doesNotThrow(() => assertValidModuleManifest(manifest));
});

test("rejects unscoped data and unsafe menu routes", () => {
  const manifest = validManifest();
  manifest.data.tenantScoped = false;
  manifest.menu[0].route = "https://untrusted.example/plugin";
  const errors = validateModuleManifest(manifest);
  assert.ok(errors.includes("tenant_scoping_required"));
  assert.ok(errors.includes("menu_0_invalid_route"));
});

test("rejects menu permissions that are not declared by the module", () => {
  const manifest = validManifest();
  manifest.menu[0].permission = "platform.super_admin";
  assert.ok(validateModuleManifest(manifest).includes("menu_0_permission_not_declared"));
});

test("requires enumerated values for enum fields", () => {
  const manifest = validManifest();
  manifest.forms[0].fields[0].type = "enum";
  assert.ok(validateModuleManifest(manifest).includes("form_0_field_0_enum_values_required"));
});

test("assert helper fails closed with actionable validation codes", () => {
  assert.throws(() => assertValidModuleManifest({ manifestVersion: 99 }), /INVALID_MODULE_MANIFEST/);
});
