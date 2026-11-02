import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { readBearerToken, verifyAccessToken } from "../dist/identity.js";

const issuer = "https://auth.example.test";
const userId = "a7e6e2e2-8c2a-4e10-9b2e-3a18f9a6d4c1";

test("Bearer parser accepts only a three-part bearer JWT", () => {
  assert.equal(readBearerToken("Bearer abc.def.ghi"), "abc.def.ghi");
  assert.equal(readBearerToken("Basic abc.def.ghi"), null);
  assert.equal(readBearerToken("Bearer not-a-jwt"), null);
  assert.equal(readBearerToken(undefined), null);
});

test("verifies EdDSA token and returns its UUID subject", async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: "pondok-test-key", alg: "EdDSA", use: "sig" });
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const token = await new SignJWT({ scope: "test" }).setProtectedHeader({ alg: "EdDSA", kid: "pondok-test-key" })
    .setSubject(userId).setIssuer(issuer).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const identity = await verifyAccessToken(token, jwks, issuer);
  assert.equal(identity.userId, userId);
  assert.equal(identity.payload.iss, issuer);
});

test("rejects tokens from an unexpected issuer", async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: "pondok-test-key", alg: "EdDSA" });
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const token = await new SignJWT({}).setProtectedHeader({ alg: "EdDSA", kid: "pondok-test-key" })
    .setSubject(userId).setIssuer("https://attacker.example.test").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  await assert.rejects(() => verifyAccessToken(token, jwks, issuer));
});

test("rejects a non-UUID subject", async () => {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA");
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: "pondok-test-key", alg: "EdDSA" });
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const token = await new SignJWT({}).setProtectedHeader({ alg: "EdDSA", kid: "pondok-test-key" })
    .setSubject("not-a-uuid").setIssuer(issuer).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  await assert.rejects(() => verifyAccessToken(token, jwks, issuer), /invalid_subject/);
});
