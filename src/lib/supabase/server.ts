import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/** Cliente do servidor com a sessão do usuário (RLS sempre aplicada). `null` sem configuração. */
export async function createClient() {
  const env = supabaseEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Component: a renovação de cookies acontece no proxy.
        }
      },
    },
  });
}

export type ServerClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;
