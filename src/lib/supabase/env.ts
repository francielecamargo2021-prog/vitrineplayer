/**
 * Configuração pública do Supabase. Sem as duas variáveis a aplicação continua
 * funcionando (site público) e as áreas autenticadas mostram "backend não
 * configurado" — nunca valores inventados.
 */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}
