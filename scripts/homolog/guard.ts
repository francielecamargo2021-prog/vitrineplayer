/**
 * Trava de ambiente dos scripts de homologação: só continua se TUDO apontar
 * para o projeto de homologação e se a IA paga estiver fora do ambiente.
 */
export function assertHomolog() {
  const fail = (msg: string): never => {
    console.error(`RECUSADO: ${msg}. Nada foi feito.`);
    process.exit(3);
  };
  if (process.env.VP_ENV !== "homolog") fail("VP_ENV precisa ser 'homolog'");
  const ref = process.env.HOMOLOG_SUPABASE_REF ?? "";
  if (!/^[a-z0-9]{20}$/.test(ref)) fail("HOMOLOG_SUPABASE_REF ausente ou inválido");
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (url !== `https://${ref}.supabase.co`) fail("NEXT_PUBLIC_SUPABASE_URL não é o projeto de homologação");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!anonKey) fail("NEXT_PUBLIC_SUPABASE_ANON_KEY ausente");
  if (process.env.GEMINI_API_KEY) fail("GEMINI_API_KEY está definida — nesta etapa ela não pode existir no ambiente");
  if (process.env.AI_ANALYSIS_ENABLED === "true") fail("AI_ANALYSIS_ENABLED=true não é permitido nesta etapa");
  return { ref, url, anonKey };
}
