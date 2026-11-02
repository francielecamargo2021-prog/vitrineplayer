import type { ReactNode } from "react";
import type { PanelDictionary } from "@/i18n/get-dictionary";

type Rep = {
  id: string; request_id: string; coverage: number; summary: string; positioning_notes: string | null;
  report: {
    validated?: Record<string, number | boolean>; experimental?: Record<string, number | boolean>;
    unavailable?: Record<string, string>; identity?: { origin?: string; declared_jersey_number?: string | null };
    evidence?: { id: string; kind: string }[];
  };
};

const fmtTime = (s: number) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;

/**
 * Relatório PitchVision no perfil: Medido × Experimental × Ainda não medido, sempre separados.
 * Sem nota, sem ranking. Imagens servidas pela VitrinePlayer (rota com permissão do banco).
 */
export function PvReport({ report, t, controls }: { report: Rep; t: PanelDictionary["pv"]["report"]; controls?: ReactNode }) {
  const r = report.report ?? {};
  const v = r.validated ?? {};
  const x = r.experimental ?? {};
  const u = r.unavailable ?? {};
  const label = (k: string) => t.metrics[k] ?? k;
  return (
    <article className="space-y-12" data-testid="pv-report">
      <p className="max-w-[70ch] border-l-2 border-white/30 pl-4 text-[0.9rem] leading-relaxed text-fog">{t.notice}</p>
      <p className="max-w-[70ch] text-[1.1rem] leading-relaxed text-bone">{report.summary}</p>

      <section className="space-y-4">
        <h2 className="font-display text-[1.8rem] font-extrabold uppercase leading-none [font-stretch:62%]">{t.validated}</h2>
        <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {typeof v.observed_seconds === "number" && <Row term={t.observed} value={fmtTime(v.observed_seconds)} />}
          {typeof v.presence_segments === "number" && <Row term={t.segments} value={String(v.presence_segments)} />}
          <Row term={t.coverage} value={`${Math.round(report.coverage * 100)}%`} />
          {v.positions_available === true && <Row term={t.positions} value={t.available} />}
          <Row term={t.identity} value={r.identity?.origin === "auto" ? t.identityAuto : t.identityUser} />
          {r.identity?.declared_jersey_number && <Row term={t.jersey} value={`${r.identity.declared_jersey_number} (${t.jerseyNote})`} />}
        </dl>
      </section>

      {Object.keys(x).length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-[1.6rem] font-extrabold uppercase leading-none text-fog [font-stretch:62%]">{t.experimental}</h2>
          <dl className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
            {Object.entries(x).map(([k, val]) => (
              <Row key={k} term={k === "ball_proximity_candidates" ? t.ballProximity : label(k)} value={String(val)} muted />
            ))}
          </dl>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-display text-[1.6rem] font-extrabold uppercase leading-none text-ash [font-stretch:62%]">{t.unavailable}</h2>
        <ul className="grid gap-x-10 gap-y-2 text-[0.9rem] text-ash sm:grid-cols-2">
          {Object.entries(u).map(([k, why]) => <li key={k}>{label(k)}: {t.reasons[why] ?? why}</li>)}
        </ul>
      </section>

      {(r.evidence ?? []).some((e) => e.kind === "image") && (
        <section className="space-y-4">
          <h2 className="font-display text-[1.6rem] font-extrabold uppercase leading-none [font-stretch:62%]">{t.evidence}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(r.evidence ?? []).filter((e) => e.kind === "image").map((e) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={e.id} src={`/api/pitchvision/${report.request_id}/evidencia/${e.id}`} alt="" loading="lazy" className="w-full bg-white/5 object-contain" />
            ))}
          </div>
        </section>
      )}
      {controls}
    </article>
  );
}

function Row({ term, value, muted }: { term: string; value: string; muted?: boolean }) {
  return (
    <div className="border-l-2 border-white/15 pl-4">
      <dt className="text-[0.8rem] text-ash">{term}</dt>
      <dd className={`text-[1.15rem] ${muted ? "text-fog" : "text-bone"}`}>{value}</dd>
    </div>
  );
}
