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
