import { createAuthClient } from "@neondatabase/auth";

const authUrl = import.meta.env.VITE_NEON_AUTH_URL?.trim();
export const authClient = authUrl ? createAuthClient(authUrl) : null;

export type PondokUser = {
  id: string;
  name?: string;
  email?: string;
};

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
  const user = result.data?.user;
  return user ? user as PondokUser : null;
}