import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { createNeonAuth } from "@neondatabase/auth/next/server";

/**
 * Neon Auth (login, sessão em cookie HttpOnly). O SDK fica isolado neste módulo:
 * trocar de versão ou de fornecedor mexe só em src/lib/auth/.
 *
 * Sem NEON_AUTH_BASE_URL e NEON_AUTH_COOKIE_SECRET o site público continua
 * funcionando e as áreas autenticadas mostram "backend não configurado".
 */
export function authEnv() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  return baseUrl && secret && secret.length >= 32 ? { baseUrl, secret } : null;
}

type NeonAuth = ReturnType<typeof createNeonAuth>;
let instance: NeonAuth | null = null;

/** Instância única do Neon Auth no servidor. `null` sem configuração. */
export function getAuth(): NeonAuth | null {
  const env = authEnv();
  if (!env) return null;
  instance ??= createNeonAuth({ baseUrl: env.baseUrl, cookies: { secret: env.secret }, logLevel: "warn" });
  return instance;
}

export type AuthUser = { id: string; email: string; name: string; emailVerified: boolean };

/** Usuário da sessão atual (ou `null`). Nunca lança: falha de rede = sem sessão. */
export async function currentUser(): Promise<AuthUser | null> {
  const auth = getAuth();
  if (!auth) return null;
  await connection(); // sessão = sempre por requisição, nunca na geração estática
  try {
    const { data } = await auth.getSession();
    const u = data?.user;
    if (!u?.id || !u.email) return null;
    return { id: u.id, email: u.email, name: u.name ?? "", emailVerified: Boolean(u.emailVerified) };
  } catch (e) {
    unstable_rethrow(e);
    return null;
  }
}
