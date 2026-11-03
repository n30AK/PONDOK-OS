import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const bundleUrl = pathToFileURL(resolve("apps/api/dist/neon-function/index.mjs"));
const module = await import(bundleUrl.href);
assert.equal(typeof module.default?.fetch, "function", "Neon Function must export fetch(Request)");
console.log("Neon Function bundle import smoke test passed.");
