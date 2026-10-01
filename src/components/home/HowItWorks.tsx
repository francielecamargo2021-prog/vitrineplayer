import type { CSSProperties } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { SectionIndex } from "@/components/ui/SectionIndex";

export function HowItWorks({ dict }: { dict: Dictionary }) {
  const { how } = dict;
  return (
    <section id="como-funciona" className="gutter relative border-t border-white/[0.07] bg-night py-28 md:py-40">
      <SectionIndex>{how.index}</SectionIndex>
      <h2 data-reveal className="display mt-10 max-w-[14ch] text-[clamp(2.2rem,6vw,5.5rem)]">{how.title}</h2>

      <ol className="mt-16 grid gap-px bg-white/[0.07] md:mt-24 md:grid-cols-3">
        {how.steps.map((step, i) => (
          <li
            key={step.n}
            data-reveal
            style={{ "--d": i * 150 } as CSSProperties}
            className="group relative flex min-h-[22rem] flex-col justify-between overflow-hidden bg-night p-7 transition-colors duration-700 hover:bg-graphite md:min-h-[30rem] md:p-10"
          >
            <span
              aria-hidden
              className="display text-[clamp(6rem,14vw,12rem)] text-transparent transition-colors duration-700 [-webkit-text-stroke:1px_rgba(238,235,229,0.25)] group-hover:text-signal group-hover:[-webkit-text-stroke-color:transparent]"
            >
              {step.n}
            </span>
            <div>
              <span aria-hidden className="mb-6 block h-px w-12 bg-signal transition-[width] duration-700 ease-[var(--ease-cine)] group-hover:w-full" />
              <h3 className="display text-3xl md:text-4xl">{step.title}</h3>
              <p className="mt-4 max-w-[34ch] leading-relaxed text-fog">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p data-reveal="fade" className="eyebrow mt-10 max-w-xl leading-relaxed normal-case tracking-[0.08em]">
        {how.note}
      </p>
    </section>
  );
}
