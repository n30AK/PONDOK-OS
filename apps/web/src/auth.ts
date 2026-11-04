import { createAuthClient } from "@neondatabase/auth";

type AuthResult<T> = { data: T | null; error: { message: string } | null };
type AuthUserPayload = {
  user?: unknown;
  session?: { user?: unknown } | null;
};
type AuthClient = {
  token(): Promise<AuthResult<{ token?: string }>>;
  getSession(): Promise<AuthResult<AuthUserPayload>>;
  signIn: { email(input: { email: string; password: string }): Promise<AuthResult<AuthUserPayload>> };
  signUp: { email(input: { email: string; password: string; name: string }): Promise<AuthResult<AuthUserPayload>> };
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
  };
}

export async function getAccessToken(): Promise<string> {
  if (!authClient) throw new Error("Neon Auth belum dikonfigurasi. Isi VITE_NEON_AUTH_URL.");
  const result = await authClient.token();
  if (result.error || !result.data?.token) {
    throw new Error(result.error?.message ?? "Sesi login tidak menghasilkan access token.");
  }
  return result.data.token;
}

export async function getCurrentUser(): Promise<PondokUser | null> {
  if (!authClient) return null;
  const result = await authClient.getSession();
  if (result.error) throw new Error(result.error.message);
  return readPondokUser(result.data);
}
