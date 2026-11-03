import { readFile } from "node:fs/promises";
import { createNeonClient } from "@neon/sdk";

const apiKey = process.env.NEON_API_KEY;
if (!apiKey) {
  throw new Error("NEON_API_KEY is required. Use a project-scoped Neon API key.");
}

const projectId = "frosty-cherry-92983148";
const branchId = "br-proud-paper-b312lfxi";
const slug = "pondokapi";
const zipPath = new URL("../dist/pondok-api-function.zip", import.meta.url);
const zipBytes = await readFile(zipPath);
if (zipBytes.length < 1024) {
  throw new Error("Neon Function bundle is unexpectedly small; build it before deployment.");
}

const neon = createNeonClient({
  apiKey,
  throwOnError: true,
  requestTimeoutMs: 60_000,
});

console.log("Deploying PONDOK OS API to the development branch only.");
await neon.functions.deploy({
  projectId,
  branchId,
  slug,
  zip: new File([zipBytes], "pondok-api-function.zip", { type: "application/zip" }),
  runtime: "nodejs24",
  environment: JSON.stringify({
    CORS_ALLOWED_ORIGINS: "https://n30ak.github.io",
  }),
});

const deadline = Date.now() + 5 * 60_000;
let deployedFunction;
while (Date.now() < deadline) {
  deployedFunction = await neon.functions.get({ projectId, branchId, slug });
  const status = deployedFunction.current_deployment?.status;
  if (status === "completed") break;
  if (status === "failed" || status === "error") {
    throw new Error(`Neon Function deployment ended with status: ${status}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 3_000));
}

if (deployedFunction?.current_deployment?.status !== "completed") {
  throw new Error("Neon Function deployment did not complete within five minutes.");
}
if (!deployedFunction.invocation_url) {
  throw new Error("Neon Function completed but returned no invocation URL.");
}

console.log(`NEON_FUNCTION_URL=${deployedFunction.invocation_url}`);
console.log("Runtime: nodejs24");
console.log("Target: development branch br-proud-paper-b312lfxi");
console.log("Bootstrap remains disabled until PONDOK_BOOTSTRAP_TOKEN_SHA256 is configured.");
