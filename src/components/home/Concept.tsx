import type { CSSProperties } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { SectionIndex } from "@/components/ui/SectionIndex";

const tape = ["Atacante", "2011", "Canhoto", "Meia", "2012", "Zagueiro", "Destro", "Goleiro", "2010", "Lateral", "Volante", "Ponta"];

export function Concept({ dict }: { dict: Dictionary }) {
  const { concept } = dict;
  return (
    <section id="conceito" className="relative overflow-hidden py-28 md:py-44">
      <div className="gutter">
        <SectionIndex>{concept.index}</SectionIndex>

        <div className="mt-14 grid gap-14 md:mt-20 md:grid-cols-12 md:gap-8">
          <h2 data-reveal="lines" className="md:col-span-12">
            {concept.lines.map((line, i) => (
              <span key={line} className="line-mask" style={{ "--d": i * 160 } as CSSProperties}>
                <span
                  className={
                    i === 1
                      ? "serif-accent text-[clamp(2.6rem,8vw,8rem)] leading-[0.95] text-signal"
                      : "display text-[clamp(1.9rem,6.2vw,6.5rem)]"
                  }
                >
                  {line}
                </span>
              </span>
            ))}
          </h2>

          <div className="grid gap-8 md:col-span-12 md:grid-cols-2 md:gap-16 lg:col-span-8 lg:col-start-5">
            <p data-reveal className="text-lg leading-relaxed text-fog" style={{ "--d": 300 } as CSSProperties}>
              {concept.body}
            </p>
            <p data-reveal className="flex items-start gap-3 border-t border-white/10 pt-6 font-mono text-xs uppercase leading-relaxed tracking-[0.14em] text-bone" style={{ "--d": 450 } as CSSProperties}>
              <LockIcon className="mt-0.5 size-4 shrink-0 text-signal" />
              {concept.privacy}
            </p>
          </div>
        </div>
      </div>

      {/* Fita cinética de atributos — o vocabulário da base */}
      <div aria-hidden className="mt-24 select-none overflow-hidden border-y border-white/[0.07] py-6 md:mt-32 md:py-8">
        <div className="flex w-max [animation:marquee_40s_linear_infinite]">
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0">
              {tape.map((t) => (
                <span key={t + k} className="display flex items-center px-6 text-[clamp(2rem,6vw,5rem)] text-transparent [-webkit-text-stroke:1px_rgba(238,235,229,0.22)] md:px-10">
                  {t}
                  <span className="ml-12 inline-block size-2 bg-signal/70 md:ml-20" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="gutter mt-20 grid grid-cols-2 gap-x-6 gap-y-12 md:mt-28 md:grid-cols-4">
        {concept.stats.map((s, i) => (
          <div key={s.label} data-reveal className="border-t border-white/15 pt-6" style={{ "--d": i * 120 } as CSSProperties}>
            <p className="display text-[clamp(2.6rem,5vw,5rem)] tabular-nums">
              <span data-count={s.value}>{s.value}</span>
              <span className="text-signal">{s.suffix}</span>
            </p>
            <p className="eyebrow mt-4">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <rect x="2.5" y="7" width="11" height="7.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
