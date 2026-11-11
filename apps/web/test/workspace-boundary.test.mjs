import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspaceSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Workspace never redirects or links into the separate Central Command app", () => {
  assert.doesNotMatch(workspaceSource, /\/command-center\//i);
  assert.doesNotMatch(
    workspaceSource,
    /(?:window\.)?location\.(?:assign|replace)\s*\([^)]*command-center/i,
  );
});

test("platform administrators can open only tenant workspaces with explicit membership", () => {
  assert.match(workspaceSource, /const organizations = await listUserOrganizations|\/v1\/tenant\/organizations/);
  assert.match(workspaceSource, /isSuperAdmin[\s\S]{0,500}organization/i);
  assert.doesNotMatch(workspaceSource, /if \(isSuperAdmin\) \{[\s\S]{0,300}setOrganizations\(\[\]\)/);
  assert.match(workspaceSource, /\/v1\/tenant\/context/);
});
