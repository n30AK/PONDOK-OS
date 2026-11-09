import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("institution onboarding uses company-approved activation, not legacy bootstrap UI", async () => {
  const app = await read("apps/web/src/App.tsx");
  assert.match(app, /import InstitutionActivation from "\.\/InstitutionActivation"/);
  assert.match(app, /<InstitutionActivation\s*\/>/);
  for (const retired of ["firstSetup", "bootstrapFirstOrganization", "bootstrapToken", "x-bootstrap-token"]) {
    assert.equal(app.includes(retired), false, `retired UI reference: ${retired}`);
  }
});

test("legacy API bootstrap endpoint is permanently disabled", async () => {
  const api = await read("apps/api/src/main.ts");
  assert.match(api, /pathname === "\/v1\/bootstrap\/organization"[\s\S]{0,180}sendJson\(response, 410/);
});

test("direct database tenant bootstrap tooling is removed", async () => {
  const pkg = JSON.parse(await read("apps/api/package.json"));
  assert.equal(Object.hasOwn(pkg.scripts, "db:bootstrap"), false);
  await assert.rejects(read("apps/api/src/bootstrap-organization.ts"), { code: "ENOENT" });
  await assert.rejects(read("scripts/create-bootstrap-token.mjs"), { code: "ENOENT" });
});

test("current API deployment no longer injects the retired bootstrap digest", async () => {
  const deploy = await read("apps/api/scripts/deploy-neon-function.mjs");
  const workflow = await read(".github/workflows/deploy-neon-function.yml");
  assert.equal(deploy.includes("PONDOK_BOOTSTRAP_TOKEN_SHA256"), false);
  assert.equal(workflow.includes("PONDOK_BOOTSTRAP_TOKEN_SHA256"), false);
  assert.match(workflow, /test "\$status" = "410"/);
});
