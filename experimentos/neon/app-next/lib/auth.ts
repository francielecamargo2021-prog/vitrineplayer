import { createNeonAuth } from "@neondatabase/auth/next/server";

export const auth = createNeonAuth({
  baseUrl: process.env.NEON_AUTH_BASE_URL!,
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});

/** JWT da sessão atual para a Data API (o RLS do banco usa o "sub"). */
export async function sessionJwt(): Promise<string | null> {
  const a = auth as unknown as { token?: () => Promise<{ data?: { token?: string } | null; token?: string } | null> };
  const r = await a.token?.();
  return r?.data?.token ?? r?.token ?? null;
}

export async function dataApi(path: string, init: RequestInit = {}) {
  const jwt = await sessionJwt();
  if (!jwt) throw new Error("sem JWT");
  const r = await fetch(`${process.env.NEON_DATA_API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}`, ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null };
}
