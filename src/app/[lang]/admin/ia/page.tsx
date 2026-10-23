import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { aiConsole, requireAdmin } from "@/lib/admin/data";
import { processAiNow, updateAiSettings } from "@/lib/admin/actions";
import { DIRECT_MAX_SECONDS, DIRECT_MAX_USD, directMaxCost } from "@/lib/ai/pricing";
import { fpsFor } from "@/lib/ai/planner";
import { ProcessNowButton } from "@/components/admin/ProcessNowButton";
import { AiSettingsForm } from "@/components/admin/AiSettingsForm";
import { AdminTitle, Facts, Section, fmtDate } from "@/components/admin/AdminUi";

const statusLabel: Record<string, string> = {
  awaiting_payment: "Aguardando crédito", queued: "Na fila", processing: "Processando", completed: "Concluídas",
  unidentified: "Atleta não identificado", failed: "Falharam", cancelled: "Canceladas",
};

/** A chamada direta ("Processar agora") espera o Gemini responder: até 5 minutos. */
export const maxDuration = 300;

/** Console da análise por IA: travas, limites, fila, custos e cortesias. A IA real fica desligada. */
export default async function AdminAi({ params }: PageProps<"/[lang]/admin/ia">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const d = await aiConsole(session);
  const envOn = process.env.AI_ANALYSIS_ENABLED === "true";
  const keyOn = Boolean(process.env.GEMINI_API_KEY);
  const usd = (n: number) => `US$ ${Number(n).toFixed(2)}`;
  const aiOn = d.settings.enabled && envOn && keyOn;
  return (
    <main className="gutter mx-auto max-w-6xl space-y-10 py-12 md:py-16">
      <AdminTitle lead="Análise técnica por IA (triagem preliminar). Nada é enviado ao provedor enquanto qualquer trava estiver desligada. Ligar a IA real exige nova autorização.">IA</AdminTitle>
      <Section title="Travas de custo" testId="travas-ia">
        <ul className="space-y-1.5 text-[0.95rem]">
          <li><span aria-hidden className={`mr-2 inline-block size-2 ${d.settings.enabled ? "bg-grass" : "bg-white/25"}`} />Banco (ai_settings.enabled): <span className="text-bone">{d.settings.enabled ? "ligado" : "desligado"}</span></li>
          <li><span aria-hidden className={`mr-2 inline-block size-2 ${envOn ? "bg-grass" : "bg-white/25"}`} />Servidor (AI_ANALYSIS_ENABLED): <span className="text-bone">{envOn ? "ligado" : "desligado"}</span></li>
          <li><span aria-hidden className={`mr-2 inline-block size-2 ${keyOn ? "bg-grass" : "bg-white/25"}`} />Chave da API do Google: <span className="text-bone">{keyOn ? "configurada" : "ausente"}</span></li>
        </ul>
        <p className="mt-3 text-[0.85rem] text-ash">Status: <span className="text-bone" data-testid="ia-status">{d.settings.enabled && envOn && keyOn ? "IA ativa" : "IA desligada"}</span> · modelo {d.settings.model} · análises incluídas no cadastro: {d.settings.included_per_athlete}</p>
      </Section>
      <div className="grid gap-10 md:grid-cols-2">
        <Section title="Limites e orçamento">
          <AiSettingsForm action={updateAiSettings.bind(null, lang)} s={d.settings} />
        </Section>
        <Section title="Números">
          <Facts rows={[
            ...Object.entries(d.byStatus).map(([k, v]) => [statusLabel[k] ?? k, v] as [string, number]),
            ["Custo no mês", usd(d.costMonth)], ["Custo total", usd(d.costTotal)],
          ]} />
          {Object.keys(d.byStatus).length === 0 && <p className="mt-2 text-[0.9rem] text-fog">Nenhum pedido ainda.</p>}
        </Section>
      </div>
      <Section title="Pedidos recentes">
        <p className="mb-3 text-[0.85rem] text-ash">O botão “Processar agora” aparece só com a IA ligada, para melhores momentos de até 10 minutos, com o perfil do atleta aprovado. Cada clique confirmado gera custo; partidas completas seguem no processamento em lote (experimental).</p>
        {d.requests.length === 0 ? <p className="text-[0.9rem] text-fog">Nenhum pedido.</p> : (
          <ul className="space-y-1.5 text-[0.85rem] text-fog">
            {d.requests.map((r) => (
              <li key={r.id}>{fmtDate(r.created_at)} · <Link href={`/${lang}/admin/atletas/${r.athlete_id}`} className="text-bone hover:text-grass">{r.athlete}</Link> · {statusLabel[r.status] ?? r.status} · {r.video_type} · {usd(r.cost_usd)}{r.error ? " · erro registrado" : ""}
                {/* só o que pode ir na hora: na fila, melhores momentos até 10 min, perfil aprovado e IA ligada */}
                {aiOn && r.status === "queued" && r.video_type === "highlights" && (r.video_seconds ?? Infinity) <= DIRECT_MAX_SECONDS && r.athlete_status === "approved" && r.model === d.settings.model && (() => {
                  const max = directMaxCost(r.model, r.video_seconds ?? DIRECT_MAX_SECONDS, fpsFor("highlights", r.video_seconds ?? DIRECT_MAX_SECONDS)).costUsd;
                  return max <= DIRECT_MAX_USD ? <ProcessNowButton action={processAiNow.bind(null, lang, r.id)} maxCost={`US$ ${max.toFixed(2)}`} model={r.model} /> : null;
                })()}
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Cortesias concedidas">
        <p className="mb-2 text-[0.85rem] text-ash">Conceda pela página do atleta. Cobrança por análise ainda não está ativa.</p>
        <ul className="space-y-1.5 text-[0.85rem] text-fog">
          {d.grants.length === 0 && <li>Nenhuma.</li>}
          {d.grants.map((g, i) => <li key={i}>{fmtDate(g.created_at)} · <Link href={`/${lang}/admin/atletas/${g.athlete_id}`} className="text-bone">{g.athlete}</Link> · {g.quantity} · {g.reason}{g.by ? ` · ${g.by}` : ""}</li>)}
        </ul>
      </Section>
      {d.batches.length > 0 && (
        <Section title="Lotes enviados">
          <ul className="space-y-1 text-[0.85rem] text-fog">{d.batches.map((b) => <li key={b.id}>{fmtDate(b.created_at)} · {b.status} · {b.item_count} itens · {usd(b.cost_usd)}</li>)}</ul>
        </Section>
      )}
    </main>
  );
}
