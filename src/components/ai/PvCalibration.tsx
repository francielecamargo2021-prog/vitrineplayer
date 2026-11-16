"use client";

import { useState, useTransition, type MouseEvent } from "react";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import { submitPvCalibration } from "@/lib/panel/pv-actions";
import { MIN_POINTS, type Landmark, type MarkedPoint, type SubmitResult } from "@/lib/pitchvision/calibration";
import { ghostButton, primaryButton, textButton } from "@/components/panel/controls";

type T = PanelDictionary["pv"]["calibration"];

/**
 * Marcação do campo (opcional) no quadro do jogo: o responsável escolhe um ponto do campo (lista ou desenho) e toca
 * o mesmo ponto na imagem. Desfazer, recomeçar e trocar de imagem. A PitchVision confere e recusa marcação incoerente.
 * Alvos de toque com 44 px ou mais; o desenho é só um guia (linhas finas, sem simular estádio).
 */
export function PvCalibration({ lang, athleteId, requestId, available, diagram, pitch, times, current, t }: {
  lang: string; athleteId: string; requestId: string; available: Landmark[];
  diagram: Partial<Record<Landmark, { x: number; y: number }>>; pitch: { length_m: number; width_m: number };
  times: number[]; current: { method: string; points: number; error_m: number | null } | null; t: T;
}) {
  const [timeIdx, setTimeIdx] = useState(0);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [points, setPoints] = useState<MarkedPoint[]>([]);
  const [selected, setSelected] = useState<Landmark | null>(available[0] ?? null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pending, start] = useTransition();
  const marked = new Set(points.map((p) => p.landmark));
  const nextFree = (after: MarkedPoint[]) => available.find((k) => !after.some((p) => p.landmark === k)) ?? null;

  const tap = (e: MouseEvent<HTMLButtonElement>) => {
    if (!size || !selected) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * size.w;
    const y = ((e.clientY - r.top) / r.height) * size.h;
    const after = [...points.filter((p) => p.landmark !== selected), { landmark: selected, x: Math.round(x), y: Math.round(y) }];
    setPoints(after);
    setSelected(nextFree(after));
    setResult(null);
  };
  const undo = () => {
    const after = points.slice(0, -1);
    setSelected(points.at(-1)?.landmark ?? selected);
    setPoints(after);
    setResult(null);
  };
  const changeFrame = () => {
    setTimeIdx((i) => (i + 1) % times.length);
    setPoints([]);
    setSize(null);
    setSelected(available[0] ?? null);
    setResult(null);
  };
  const save = () => start(async () => {
    if (!size) return setResult({ ok: false, error: "frame" });
    setResult(await submitPvCalibration(lang, athleteId, requestId, points, { t: times[timeIdx], width: size.w, height: size.h }));
  });
  const done = result?.ok ? result : null;
  const error = result && !result.ok ? t.errors[result.error] ?? t.errors.generic : null;
  const L = pitch.length_m, W = pitch.width_m;
  const big = L >= 90;

  return (
    <section className="space-y-6 border-l-2 border-white/30 pl-4" data-testid="pv-calibration">
      <div className="space-y-3">
        <h3 className="font-display text-[1.8rem] font-extrabold uppercase leading-none [font-stretch:62%]">{t.title}</h3>
        <p className="max-w-[62ch] text-[0.95rem] leading-relaxed text-fog">{t.body}</p>
        {current && !done && <p className="text-[0.9rem] text-bone">{t.already}</p>}
        <ol className="list-decimal space-y-1 pl-5 text-[0.9rem] text-fog">
          {t.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="space-y-3">
          <p className="text-[0.95rem] text-bone" aria-live="polite">
            {selected ? <>{t.next}: <strong>{t.landmarks[selected] ?? selected}</strong></> : `${points.length} ${t.marked}`}
          </p>
          <button type="button" onClick={tap} aria-label={t.frameAlt}
            className="relative block w-full cursor-crosshair touch-manipulation bg-white/5 focus-visible:outline-2 focus-visible:outline-bone">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={times[timeIdx]} src={`/api/pitchvision/${requestId}/quadro/${times[timeIdx]}`} alt="" draggable={false}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="block h-auto w-full select-none" />
            {size && points.map((p, i) => (
              <span key={p.landmark} aria-hidden
                className={`pointer-events-none absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[0.7rem] font-bold ${p.landmark === selected ? "border-bone bg-ink text-bone" : "border-ink bg-bone text-ink"}`}
                style={{ left: `${(p.x / size.w) * 100}%`, top: `${(p.y / size.h) * 100}%` }}>{i + 1}</span>
            ))}
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={undo} disabled={!points.length || pending} className={`${ghostButton} min-h-11`}>{t.undo}</button>
            <button type="button" onClick={() => { setPoints([]); setSelected(available[0] ?? null); setResult(null); }}
              disabled={!points.length || pending} className={`${textButton} min-h-11`}>{t.clear}</button>
            {times.length > 1 && <button type="button" onClick={changeFrame} disabled={pending} className={`${textButton} min-h-11`}>{t.otherFrame}</button>}
            <span className="text-[0.85rem] text-ash">{points.length} {t.marked}</span>
          </div>
        </div>

        <div className="space-y-3">
          <svg viewBox={`-3 -3 ${L + 6} ${W + 6}`} className="w-full" role="img" aria-label={t.title}>
            <g fill="none" strokeWidth={0.5} className="stroke-white/45">
              <rect x={0} y={0} width={L} height={W} />
              <line x1={L / 2} y1={0} x2={L / 2} y2={W} />
              {big && <circle cx={L / 2} cy={W / 2} r={9.15} />}
              {big && <rect x={0} y={W / 2 - 20.16} width={16.5} height={40.32} />}
              {big && <rect x={L - 16.5} y={W / 2 - 20.16} width={16.5} height={40.32} />}
            </g>
            {available.map((k) => {
              const d = diagram[k];
              if (!d) return null;
              const on = k === selected, done_ = marked.has(k);
              return (
                <g key={k} onClick={() => setSelected(k)} className="cursor-pointer">
                  <circle cx={d.x * L} cy={d.y * W} r={6} fill="transparent" />
                  <circle cx={d.x * L} cy={d.y * W} r={on ? 2.6 : 1.8} strokeWidth={0.6}
                    className={on ? "fill-bone stroke-bone" : done_ ? "fill-grass stroke-grass" : "fill-ink stroke-white/70"} />
                </g>
              );
            })}
          </svg>
          <ul className="grid gap-2" aria-label={t.title}>
            {available.map((k) => (
              <li key={k}>
                <button type="button" onClick={() => setSelected(k)} aria-pressed={k === selected}
                  className={`flex min-h-11 w-full items-center gap-3 border px-3 text-left text-[0.85rem] transition-colors ${k === selected ? "border-bone text-bone" : marked.has(k) ? "border-grass/60 text-fog" : "border-white/15 text-fog hover:border-white/40"}`}>
                  <span aria-hidden className="w-4 text-center">{marked.has(k) ? "✓" : ""}</span>
                  {t.landmarks[k] ?? k}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-3">
        {error && <p role="alert" className="border-l-2 border-[#e5a3a3] pl-4 text-[#f0c4c4]">{error}</p>}
        {done && (
          <p role="status" className="border-l-2 border-grass pl-4 text-bone">
            {t.done} ({t.quality[done.method] ?? done.method}{done.error_m !== null ? `, ${t.errorM} ${done.error_m.toLocaleString(lang === "es" ? "es" : "pt-BR")} m` : ""})
          </p>
        )}
        <button type="button" onClick={save} disabled={pending || points.length < MIN_POINTS || !size}
          className={`${primaryButton} w-full sm:w-auto sm:min-w-[16rem]`}>{pending ? t.sending : t.submit}</button>
      </div>
    </section>
  );
}
