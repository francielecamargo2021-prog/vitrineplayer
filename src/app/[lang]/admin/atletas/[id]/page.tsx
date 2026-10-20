import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { getAthleteForReview, requireAdmin } from "@/lib/admin/data";
import { reviewAthlete } from "@/lib/admin/actions";
import { AthleteSheet } from "@/components/panel/AthleteSheet";
import { ReviewForm, type DecisionOption } from "@/components/admin/ReviewForm";
import type { AthleteStatus } from "@/domain/athlete";

const optionsFor: Record<AthleteStatus, DecisionOption[]> = {
  in_review: [
    { value: "approve", label: "Aprovar perfil", needsNote: false, tone: "primary" },
    { value: "reject", label: "Pedir ajustes", needsNote: true, tone: "danger" },
  ],
  approved: [{ value: "suspend", label: "Suspender", needsNote: true, tone: "danger" }],
  suspended: [{ value: "reinstate", label: "Reativar", needsNote: false, tone: "primary" }],
  rejected: [], draft: [], pending_payment: [],
};

const actionLabel: Record<string, string> = {
  "athlete.review.approve": "Aprovado", "athlete.review.reject": "Ajustes pedidos",
  "athlete.review.suspend": "Suspenso", "athlete.review.reinstate": "Reativado",
};

export default async function AdminAthlete({ params }: PageProps<"/[lang]/admin/atletas/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireAdmin(lang);
  if (!session) return null;
  const [p, { bundle, urls, guardian, history }] = await Promise.all([getPanelDictionary("pt"), getAthleteForReview(session.db, id)]);
  const a = bundle.athlete;
  const g = guardian?.profiles;
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

  return (
    <>
      <section className="gutter mx-auto max-w-6xl space-y-8 py-10 md:py-12">
        <Link href={`/${lang}/admin/atletas?situacao=${a.status}`} className="text-[0.875rem] text-fog underline-offset-4 hover:text-bone hover:underline">← Atletas · {p.status[a.status]}</Link>
        <div className="grid gap-10 md:grid-cols-12">
          <div className="space-y-4 md:col-span-5">
            <h1 className="font-display text-[2.4rem] font-black uppercase leading-[0.9] [font-stretch:62%]">Revisão</h1>
            <dl className="space-y-3 text-[0.9rem]">
              <div><dt className="eyebrow text-ash">Situação</dt><dd className="mt-1 text-bone">{p.status[a.status]}</dd></div>
              <div><dt className="eyebrow text-ash">Responsável principal</dt>
                <dd className="mt-1 text-bone">{g ? <>{g.full_name} · {g.email}{g.whatsapp ? ` · ${g.whatsapp}` : ""}</> : "não encontrado"}</dd></div>
              <div><dt className="eyebrow text-ash">Fotos · vídeos</dt><dd className="mt-1 text-bone">{bundle.photos.length} · {bundle.videos.length}</dd></div>
              {a.review_note && <div><dt className="eyebrow text-ash">Último motivo enviado</dt><dd className="mt-1 text-fog">{a.review_note}</dd></div>}
            </dl>
            <p className="text-[0.8rem] leading-relaxed text-ash">O contato do responsável é visível só para administradores e nunca aparece para profissionais.</p>
          </div>
          <div className="space-y-6 md:col-span-7">
            <ReviewForm action={reviewAthlete.bind(null, lang, a.id)} options={optionsFor[a.status]} />
            {history.length > 0 && (
              <div>
                <p className="eyebrow text-ash">Histórico de decisões</p>
                <ul className="mt-2 space-y-1.5 text-[0.85rem] text-fog">
                  {history.map((h, i) => {
                    const note = (h.meta as { note?: string | null } | null)?.note;
                    return <li key={i}>{date.format(new Date(h.created_at))} · {actionLabel[h.action] ?? h.action}{note ? ` — ${note}` : ""}</li>;
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>
      <AthleteSheet bundle={bundle} urls={urls} p={p} locale="pt-BR" />
    </>
  );
}
