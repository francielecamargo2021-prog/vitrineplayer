import Link from "next/link";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import type { PvCandidate } from "@/lib/pitchvision/client";
import { cancelPvAnalysis, confirmAthletePick, removeAnalysisVideo } from "@/lib/panel/pv-actions";
import { ghostButton, primaryButton, textButton } from "@/components/panel/controls";

export type PvRequestRow = { id: string; status: string; pv_stage: string | null; created_at: string };
export type PvVideoRow = { id: string; video_type: string; duration_s: number; size_bytes: number; created_at: string };

const ORDER = ["queued", "receiving_video", "processing_match", "athlete_pick", "athlete_metrics", "completed"] as const;

/** Etapa exibida = estado gravado pelo integrador a partir da PitchVision (nada é estimado aqui). */
export function stageOf(r: PvRequestRow): string {
  if (r.status === "queued") return "queued";
  if (r.status === "completed") return "completed";
  if (r.status === "failed" || r.status === "unidentified") return "failed";
  return r.pv_stage === "sent" ? "receiving_video" : r.pv_stage ?? "queued";
}

export function PvStatus({ request, t }: { request: PvRequestRow; t: PanelDictionary["pv"] }) {
  const current = stageOf(request);
  const failed = current === "failed";
  const idx = ORDER.indexOf(current as (typeof ORDER)[number]);
  return (
    <section className="space-y-4" data-testid="pv-status" data-stage={current}>
      <ol className="space-y-2">
        {ORDER.map((s, i) => {
          const done = !failed && (i < idx || current === "completed");
          const now = !failed && i === idx && current !== "completed";
          return (
            <li key={s} className={`flex items-center gap-3 border-l-2 pl-4 text-[0.95rem] ${done ? "border-grass text-bone" : now ? "border-bone text-bone" : "border-white/15 text-ash"}`}
              aria-current={now ? "step" : undefined}>
              <span className="w-5 text-center" aria-hidden>{done ? "✓" : now ? "•" : ""}</span>
              {t.stages[s]}
            </li>
          );
        })}
        {failed && <li className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{t.stages.failed}</li>}
      </ol>
      <p className="text-[0.85rem] text-ash">{t.stagesNote}</p>
    </section>
  );
}

export function AthletePick({ lang, athleteId, request, candidates, t }: {
  lang: string; athleteId: string; request: PvRequestRow; candidates: PvCandidate[] | null; t: PanelDictionary["pv"]["pick"];
}) {
  return (
    <section className="space-y-5" data-testid="pv-pick">
      <h3 className="font-display text-[1.8rem] font-extrabold uppercase leading-none [font-stretch:62%]">{t.title}</h3>
      <p className="max-w-[60ch] text-fog">{t.body}</p>
      {candidates === null ? (
        <p className="text-ash">{t.unavailable}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {candidates.map((c) => (
            <li key={c.track_id} className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/pitchvision/${request.id}/candidato/${c.track_id}`} alt="" loading="lazy" className="aspect-[3/4] w-full bg-white/5 object-contain" />
              <p className="text-[0.8rem] text-ash">{Math.round(c.seconds)} {t.seconds}{c.jersey_votes > 0 ? ` · ${t.jersey}` : ""}</p>
              <form action={confirmAthletePick.bind(null, lang, athleteId, request.id, c.track_id)}>
                <button className={`${primaryButton} w-full`}>{t.choose}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form action={cancelPvAnalysis.bind(null, lang, athleteId, request.id)}>
        <button className={textButton}>{t.none}</button>
      </form>
    </section>
  );
}

export function PvVideoList({ lang, athleteId, videos, t }: { lang: string; athleteId: string; videos: PvVideoRow[]; t: PanelDictionary["pv"]["videos"] }) {
  if (!videos.length) return <p className="text-ash">{t.empty}</p>;
  return (
    <ul className="divide-y divide-white/10 border-y border-white/10" data-testid="pv-videos">
      {videos.map((v) => (
        <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <span className="text-[0.95rem] text-bone">
            {t.types[v.video_type as keyof typeof t.types] ?? v.video_type} · {Math.round(v.duration_s / 60)} {t.minutes} · {new Date(v.created_at).toLocaleDateString(lang === "es" ? "es" : "pt-BR")}
          </span>
          <form action={removeAnalysisVideo.bind(null, lang, athleteId, v.id) as unknown as () => Promise<void>}>
            <button className={textButton}>{t.remove}</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export function PvActions({ base, request, t }: { base: string; request: PvRequestRow; t: PanelDictionary["pv"] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {request.status === "completed" && <Link href={`${base}/avaliacao`} className={primaryButton}>{t.view}</Link>}
      {request.status === "queued" && <span className={`${ghostButton} pointer-events-none opacity-60`}>{t.stages.queued}</span>}
    </div>
  );
}
