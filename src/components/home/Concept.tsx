import type { CSSProperties } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { SectionIndex } from "@/components/ui/SectionIndex";

/** Manifesto: três linhas oversized, texto que acende no scroll e números grandes. */
export function Concept({ dict }: { dict: Dictionary }) {
  const { concept } = dict;
  return (
    <section id="conceito" className="gutter relative py-28 md:py-48">
      <SectionIndex>{concept.index}</SectionIndex>

      <h2 data-reveal="lines" className="mt-14 md:mt-20">
        {concept.lines.map((line, i) => (
          <span key={line} className="line-mask" style={{ "--d": i * 160 } as CSSProperties}>
            <span
              className={
                i === 1
                  ? "serif-accent text-[clamp(3rem,13vw,10rem)] leading-[0.92] text-fog"
                  : "display text-[clamp(2.3rem,10.5vw,8rem)] [font-stretch:100%] md:text-[clamp(2rem,6.4vw,7rem)] md:[font-stretch:125%]"
              }
            >
              {line}
            </span>
          </span>
        ))}
      </h2>

      <div className="mt-20 grid gap-12 md:mt-32 lg:grid-cols-12">
        <p data-words className="text-[clamp(1.5rem,5.6vw,3.1rem)] font-medium leading-[1.12] tracking-[-0.02em] lg:col-span-9 lg:col-start-4">
          {concept.body.split(" ").map((w, i) => (
            <span key={i} className="w">{w} </span>
          ))}
        </p>
        <p data-reveal className="flex items-start gap-3 font-mono text-xs uppercase leading-relaxed tracking-[0.14em] text-fog lg:col-span-6 lg:col-start-4">
          <LockIcon className="mt-0.5 size-4 shrink-0 text-signal" />
          {concept.privacy}
        </p>
      </div>

      <div className="mt-24 grid grid-cols-2 gap-x-6 gap-y-14 md:mt-36 md:grid-cols-4">
        {concept.stats.map((s, i) => (
          <div key={s.label} data-reveal style={{ "--d": i * 120 } as CSSProperties}>
            <p className="display text-[clamp(3.4rem,14vw,9rem)] leading-[0.8] tabular-nums [font-stretch:100%] md:text-[clamp(4rem,6.5vw,9rem)]">
              <span data-count={s.value}>{s.value}</span>
              <span className="text-fog">{s.suffix}</span>
            </p>
            <p className="eyebrow mt-5 border-t border-white/15 pt-4">{s.label}</p>
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
