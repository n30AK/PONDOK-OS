import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const webDist = resolve(root, "apps/web/dist");
const commandCenterDist = resolve(root, "apps/command-center/dist");

function runPnpm(args, extraEnv = {}) {
  const result = spawnSync("pnpm", args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`pnpm ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
  }
}

rmSync(webDist, { recursive: true, force: true });
rmSync(commandCenterDist, { recursive: true, force: true });

runPnpm(["--filter", "@pondok-os/web", "build"], { VITE_BASE_PATH: "/" });
runPnpm(["--filter", "@pondok-os/command-center", "build"], {
  VITE_BASE_PATH: "/command-center/",
});

const commandCenterOutput = resolve(webDist, "command-center");
const marketingOutput = resolve(webDist, "website");
mkdirSync(commandCenterOutput, { recursive: true });
cpSync(commandCenterDist, commandCenterOutput, { recursive: true });
cpSync(resolve(root, "apps/marketing"), marketingOutput, { recursive: true });

writeFileSync(
  resolve(webDist, "_redirects"),
  [
    "/command-center /command-center/ 301",
    "/command-center/* /command-center/index.html 200",
    "/website /website/ 301",
    "/website/* /website/index.html 200",
    "/* /index.html 200",
    "",
  ].join("\n"),
);

writeFileSync(
  resolve(webDist, "_headers"),
  [
    "/*",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "  X-Frame-Options: DENY",
    "  Permissions-Policy: camera=(), microphone=(), geolocation=()",
    "",
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    "/command-center/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    "/website/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n"),
);

console.log("Cloudflare Pages artifact ready: apps/web/dist");
console.log(" - Institution workspace: /");
console.log(" - AKVISIO Command Center: /command-center/");
console.log(" - Public marketing website: /website/");
