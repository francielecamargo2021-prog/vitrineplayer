import "server-only";
import { neon } from "@neondatabase/serverless";

/**
 * Conexão do SERVIDOR com o Postgres (Neon). O dono do banco ignora a RLS, por isso
 * esta conexão não é exportada: toda consulta em nome de um usuário passa por
 * asUser(), que declara quem é o usuário (claims) e troca para o papel
 * `authenticated` dentro de uma transação. Assim a RLS do banco vale também aqui.
 *
 * Sem DATABASE_URL, `dbReady()` é falso e as áreas autenticadas mostram
 * "backend não configurado".
 */
const url = process.env.DATABASE_URL;
const sql = url ? neon(url) : null;

export const dbReady = () => sql !== null;

type Sql = NonNullable<typeof sql>;
type Query = ReturnType<Sql>;

/** Executa uma consulta como o usuário `userId` (RLS aplicada) e devolve as linhas. */
export async function asUser<T = Record<string, unknown>>(userId: string, query: (q: Sql) => Query): Promise<T[]> {
  if (!sql) throw new Error("DATABASE_URL não configurada");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("usuário inválido");
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  const results = await sql.transaction([
    sql`select set_config('request.jwt.claims', ${claims}, true)`,
    sql`set local role authenticated`,
    query(sql),
  ]);
  return results[2] as T[];
}

/**
 * Conexão de SERVIÇO, só para o processador da IA (substitui a antiga service role):
 * declara o papel `service_role` nas claims, que as funções ai_* exigem
 * (is_privileged()). Nunca usada para atender pedidos de usuários.
 */
export async function asService<T = Record<string, unknown>>(query: (q: Sql) => Query): Promise<T[]> {
  if (!sql) throw new Error("DATABASE_URL não configurada");
  const results = await sql.transaction([
    sql`select set_config('request.jwt.claims', ${JSON.stringify({ role: "service_role" })}, true)`,
    query(sql),
  ]);
  return results[1] as T[];
}
