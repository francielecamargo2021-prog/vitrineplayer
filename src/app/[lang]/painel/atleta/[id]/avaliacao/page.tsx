import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { getAiState, getAthleteBundle, requireGuardian } from "@/lib/panel/data";
import { deleteAiReport, setAiReportPublished } from "@/lib/panel/ai-actions";
import { AiReport } from "@/components/ai/AiReport";
import { ghostButton, primaryButton, textButton } from "@/components/panel/controls";

/** Relatório da avaliação por IA: o responsável vê primeiro e decide se publica. */
export default async function AiReportPage({ params }: PageProps<"/[lang]/painel/atleta/[id]/avaliacao">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const session = await requireGuardian(lang);
  if (!session) return null;
  const p = await getPanelDictionary(lang);
  const bundle = await getAthleteBundle(session.db, session.user.id, id);
  const { report } = await getAiState(session.db, id);
  if (!report) notFound();
  const t = p.ai.report;
  const published = report.published_at !== null;
  const base = `/${lang}/painel/atleta/${id}`;

  return (
    <main className="gutter mx-auto max-w-5xl pb-24 pt-8 md:pt-12">
      <Link href={base} className="font-display text-[1.6rem] font-black uppercase leading-none text-[#e6e5de] [font-stretch:62%] hover:text-bone">
        {bundle.athlete.sport_name || bundle.athlete.full_name}
      </Link>
      <h1 className="mb-10 mt-3 font-display text-[clamp(2.6rem,10vw,5rem)] font-black uppercase leading-[0.84] [font-stretch:62%]">{t.title}</h1>
      <AiReport
        report={report} t={t} lang={lang} positionLabel={p.positions[report.position]}
        controls={
          <section className="space-y-5 border-t border-white/12 pt-6">
            <p className={`border-l-2 pl-4 ${published ? "border-grass text-bone" : "border-white/30 text-fog"}`}>{published ? t.published : t.unpublished}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <form action={setAiReportPublished.bind(null, lang, id, report.id, !published)}>
                <button className={published ? `${ghostButton} w-full sm:w-auto` : `${primaryButton} w-full sm:w-auto sm:min-w-[16rem]`}>{published ? t.unpublish : t.publish}</button>
              </form>
              <form action={deleteAiReport.bind(null, lang, id, report.id)} className="sm:ml-auto">
                <button className={textButton}>{t.delete}</button>
              </form>
            </div>
            <p className="text-[0.8rem] leading-snug text-ash">{t.deleteNote}</p>
          </section>
        }
      />
    </main>
  );
}
