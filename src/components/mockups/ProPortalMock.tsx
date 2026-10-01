import type { Dictionary } from "@/i18n/get-dictionary";
import { proResults, type ProResult } from "@/mocks/athletes";
import { AthletePortrait, portraitHues } from "@/components/athlete/AthletePortrait";
import { LockIcon } from "@/components/home/Concept";

/**
 * Mockup do portal profissional (visão de um clube/scout aprovado).
 * Estático: valida layout de pesquisa, resultados e painel de avaliação.
 */
export function ProPortalMock({ dict }: { dict: Dictionary }) {
  const p = dict.portal;
  const g = p.filterGroups;
  const selected = proResults[0];

  const filters: [string, string[], number[]][] = [
    [g.year, ["2010", "2011", "2012", "2013"], [1, 2]],
    [g.position, ["Goleiro", "Zagueiro", "Volante", "Meia", "Ponta", "Atacante"], [4, 5]],
    [g.foot, ["Destro", "Canhoto", "Ambos"], [1]],
    [g.country, ["BR", "AR", "PY", "UY"], [0, 1]],
    [g.status, ["Federado", "Não federado"], [0]],
    [g.media, ["Com vídeo", "Com fotos"], [0]],
  ];

  return (
    <div className="grid min-h-[calc(100svh-4rem)] lg:grid-cols-[15rem_1fr_24rem]">
      {/* Navegação */}
      <aside className="hidden border-r border-white/[0.07] p-6 lg:block">
        <p className="eyebrow">{p.title}</p>
        <p className="mt-2 text-sm text-fog">{p.org}</p>
        <ul className="mt-10 space-y-1">
          {p.nav.map((item, i) => (
            <li key={item} className={`border-l-2 px-3 py-2.5 text-sm ${i === 0 ? "border-signal bg-white/[0.04] text-bone" : "border-transparent text-ash hover:text-fog"}`}>
              {item}
            </li>
          ))}
        </ul>
      </aside>

      {/* Pesquisa + resultados */}
      <section className="min-w-0 p-4 md:p-8">
        <div className="flex h-14 items-center gap-3 border border-white/12 bg-graphite px-4">
          <svg viewBox="0 0 16 16" className="size-4 text-ash" fill="none" aria-hidden>
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          <span className="truncate text-sm text-ash">{p.search}</span>
        </div>

        <div className="mt-5 space-y-4 border border-white/[0.07] p-4 md:p-5">
          <p className="eyebrow text-bone">{p.filters}</p>
          {filters.map(([label, opts, active]) => (
            <div key={label} className="flex flex-wrap items-center gap-2">
              <span className="eyebrow w-20 shrink-0">{label}</span>
              {opts.map((o, i) => (
                <span key={o} className={`border px-2.5 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.1em] ${active.includes(i) ? "border-signal/50 bg-signal/10 text-bone" : "border-white/10 text-ash"}`}>
                  {o}
                </span>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm"><span className="font-mono">{proResults.length}</span> <span className="text-fog">{p.results}</span></p>
          <p className="eyebrow">{p.sort} ↓</p>
        </div>

        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {proResults.map((r, i) => (
            <ResultCard key={r.id} r={r} hue={portraitHues[i % portraitHues.length]} active={r.id === selected.id} viewed={i === 2} viewedLabel={p.viewed} />
          ))}
        </ul>
      </section>

      {/* Painel do atleta selecionado */}
      <aside className="border-t border-white/[0.07] bg-night lg:border-l lg:border-t-0">
        <AthletePortrait number="11" className="aspect-[16/11]" />
        <div className="space-y-8 p-6">
          <div>
            <p className="eyebrow text-signal">{selected.position} · {selected.year}</p>
            <h2 className="display mt-2 text-3xl">{selected.name}</h2>
            <p className="mt-2 text-sm text-fog">{selected.club} · {selected.city} · {selected.country}</p>
          </div>

          <div>
            <p className="eyebrow mb-4">{p.evaluation}</p>
            <div className="flex items-center gap-6">
              <Radar values={selected.scores} />
              <ul className="flex-1 space-y-2">
                {p.criteria.map((c, i) => (
                  <li key={c} className="flex items-center gap-3 text-sm">
                    <span className="w-20 text-fog">{c}</span>
                    <span className="h-1 flex-1 bg-white/10"><span className="block h-1 bg-signal" style={{ width: `${selected.scores[i] * 10}%` }} /></span>
                    <span className="w-4 text-right font-mono text-xs">{selected.scores[i]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <p className="eyebrow mb-3">{p.tags}</p>
            <div className="flex flex-wrap gap-2">
              {[...selected.tags, "Canhoto", "+"].map((t) => (
                <span key={t} className="border border-white/15 px-2.5 py-1 text-xs text-fog">{t}</span>
              ))}
            </div>
          </div>

          <div>
            <p className="eyebrow mb-3 flex items-center gap-2"><LockIcon className="size-3" /> {p.notes}</p>
            <div className="min-h-24 border border-white/10 bg-ink/50 p-3 text-sm text-fog">
              Boa tomada de decisão no último terço. Rever jogo completo da Copa Interior.
              <span className="mt-3 block text-xs text-ash">{p.notesPlaceholder}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="h-11 border border-white/15 font-mono text-[0.68rem] uppercase tracking-[0.16em] hover:border-bone">{p.addToList}</button>
            <button type="button" className="h-11 border border-white/15 font-mono text-[0.68rem] uppercase tracking-[0.16em] hover:border-bone">{p.compare}</button>
            <button type="button" className="col-span-2 h-12 bg-bone font-mono text-[0.72rem] uppercase tracking-[0.18em] text-ink transition-colors hover:bg-signal">{p.contact}</button>
          </div>
          <p className="text-xs leading-relaxed text-ash">{p.contactNote}</p>
        </div>
      </aside>
    </div>
  );
}

function ResultCard({ r, hue, active, viewed, viewedLabel }: { r: ProResult; hue: number; active: boolean; viewed: boolean; viewedLabel: string }) {
  return (
    <li className={`group relative overflow-hidden border bg-graphite transition-colors ${active ? "border-signal" : "border-white/[0.08] hover:border-white/30"}`}>
      <div className="overflow-hidden">
        <AthletePortrait hue={hue} showNumber={false} className="aspect-[4/5] transition-transform duration-1000 ease-[var(--ease-cine)] group-hover:scale-105" />
      </div>
      <span className="absolute right-2 top-2 grid size-8 place-items-center border border-white/15 bg-ink/50 backdrop-blur">
        <svg viewBox="0 0 16 16" className={`size-3.5 ${active ? "fill-signal text-signal" : "fill-none text-bone"}`} aria-hidden>
          <path d="M8 14s-5.5-3.3-5.5-7.2A3 3 0 0 1 8 5a3 3 0 0 1 5.5 1.8C13.5 10.7 8 14 8 14z" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </span>
      {viewed && <span className="eyebrow absolute left-2 top-2 bg-ink/70 px-1.5 py-0.5 text-[0.55rem]">{viewedLabel}</span>}
      <div className="p-3">
        <p className="truncate text-sm font-semibold">{r.name}</p>
        <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ash">{r.year} · {r.position}</p>
        <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-ash">{r.foot} · {r.country}{r.video ? " · ▶" : ""}</p>
      </div>
    </li>
  );
}

/** Radar de 5 eixos (0–10) em SVG puro. */
function Radar({ values }: { values: number[] }) {
  const c = 50;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / values.length - Math.PI / 2;
    return `${(c + Math.cos(a) * v * 4.2).toFixed(1)},${(c + Math.sin(a) * v * 4.2).toFixed(1)}`;
  };
  return (
    <svg viewBox="0 0 100 100" className="size-28 shrink-0" aria-hidden>
      {[10, 7, 4].map((r) => (
        <polygon key={r} points={values.map((_, i) => pt(i, r)).join(" ")} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.6" />
      ))}
      <polygon points={values.map((v, i) => pt(i, v)).join(" ")} fill="rgba(255,91,35,0.25)" stroke="var(--color-signal)" strokeWidth="1.2" />
    </svg>
  );
}
