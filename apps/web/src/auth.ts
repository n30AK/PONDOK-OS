import { createAuthClient } from "@neondatabase/auth";

type AuthResult<T> = { data: T | null; error: { message: string } | null };
type AuthUserPayload = {
  user?: unknown;
  session?: { user?: unknown } | null;
};
type AuthClient = {
  getSession(): Promise<AuthResult<AuthUserPayload>>;
  signIn: { email(input: { email: string; password: string }): Promise<AuthResult<AuthUserPayload>> };
  signUp: { email(input: { email: string; password: string; name: string }): Promise<AuthResult<AuthUserPayload>> };
  emailOtp: {
    sendVerificationOtp(input: { email: string; type: "email-verification" }): Promise<AuthResult<unknown>>;
    verifyEmail(input: { email: string; otp: string }): Promise<AuthResult<unknown>>;
  };
  signOut(): Promise<unknown>;
};

const authUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim();
export const authClient: AuthClient | null = authUrl
  ? createAuthClient(authUrl) as unknown as AuthClient
  : null;

export type PondokUser = {
  id: string;
  name?: string;
  email?: string;
  emailVerified?: boolean;
};

/**
 * Managed Better Auth getSession() returns the user under data.session.user.
 * Some auth operations also return data.user, so accept both documented
 * response shapes without treating a missing session as an authenticated user.
 */
function readPondokUser(payload: AuthUserPayload | null | undefined): PondokUser | null {
  const candidate = payload?.session?.user ?? payload?.user;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const user = candidate as Record<string, unknown>;
  if (typeof user.id !== "string" || !user.id) return null;
  return {
    id: user.id,
    ...(typeof user.name === "string" ? { name: user.name } : {}),
    ...(typeof user.email === "string" ? { email: user.email } : {}),
    ...(typeof user.emailVerified === "boolean" ? { emailVerified: user.emailVerified } : {}),
  };
}

function isJwt(value: unknown): value is string {
  return typeof value === "string" && value.split(".").length === 3 && value.length > 100;
}

function readTokenPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  const nested = value.data && typeof value.data === "object" && !Array.isArray(value.data)
    ? value.data as Record<string, unknown>
    : null;
  const session = value.session && typeof value.session === "object" && !Array.isArray(value.session)
    ? value.session as Record<string, unknown>
    : null;
  const candidates = [value.token, value.access_token, nested?.token, nested?.access_token, session?.access_token];
  return candidates.find(isJwt) ?? null;
}

/**
 * The SDK's token helper can occasionally return a session-shaped response
 * without the JWT. Ask the Managed Auth token endpoint directly as a fallback.
 * The HTTP-only session cookie remains browser-managed and is never copied to
 * localStorage or exposed to application code.
 */
async function getTokenFromAuthEndpoint(): Promise<string> {
  if (!authUrl) throw new Error("Neon Auth belum dikonfigurasi.");
  const response = await fetch(`${(authUrl.endsWith("/") ? authUrl.slice(0, -1) : authUrl)}/token`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Neon Auth menolak penerbitan token (HTTP ${response.status}). Sesi mungkin kedaluwarsa; keluar lalu masuk kembali.`);
  }
  const payload: unknown = await response.json().catch(() => null);
  const token = readTokenPayload(payload);
  if (!token) throw new Error("Neon Auth merespons tanpa JWT yang valid. Muat ulang halaman lalu masuk kembali.");
  return token;
}

export async function getAccessToken(): Promise<string> {
  if (!authClient) throw new Error("Neon Auth belum dikonfigurasi. Isi VITE_NEON_AUTH_URL.");
  // Use the explicit credentialed Managed Auth endpoint consistently. This
  // avoids an extra SDK token request that can fail before cookie fallback.
  // The HTTP-only session cookie stays browser-managed; no token is persisted.
  return getTokenFromAuthEndpoint();
}

export async function getCurrentUser(): Promise<PondokUser | null> {
  if (!authClient) return null;
  const result = await authClient.getSession();
  if (result.error) throw new Error(result.error.message);
  return readPondokUser(result.data);
}
