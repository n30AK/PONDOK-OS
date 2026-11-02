import { createHash, randomBytes } from "node:crypto";

const token = randomBytes(32).toString("base64url");
const digest = createHash("sha256").update(token, "utf8").digest("hex");

process.stdout.write([
  "PONDOK OS one-time first-institution bootstrap credential",
  "",
  "1. Copy the digest into PONDOK_BOOTSTRAP_TOKEN_SHA256 in the API environment.",
  "2. Restart/redeploy the API.",
  "3. Enter the raw token once in the first-setup screen.",
  "4. After successful initialization, remove PONDOK_BOOTSTRAP_TOKEN_SHA256 and restart the API.",
  "",
  "RAW TOKEN (do not commit or send in chat):",
  token,
  "",
  "SHA-256 DIGEST (configure as a server-side secret):",
  digest,
  "",
].join("\n"));
