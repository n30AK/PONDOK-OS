import { jwtVerify, type JWTVerifyGetKey, type JWTPayload } from "jose";

export interface VerifiedIdentity {
  userId: string;
  payload: JWTPayload;
}

export function readBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(header);
  return match?.[1] ?? null;
}

export async function verifyAccessToken(
  token: string,
  jwks: JWTVerifyGetKey,
  issuer: string,
): Promise<VerifiedIdentity> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    algorithms: ["EdDSA"],
    requiredClaims: ["sub", "exp", "iat"],
  });

  if (typeof payload.sub !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sub)) {
    throw new Error("invalid_subject");
  }
  return { userId: payload.sub, payload };
}
