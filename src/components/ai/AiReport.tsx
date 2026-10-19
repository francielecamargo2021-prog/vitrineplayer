import type { ReactNode } from "react";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import type { Database } from "@/lib/supabase/database.types";
import { criteria as catalog, type CriterionKey } from "@/lib/ai/rubric";
import type { ReportDocument } from "@/lib/ai/types";

export type AiReportRow = Pick<
  Database["public"]["Tables"]["ai_video_reports"]["Row"],
  "id" | "video_type" | "position" | "category" | "rubric_version" | "model" | "overall_score" | "coverage" | "confidence" | "summary" | "strengths" | "development" | "decision_notes" | "positioning_notes" | "published_at" | "created_at"
> & { report: unknown };

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Relatório técnico preliminar. Mesmo componente para o responsável (com
 * controles de publicação em `controls`) e para profissionais autorizados.
 * Sempre exibe: base do vídeo (melhores momentos × partida), cobertura,
 * confiança e o aviso de indicador preliminar.
 */
export function AiReport({
  report, t, positionLabel, lang, controls, demo = false,
}: {
  report: AiReportRow; t: PanelDictionary["ai"]["report"]; positionLabel: string; lang: "pt" | "es"; controls?: ReactNode; demo?: boolean;
}) {
  const doc = report.report as ReportDocument;
  const type = report.video_type as keyof typeof t.basedOn;
  const yt = doc.video.youtube_id;
  const fmt = new Intl.NumberFormat(lang === "es" ? "es" : "pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const date = new Intl.DateTimeFormat(lang === "es" ? "es" : "pt-BR", { dateStyle: "medium" }).format(new Date(report.created_at));
  const conf = t.confidenceLevels[report.confidence as keyof typeof t.confidenceLevels];

  return (
    <article className="space-y-12">
      <header className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-bone px-3 py-1.5 font-display text-[1rem] font-extrabold uppercase leading-none text-ink [font-stretch:62%]">{t.basedOn[type]}</span>
          <span className="text-[0.9rem] text-fog">{positionLabel}{report.category ? ` · ${report.category}` : ""}</span>
          {demo && <span className="border border-white/20 px-2.5 py-1 text-[0.75rem] text-ash">{t.demo}</span>}
        </div>
        <p className="max-w-[64ch] border-l-2 border-grass pl-4 text-[0.95rem] leading-relaxed text-fog">{t.preliminary}</p>
        <p className="max-w-[64ch] text-[0.85rem] leading-relaxed text-ash">{t.basedOnNote[type]}</p>
      </header>

      {/* Indicadores: nota geral + cobertura + confiança */}
      <section className="grid gap-px border-y border-white/12 bg-white/12 sm:grid-cols-3">
        <div className="bg-ink py-6 sm:pr-6">
          <p className="eyebrow text-ash">{t.overall}</p>
          {report.overall_score !== null ? (
            <p className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-[4.5rem] font-black leading-[0.8] [font-stretch:62%]">{fmt.format(Number(report.overall_score))}</span>
              <span className="text-fog">{t.outOf}</span>
            </p>
          ) : (
            <p className="mt-3 max-w-[30ch] text-[0.9rem] leading-snug text-fog">{t.noOverall}</p>
          )}
        </div>
        <div className="bg-ink py-6 sm:px-6">
          <p className="eyebrow text-ash">{t.coverage}</p>
          <p className="mt-2 font-display text-[3rem] font-black leading-[0.85] [font-stretch:62%]">{Math.round(Number(report.coverage) * 100)}%</p>
          <p className="mt-2 text-[0.82rem] leading-snug text-ash">{t.coverageHint}</p>
        </div>
        <div className="bg-ink py-6 sm:pl-6">
          <p className="eyebrow text-ash">{t.confidence}</p>
          <p className="mt-2 font-display text-[3rem] font-black uppercase leading-[0.85] [font-stretch:62%]">{conf}</p>
          <p className="mt-2 text-[0.82rem] leading-snug text-ash">{t.categoryNote}</p>
        </div>
      </section>

      {/* Fundamentos */}
      <section>
        <h3 className="font-display text-[1.8rem] font-extrabold uppercase leading-none [font-stretch:62%]">{t.criteria}</h3>
        <ul className="mt-5 border-t border-white/12">
          {doc.criteria.map((c) => (
            <li key={c.key} className="border-b border-white/12 py-4">
              <div className="flex items-center justify-between gap-4">
                <span className={c.counted ? "text-bone" : "text-ash"}>{catalog[c.key as CriterionKey]?.label[lang] ?? c.key}</span>
                {c.counted && c.score ? (
                  <span className="flex items-center gap-3" aria-label={`${c.score} ${t.outOf}`}>
                    <span aria-hidden className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} className={`h-2 w-5 ${n <= c.score! ? "bg-bone" : "bg-white/12"}`} />
                      ))}
                    </span>
                    <span className="w-6 pr-0.5 text-right font-display text-[1.3rem] font-black leading-none [font-stretch:62%]">{c.score}</span>
                  </span>
                ) : (
                  <span className="text-[0.85rem] text-ash">{t.notObserved}</span>
                )}
              </div>
              {c.counted && (c.comment || c.evidence.length > 0) && (
                <div className="mt-2 space-y-1.5 text-[0.85rem] leading-snug text-fog">
                  {c.comment && <p>{c.comment}</p>}
                  <p className="flex flex-wrap gap-x-4 gap-y-1">
                    {c.evidence.slice(0, 4).map((e) => (
                      <a key={`${c.key}-${e.s}`} href={`https://www.youtube.com/watch?v=${yt}&t=${e.s}s`} target="_blank" rel="noopener noreferrer" className="text-ash underline-offset-4 hover:text-bone hover:underline">
                        <span className="font-mono text-[0.78rem] text-grass">{mmss(e.s)}</span> {e.note}
                      </a>
                    ))}
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-10 md:grid-cols-2">
        {[[t.strengths, report.strengths], [t.development, report.development]].map(([title, items]) => (
          <div key={title as string}>
            <h3 className="font-display text-[1.5rem] font-extrabold uppercase leading-none [font-stretch:62%]">{title as string}</h3>
            <ul className="mt-4 space-y-2.5">
              {(items as string[]).map((x) => (
                <li key={x} className="flex gap-3 leading-snug text-fog"><span aria-hidden className="mt-2 h-px w-3 shrink-0 bg-grass" />{x}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {(report.decision_notes || report.positioning_notes) && (
        <section className="grid gap-10 md:grid-cols-2">
          {report.decision_notes && <Note title={t.decision} text={report.decision_notes} />}
          {report.positioning_notes && <Note title={t.positioning} text={report.positioning_notes} />}
        </section>
      )}

      <section className="bg-pitch p-6 md:p-8">
        <h3 className="font-display text-[1.5rem] font-extrabold uppercase leading-none [font-stretch:62%]">{t.summary}</h3>
        <p className="mt-4 max-w-[70ch] text-[1.05rem] leading-relaxed text-bone">{report.summary}</p>
        <a href={`https://www.youtube.com/watch?v=${yt}`} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex h-12 items-center border border-white/30 px-5 text-[0.9rem] font-medium text-bone transition-colors hover:border-bone">
          {t.watch}
        </a>
      </section>

      {controls}

      <footer className="border-t border-white/12 pt-4 text-[0.78rem] leading-relaxed text-ash">
        {t.method}: {report.rubric_version} · {report.model} · {date}
      </footer>
    </article>
  );
}

function Note({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="font-display text-[1.5rem] font-extrabold uppercase leading-none [font-stretch:62%]">{title}</h3>
      <p className="mt-4 leading-relaxed text-fog">{text}</p>
    </div>
  );
}
