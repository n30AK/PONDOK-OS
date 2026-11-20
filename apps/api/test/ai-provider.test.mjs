import test from "node:test";
import assert from "node:assert/strict";
import { runCloudflareActivationReview } from "../dist/ai-provider.js";

const env = {
  PONDOK_AI_ENABLED: "true",
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  CLOUDFLARE_AI_TOKEN: "cf-test-token-that-is-long-enough",
};

test("Cloudflare activation review is disabled unless explicitly enabled and configured", async () => {
  let calls = 0;
  const result = await runCloudflareActivationReview({
    organizationType: "pesantren",
    duplicateCandidateCount: 0,
    deterministicRecommendation: "ready_for_admin_review",
    findingCodes: [],
  }, {}, async () => { calls += 1; throw new Error("must not call"); });
  assert.deepEqual(result, { status: "disabled" });
  assert.equal(calls, 0);
});

test("Cloudflare activation review sends only minimized allowlisted metadata", async () => {
  let sent = "";
  const result = await runCloudflareActivationReview({
    organizationType: "pesantren",
    duplicateCandidateCount: 2,
    deterministicRecommendation: "high_risk_review",
    findingCodes: ["POSSIBLE_EXISTING_TENANT", "LEGAL_AND_REGULATORY_REVIEW_REQUIRED"],
    organizationName: "Rahasia Nama Lembaga",
    contactEmail: "private@example.org",
    organizationSlug: "rahasia",
  }, env, async (_url, init) => {
    sent = String(init?.body ?? "");
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        summary: "Perlu verifikasi manusia.",
        observations: ["Ada kandidat kemiripan."],
        manualChecks: ["Cocokkan dokumen resmi."],
      }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.equal(result.status, "succeeded");
  assert.equal(result.model, "@cf/zai-org/glm-4.7-flash");
  assert.equal(sent.includes("Rahasia Nama Lembaga"), false);
  assert.equal(sent.includes("private@example.org"), false);
  assert.equal(sent.includes("rahasia"), false);
  assert.equal(sent.includes("POSSIBLE_EXISTING_TENANT"), true);
});

test("Cloudflare quota exhaustion is reported without paid fallback", async () => {
  const result = await runCloudflareActivationReview({
    organizationType: "pesantren",
    duplicateCandidateCount: 0,
    deterministicRecommendation: "ready_for_admin_review",
    findingCodes: [],
  }, env, async () => new Response("{}", { status: 429 }));
  assert.deepEqual(result, { status: "quota_limited" });
});

test("invalid model output fails closed", async () => {
  const result = await runCloudflareActivationReview({
    organizationType: "pesantren",
    duplicateCandidateCount: 0,
    deterministicRecommendation: "ready_for_admin_review",
    findingCodes: [],
  }, env, async () => new Response(JSON.stringify({
    choices: [{ message: { content: "not-json" } }],
  }), { status: 200 }));
  assert.deepEqual(result, { status: "unavailable" });
});
