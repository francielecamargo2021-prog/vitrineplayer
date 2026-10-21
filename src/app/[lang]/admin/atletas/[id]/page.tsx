import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { getAthleteForReview, requireAdmin } from "@/lib/admin/data";
import { grantAi, removeMedia, requestCorrection, reviewAthlete } from "@/lib/admin/actions";
import { AthleteSheet } from "@/components/panel/AthleteSheet";
import { FramedPhoto } from "@/components/panel/FramedPhoto";
import { ReviewForm, type DecisionOption } from "@/components/admin/ReviewForm";
import { ActionForm } from "@/components/admin/ActionForm";
import { Section, auditLabel, fmtDate } from "@/components/admin/AdminUi";
import { youtubeThumb, type AthleteStatus } from "@/domain/athlete";

const optionsFor: Record<AthleteStatus, DecisionOption[]> = {
  in_review: [
    { value: "approve", label: "Aprovar perfil", needsNote: false, tone: "primary" },
    { value: "reject", label: "Pedir ajustes", needsNote: true, tone: "danger" },
  ],
  approved: [{ value: "suspend", label: "Suspender", needsNote: true, tone: "danger" }],
  suspended: [{ value: "reinstate", label: "Reativar", needsNote: false, tone: "primary" }],
  rejected: [], draft: [], pending_payment: [],
};
const aiStatus: Record<string, string> = {
  awaiting_payment: "aguardando crédito", queued: "na fila", processing: "processando", completed: "concluída",
  unidentified: "atleta não identificado", failed: "falhou", cancelled: "cancelada",
};

export default async function AdminAthlete({ params }: PageProps<"/[lang]/admin/atletas/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const [p, d] = await Promise.all([getPanelDictionary("pt"), getAthleteForReview(session, id)]);
  const { bundle, urls, guardians, history, corrections, ai } = d;
  const a = bundle.athlete;

  return (
    <>
      <section className="gutter mx-auto max-w-6xl space-y-10 py-10 md:py-12">
        <Link href={`/${lang}/admin/atletas?situacao=${a.status}`} className="text-[0.875rem] text-fog underline-offset-4 hover:text-bone hover:underline">← Atletas · {p.status[a.status]}</Link>
        <div className="grid gap-10 md:grid-cols-12">
          <div className="space-y-6 md:col-span-5">
            <h1 className="font-display text-[2.4rem] font-black uppercase leading-[0.9] [font-stretch:62%]">Revisão</h1>
            <dl className="space-y-3 text-[0.9rem]">
              <div><dt className="eyebrow text-ash">Situação</dt><dd className="mt-1 text-bone">{p.status[a.status]} · {p.visibility[a.visibility]}</dd></div>
              <div><dt className="eyebrow text-ash">Fotos · vídeos</dt><dd className="mt-1 text-bone">{bundle.photos.length} · {bundle.videos.length}</dd></div>
              {a.review_note && <div><dt className="eyebrow text-ash">Último motivo enviado</dt><dd className="mt-1 text-fog">{a.review_note}</dd></div>}
            </dl>
            <Section title="Responsáveis (visível só para o admin)" testId="responsaveis">
              <ul className="space-y-2 text-[0.9rem]">
                {guardians.map((g) => (
                  <li key={g.profile_id}>
                    <Link href={`/${lang}/admin/contas/${g.profile_id}`} className="text-bone hover:text-grass">{g.full_name}</Link>
                    <span className="block text-ash">{p.newAthlete.relations[g.relation as keyof typeof p.newAthlete.relations] ?? g.relation}{g.is_primary ? " · principal" : ""} · {g.email}{g.whatsapp ? ` · ${g.whatsapp}` : ""}{g.suspended_at ? " · conta suspensa" : ""}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
          <div className="space-y-8 md:col-span-7">
            <ReviewForm action={reviewAthlete.bind(null, lang, a.id)} options={optionsFor[a.status]} />
            <Section title="Pedir correção à família" testId="pedir-correcao">
              <ActionForm action={requestCorrection.bind(null, lang, a.id)} note="O que precisa ser corrigido" noteRequired buttons={[{ label: "Enviar pedido" }]} />
              {corrections.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-[0.85rem] text-fog">
                  {corrections.map((c) => <li key={c.id}>{fmtDate(c.created_at)} · {c.note} · {c.resolved_at ? `resolvido ${fmtDate(c.resolved_at)}` : "em aberto"}</li>)}
                </ul>
              )}
            </Section>
          </div>
        </div>

        <Section title="Moderação de fotos e vídeos" testId="moderacao">
          <p className="mb-4 max-w-[68ch] text-[0.85rem] text-ash">Remova só conteúdo impróprio (outra pessoa identificável, conteúdo inadequado, dados pessoais à mostra). A família recebe o motivo.</p>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[...bundle.photos, ...bundle.videos].map((m) => (
              <li key={m.id} className="space-y-3 border border-white/[0.08] p-3" data-testid="midia">
                {m.kind === "photo"
                  ? <FramedPhoto src={urls[m.storage_path!]} x={m.focal_x} y={m.focal_y} zoom={m.zoom} className="aspect-[4/5]" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={youtubeThumb(m.external_id!)} alt="" className="aspect-video w-full bg-pitch object-cover" />}
                <p className="text-[0.8rem] text-ash">{m.kind === "photo" ? `Foto${m.is_primary ? " principal" : ""}` : `Vídeo · ${m.title ?? m.external_id}`}</p>
                <ActionForm action={removeMedia.bind(null, lang, m.id)} note="Motivo da remoção" noteRequired buttons={[{ label: "Remover", tone: "danger" }]} />
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid gap-10 md:grid-cols-2">
          <Section title="Análise por IA" testId="ia-atleta">
            <p className="text-[0.9rem] text-fog">Créditos disponíveis: <span className="text-bone">{ai.allowance}</span> · nenhuma análise incluída no cadastro gratuito. A IA real está desligada.</p>
            <ul className="mt-3 space-y-1 text-[0.85rem] text-fog">
              {ai.requests.map((r) => <li key={r.id}>{fmtDate(r.created_at)} · {aiStatus[r.status] ?? r.status} · US$ {Number(r.cost_usd).toFixed(2)}</li>)}
              {ai.grants.map((g, i) => <li key={i}>{fmtDate(g.created_at)} · cortesia de {g.quantity} — {g.reason}</li>)}
            </ul>
            <div className="mt-4">
              <ActionForm action={grantAi.bind(null, lang, a.id)} number={{ name: "quantity", label: "Quantidade", min: 1, max: 10, defaultValue: 1 }}
                note="Motivo da cortesia" noteRequired buttons={[{ label: "Conceder cortesia" }]} />
            </div>
          </Section>
          <Section title="Histórico">
            <ul className="space-y-1.5 text-[0.85rem] text-fog">
              {history.length === 0 && <li>Sem registros.</li>}
              {history.map((h, i) => {
                const note = (h.meta as { note?: string | null; reason?: string | null } | null);
                return <li key={i}>{fmtDate(h.created_at)} · {auditLabel[h.action] ?? h.action}{h.actor ? ` · ${h.actor}` : ""}{note?.note || note?.reason ? ` — ${note.note ?? note.reason}` : ""}</li>;
              })}
            </ul>
          </Section>
        </div>
      </section>
      <AthleteSheet bundle={bundle} urls={urls} p={p} locale="pt-BR" />
    </>
  );
}
