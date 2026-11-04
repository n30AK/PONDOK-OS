export type ModuleDataClassification = "public" | "internal" | "confidential" | "restricted";
export type ModuleCategory = "education" | "boarding" | "business" | "finance" | "governance" | "community" | "platform" | "integration";

export interface ModuleManifestV1 {
  manifestVersion: 1;
  moduleId: string;
  version: string;
  displayName: string;
  publisher: string;
  category: ModuleCategory;
  dependencies: string[];
  menu: Array<{ id: string; label: string; route: string; permission: string; icon?: string; parentId?: string }>;
  permissions: string[];
  data: { schemaNamespace: string; tenantScoped: true; classification: ModuleDataClassification; migrationSet?: string };
  forms: Array<{ id: string; schemaVersion: number; fields: Array<{ name: string; type: string; required?: boolean; maxLength?: number; classification: ModuleDataClassification; retentionPolicy?: string; sourceOfTruth?: string; enumValues?: string[] }> }>;
  workflows?: string[];
  events?: { publishes?: string[]; subscribes?: string[] };
  integrations?: string[];
  healthChecks?: string[];
};

const MODULE_ID = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,}$/;
const PERMISSION = /^[a-z][a-z0-9._-]+$/;
const ROUTE = /^\/workspace\/[a-z0-9/-]+$/;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$/;
const CATEGORIES = new Set<ModuleCategory>(["education", "boarding", "business", "finance", "governance", "community", "platform", "integration"]);
const CLASSIFICATIONS = new Set<ModuleDataClassification>(["public", "internal", "confidential", "restricted"]);
const FIELD_TYPES = new Set(["string", "integer", "number", "boolean", "date", "datetime", "enum", "uuid", "json"]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(value: unknown, min = 1, max = 10_000): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}
function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => string(item)) && new Set(value).size === value.length;
}

