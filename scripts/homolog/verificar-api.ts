/**
 * Verificação da homologação PELA API (o mesmo caminho do navegador).
 * SOMENTE LEITURA: não cria, altera nem apaga nada.
 * Uso: node scripts/homolog/verificar-api.ts
 * Requer VP_ENV=homolog, HOMOLOG_SUPABASE_REF e NEXT_PUBLIC_SUPABASE_URL/ANON_KEY do projeto de homologação.
 */
import { assertHomolog } from "./guard.ts";

const env = assertHomolog();
const rest = `${env.url}/rest/v1`;
const anonHeaders = { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}`, "Content-Type": "application/json" };
let failed = 0;
const check = (ok: boolean, desc: string, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${desc}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};

async function rows(table: string) {
  const r = await fetch(`${rest}/${table}?select=*&limit=5`, { headers: anonHeaders });
  return { status: r.status, body: r.ok ? ((await r.json()) as unknown[]) : null };
}
async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${rest}/rpc/${fn}`, { method: "POST", headers: anonHeaders, body: JSON.stringify(args) });
  return { status: r.status, text: await r.text() };
}

console.log(`Projeto: ${env.ref} (homologação)\n— visitante sem login`);
for (const t of ["athletes", "profiles", "athlete_media", "payments", "consents", "organizations", "ai_settings", "ai_video_reports", "audit_log"]) {
  const r = await rows(t);
  check(r.status === 200 ? r.body!.length === 0 : r.status === 401 || r.status === 403, `não lê ${t}`, `HTTP ${r.status}`);
}
const fake = "00000000-0000-0000-0000-000000000000";
const pay = await rpc("mark_payment_paid", { p_payment: fake, p_provider: "x", p_provider_ref: "x" });
check(pay.status === 401 || pay.status === 403 || /permission denied/i.test(pay.text), "não confirma pagamento", `HTTP ${pay.status}`);
const adm = await rpc("admin_review_athlete", { p_athlete: fake, p_decision: "approve" });
check(adm.status === 401 || adm.status === 403 || /permission denied/i.test(adm.text), "não executa revisão do admin", `HTTP ${adm.status}`);
const ai = await rpc("ai_claim_jobs", { p_ids: [fake], p_batch: fake });
check(ai.status === 401 || ai.status === 403 || /permission denied/i.test(ai.text), "não mexe na fila da IA", `HTTP ${ai.status}`);
const photo = await fetch(`${env.url}/storage/v1/object/public/athlete-photos/${fake}/x.webp`);
check(photo.status >= 400, "fotos não são públicas", `HTTP ${photo.status}`);

console.log(failed ? `\n${failed} falha(s).` : "\nTudo certo: nada é visível sem login.");
process.exit(failed ? 1 : 0);
