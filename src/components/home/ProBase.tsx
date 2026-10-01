import type { CSSProperties } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { AthletePortrait, portraitHues } from "@/components/athlete/AthletePortrait";
import { proResults } from "@/mocks/athletes";
import { LockIcon } from "./Concept";

export function ProBase({ dict }: { dict: Dictionary }) {
  const { base } = dict;
  return (
    <section className="relative overflow-hidden border-y border-white/[0.07] bg-night py-28 md:py-40">
      <div aria-hidden className="absolute -right-[20vw] top-0 size-[60vw] rounded-full bg-[radial-gradient(circle,rgba(255,91,35,0.10),transparent_65%)]" />
      <div className="gutter relative">
        <h2>
          {base.title.map((line, i) => (
            <span key={line} data-reveal="lines" className="block">
              <span className="line-mask" style={{ "--d": i * 160 } as CSSProperties}>
                <span className="display block text-[clamp(1.9rem,8vw,7rem)] [font-stretch:100%] md:[font-stretch:125%]">
                  {line}
                </span>
              </span>
            </span>
          ))}
        </h2>
        <p data-reveal className="mt-8 max-w-md leading-relaxed text-fog">{base.body}</p>

        {/* Interface de pesquisa — demonstrativa e bloqueada */}
        <div data-reveal className="relative mt-16 border border-white/10 bg-ink/80 md:mt-24">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 md:px-8">
            <p className="eyebrow flex items-center gap-3">
              <span className="size-1.5 rounded-full bg-signal" />
              {base.searchLabel}
            </p>
            <p className="eyebrow">{base.demo}</p>
          </div>
          <ul className="flex flex-wrap gap-2 border-b border-white/10 px-5 py-5 md:px-8">
            {base.filters.map((f, i) => (
              <li
                key={f}
                data-reveal
                style={{ "--d": 200 + i * 90 } as CSSProperties}
                className="flex items-center gap-2 border border-signal/40 bg-signal/10 px-3 py-2 font-mono text-[0.7rem] uppercase tracking-[0.14em] text-bone"
              >
                {f}
                <span aria-hidden className="text-signal">×</span>
              </li>
            ))}
          </ul>

          <div className="relative p-5 md:p-8">
            <p className="eyebrow mb-6"><span data-count="128">128</span> {base.results}</p>
            <ul aria-hidden className="grid grid-cols-2 gap-3 select-none md:grid-cols-4 md:gap-4">
              {proResults.slice(0, 8).map((r, i) => (
                <li key={r.id} className={`overflow-hidden border border-white/[0.08] bg-graphite ${i > 3 ? "hidden md:block" : ""}`}>
                  <AthletePortrait hue={portraitHues[i % portraitHues.length]} showNumber={false} className="aspect-[4/5] blur-[2px]" />
                  <div className="space-y-2 p-3 blur-[5px]">
                    <p className="text-sm font-semibold">{r.name}</p>
                    <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-ash">{r.year} · {r.position}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(60%_60%_at_50%_50%,rgba(7,7,8,0.82),rgba(7,7,8,0.35))]">
              <div className="flex max-w-xs flex-col items-center gap-4 px-6 text-center">
                <span className="grid size-14 place-items-center border border-white/20 bg-ink/70 backdrop-blur">
                  <LockIcon className="size-5 text-signal" />
                </span>
                <p className="display text-xl md:text-2xl">{base.locked}</p>
                <p className="eyebrow">{base.lockedSub}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
