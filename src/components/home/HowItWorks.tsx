import type { CSSProperties } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";

/**
 * Seção B — Como funciona. Os três passos de sempre (mesmos textos e regras), em cards
 * com numeração esportiva e uma barra de progresso como grafismo de transmissão.
 */
export function HowItWorks({ dict }: { dict: Dictionary }) {
  const { how } = dict;
  const k = dict.home.how;
  return (
    <section id="como-funciona" className="gutter relative overflow-hidden bg-pitch py-20 md:py-28">
      <div aria-hidden className="pitch-lines pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <p className="t-kicker">{k.kicker}</p>
            <h2 data-reveal="lines" className="t-display t-h2 mt-5">
              <span className="line-mask"><span>{k.title}</span></span>
            </h2>
          </div>
          <p className="t-body max-w-[44ch] md:col-span-5">{how.note}</p>
        </div>

        <ol className="mt-12 grid gap-4 md:mt-16 md:grid-cols-3 md:gap-5">
          {how.steps.map((step, i) => (
            <li
              key={step.n}
              data-reveal="up"
              style={{ "--d": i * 140 } as CSSProperties}
              className="lift group relative flex flex-col border border-white/12 bg-ink/35 p-6 backdrop-blur-[2px] md:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="t-display text-[clamp(3.6rem,6vw,5rem)] leading-[0.85] text-transparent [-webkit-text-stroke:1.5px_var(--color-grass)]">{step.n}</span>
                <span aria-hidden className="mt-2 flex gap-1">
                  {how.steps.map((_, j) => (
                    <span key={j} className={`h-1 w-6 ${j <= i ? "bg-grass" : "bg-white/15"}`} />
                  ))}
                </span>
              </div>
              <h3 className="t-display t-h3 mt-8">{step.title}</h3>
              <p className="mt-3 text-[0.98rem] leading-relaxed text-bone/75">{step.body}</p>
              <span aria-hidden className="mt-8 block h-px w-full origin-left scale-x-[0.18] bg-grass transition-transform duration-700 ease-[var(--ease-cine)] group-hover:scale-x-100" />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
