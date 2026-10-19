import "server-only";
import { neon } from "@neondatabase/serverless";

/** Conexão do SERVIDOR (dono do banco). Sempre declara de quem é a ação: claims = usuário. */
const sql = neon(process.env.DATABASE_URL!);

export async function asUser<T = Record<string, unknown>>(userId: string, query: (q: typeof sql) => ReturnType<typeof sql>) {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  const [, , rows] = await sql.transaction([
    sql`select set_config('request.jwt.claims', ${claims}, true)`,
    sql`set local role authenticated`,
    query(sql),
  ]);
  return rows as T[];
}