/** Validate an untrusted declarative module manifest. This does not install or execute a module. */
export function validateModuleManifest(value: unknown): string[] {
  const errors: string[] = [];
  if (!record(value)) return ["manifest_must_be_object"];
  if (value.manifestVersion !== 1) errors.push("manifest_version_must_be_1");
  if (!string(value.moduleId, 1, 160) || !MODULE_ID.test(value.moduleId)) errors.push("invalid_module_id");
  if (!string(value.version, 1, 80) || !SEMVER.test(value.version)) errors.push("invalid_semver");
  if (!string(value.displayName, 2, 100)) errors.push("invalid_display_name");
  if (!string(value.publisher, 2, 100)) errors.push("invalid_publisher");
  if (!string(value.category) || !CATEGORIES.has(value.category as ModuleCategory)) errors.push("invalid_category");
  if (!stringArray(value.dependencies) || value.dependencies.some((item) => !MODULE_ID.test(item))) errors.push("invalid_dependencies");
  if (!stringArray(value.permissions) || value.permissions.length < 1 || value.permissions.some((item) => !PERMISSION.test(item))) errors.push("invalid_permissions");

  if (!record(value.data)) errors.push("invalid_data_contract");
  else {
    if (!string(value.data.schemaNamespace, 2, 31) || !/^[a-z][a-z0-9_]{1,30}$/.test(value.data.schemaNamespace)) errors.push("invalid_schema_namespace");
    if (value.data.tenantScoped !== true) errors.push("tenant_scoping_required");
    if (!string(value.data.classification) || !CLASSIFICATIONS.has(value.data.classification as ModuleDataClassification)) errors.push("invalid_data_classification");
    if (value.data.migrationSet !== undefined && !string(value.data.migrationSet, 1, 160)) errors.push("invalid_migration_set");
  }

  if (!Array.isArray(value.menu)) errors.push("invalid_menu");
  else value.menu.forEach((item, index) => {
    if (!record(item)) { errors.push(`menu_${index}_must_be_object`); return; }
    if (!string(item.id, 1, 120) || !/^[a-z][a-z0-9.-]+$/.test(item.id)) errors.push(`menu_${index}_invalid_id`);
    if (!string(item.label, 1, 80)) errors.push(`menu_${index}_invalid_label`);
    if (!string(item.route, 1, 200) || !ROUTE.test(item.route)) errors.push(`menu_${index}_invalid_route`);
    if (!string(item.permission, 1, 120) || !PERMISSION.test(item.permission)) errors.push(`menu_${index}_invalid_permission`);
    if (item.icon !== undefined && !string(item.icon, 1, 40)) errors.push(`menu_${index}_invalid_icon`);
    if (item.parentId !== undefined && !string(item.parentId, 1, 120)) errors.push(`menu_${index}_invalid_parent`);
    if (string(item.permission) && stringArray(value.permissions) && !value.permissions.includes(item.permission)) errors.push(`menu_${index}_permission_not_declared`);
  });

  if (!Array.isArray(value.forms)) errors.push("invalid_forms");
  else value.forms.forEach((form, index) => {
    if (!record(form)) { errors.push(`form_${index}_must_be_object`); return; }
    if (!string(form.id, 1, 120) || !/^[a-z][a-z0-9.-]+$/.test(form.id)) errors.push(`form_${index}_invalid_id`);
    if (!Number.isInteger(form.schemaVersion) || Number(form.schemaVersion) < 1) errors.push(`form_${index}_invalid_schema_version`);
    if (!Array.isArray(form.fields)) { errors.push(`form_${index}_invalid_fields`); return; }
    form.fields.forEach((field, fieldIndex) => {
      const prefix = `form_${index}_field_${fieldIndex}`;
      if (!record(field)) { errors.push(`${prefix}_must_be_object`); return; }
      if (!string(field.name, 1, 120) || !/^[a-z][a-zA-Z0-9]*$/.test(field.name)) errors.push(`${prefix}_invalid_name`);
      if (!string(field.type) || !FIELD_TYPES.has(field.type)) errors.push(`${prefix}_invalid_type`);
      if (!string(field.classification) || !CLASSIFICATIONS.has(field.classification as ModuleDataClassification)) errors.push(`${prefix}_invalid_classification`);
      if (field.required !== undefined && typeof field.required !== "boolean") errors.push(`${prefix}_invalid_required`);
      if (field.maxLength !== undefined && (!Number.isInteger(field.maxLength) || Number(field.maxLength) < 1 || Number(field.maxLength) > 100_000)) errors.push(`${prefix}_invalid_max_length`);
      if (field.retentionPolicy !== undefined && !string(field.retentionPolicy, 1, 120)) errors.push(`${prefix}_invalid_retention`);
      if (field.sourceOfTruth !== undefined && !string(field.sourceOfTruth, 1, 120)) errors.push(`${prefix}_invalid_source_of_truth`);
      if (field.enumValues !== undefined && (!stringArray(field.enumValues) || field.enumValues.length === 0)) errors.push(`${prefix}_invalid_enum_values`);
      if (field.type === "enum" && (!Array.isArray(field.enumValues) || field.enumValues.length === 0)) errors.push(`${prefix}_enum_values_required`);
    });
  });

  for (const key of ["workflows", "integrations", "healthChecks"] as const) {
    if (value[key] !== undefined && !stringArray(value[key])) errors.push(`invalid_${key}`);
  }
  if (value.events !== undefined) {
    if (!record(value.events)) errors.push("invalid_events");
    else for (const key of ["publishes", "subscribes"] as const) {
      if (value.events[key] !== undefined && !stringArray(value.events[key])) errors.push(`invalid_events_${key}`);
    }
  }
  return [...new Set(errors)];
}

export function assertValidModuleManifest(value: unknown): asserts value is ModuleManifestV1 {
  const errors = validateModuleManifest(value);
  if (errors.length) throw new Error(`INVALID_MODULE_MANIFEST:${errors.join(",")}`);
}
