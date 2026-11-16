import type { ReactNode } from "react";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import { sendMomentFeedback } from "@/lib/panel/pv-actions";
import { embedUrl } from "@/lib/pitchvision/link";
import { ghostButton, primaryButton } from "@/components/panel/controls";

type Moment = { id: string; t: number; time: string; type: string; team: string | null; player_jersey: number | null; is_target_athlete: boolean; description: string; evidence_level: string };
type Obs = { id: string; t: number; time: string; description: string; evidence_level: string };
export type LinkRep = {
  id: string; summary: string;
  report: { youtube_id?: string; title?: string | null; moments?: Moment[]; observations?: Obs[]; target_athlete_found?: boolean; limitations?: string[] };
};

/**
 * Relatório do modo link: momentos apontados pela IA externa, cada um com o player oficial do YouTube (sem cookies)
 * começando no segundo do lance, o nível de evidência ("IA, não verificado") e os botões certo/errado.
 * Sem contagem, sem nota. O player só carrega quando o momento é aberto.
 */
export function PvLinkReport({ lang, athleteId, report, feedback, t, controls }: {
  lang: string; athleteId: string; report: LinkRep; feedback: Record<string, string>; t: PanelDictionary["pv"]["report"]["link"]; controls?: ReactNode;
}) {
  const r = report.report ?? {};
  const vid = r.youtube_id ?? "";
  const moments = r.moments ?? [];
  const obs = r.observations ?? [];
  const item = (m: Moment | Obs, title: string, mine: boolean) => {
    const verdict = feedback[m.id];
    return (
      <li key={m.id} className="border-l-2 border-white/15 pl-4" data-testid="pv-moment">
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="font-display text-[1.4rem] font-extrabold leading-none [font-stretch:62%] tabular-nums">{m.time}</span>
            <span className="text-bone">{title}{mine ? ` · ${t.athlete}` : ""}</span>
            <span className="border border-white/25 px-2 py-0.5 text-[0.72rem] text-fog">{t.level[m.evidence_level] ?? t.level.ai_unverified}</span>
            <span className="ml-auto text-[0.85rem] text-fog underline underline-offset-4 group-open:hidden">{t.watch}</span>
          </summary>
          <div className="space-y-4 pb-4">
            <div className="aspect-video w-full bg-white/5">
              <iframe src={embedUrl(vid, m.t)} title={`${t.player} ${m.time}`} loading="lazy" className="size-full"
                allow="encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation" />
            </div>
          </div>
        </details>
        <p className="max-w-[65ch] text-[0.95rem] leading-relaxed text-fog">{m.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 pb-3">
          {(["correct", "incorrect"] as const).map((v) => (
            <form key={v} action={sendMomentFeedback.bind(null, lang, athleteId, report.id, m.id, v)}>
              <button aria-pressed={verdict === v} className={`${verdict === v ? primaryButton : ghostButton} min-h-11 min-w-[7rem]`}>
                {v === "correct" ? t.correct : t.incorrect}
              </button>
            </form>
          ))}
          {verdict && <span className="text-[0.8rem] text-ash">{t.yourAnswer}: {verdict === "correct" ? t.correct : t.incorrect}</span>}
        </div>
      </li>
    );
  };
  return (
    <article className="space-y-12" data-testid="pv-link-report">
      <p className="max-w-[70ch] border-l-2 border-[#e5c07b] pl-4 text-[0.9rem] leading-relaxed text-fog">{t.notice}</p>
      <p className="max-w-[70ch] text-[1.1rem] leading-relaxed text-bone">{report.summary}</p>
      {r.target_athlete_found === false && <p className="text-[0.9rem] text-ash">{t.notFound}</p>}
      <section className="space-y-4">
        <h2 className="font-display text-[1.8rem] font-extrabold uppercase leading-none [font-stretch:62%]">{t.moments}</h2>
        {moments.length === 0 ? <p className="text-ash">{t.empty}</p> : (
          <ol className="space-y-4">{moments.map((m) => item(m, t.types[m.type] ?? m.type, m.is_target_athlete))}</ol>
        )}
      </section>
      {obs.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-[1.6rem] font-extrabold uppercase leading-none text-fog [font-stretch:62%]">{t.observations}</h2>
          <ol className="space-y-4">{obs.map((o) => item(o, "", false))}</ol>
        </section>
      )}
      {(r.limitations ?? []).length > 0 && (
        <ul className="max-w-[70ch] list-disc space-y-1 pl-5 text-[0.85rem] text-ash">
          {(r.limitations ?? []).map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
      {controls}
    </article>
  );
}
