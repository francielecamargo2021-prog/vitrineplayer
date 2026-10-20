import "server-only";
import { cache } from "react";
import { PostgrestClient } from "@supabase/postgrest-js";
import { getAuth } from "@/lib/auth/server";
import type { Database } from "@/lib/db/database.types";

/**
 * Acesso aos dados pela Neon Data API, SEMPRE com o JWT do usuário logado: o banco
 * aplica a RLS em cada consulta (o servidor nunca usa a conexão do dono para isso).
 * Só o servidor fala com a Data API; o navegador nunca recebe o JWT nem o endereço.
 *
 * Mesma sintaxe `.from()` / `.rpc()` usada até a Etapa 2 (biblioteca estável e aberta).
 */
export type DataClient = PostgrestClient<Database>;

export function dataApiUrl() {
  return process.env.NEON_DATA_API_URL ?? null;
}

/** JWT curto (15 min) do Neon Auth para a sessão atual. `null` sem sessão. */
const sessionJwt = cache(async (): Promise<string | null> => {
  const auth = getAuth();
  if (!auth) return null;
  try {
    const r = (await auth.token()) as { data?: { token?: string } | null } | null;
    return r?.data?.token ?? null;
  } catch {
    return null;
  }
});

/** Cliente de dados da requisição atual (cacheado). `null` sem configuração ou sem sessão. */
export const userDataClient = cache(async (): Promise<DataClient | null> => {
  const url = dataApiUrl();
  if (!url) return null;
  const jwt = await sessionJwt();
  if (!jwt) return null;
  return new PostgrestClient<Database>(url, {
    headers: { Authorization: `Bearer ${jwt}` },
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  });
});
