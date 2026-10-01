import type { CSSProperties } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { SectionIndex } from "@/components/ui/SectionIndex";

/** Passos em linhas editoriais (sem cards): número gigante + título + texto. */
export function HowItWorks({ dict }: { dict: Dictionary }) {
  const { how } = dict;
  return (
    <section id="como-funciona" className="gutter relative py-28 md:py-44">
      <SectionIndex>{how.index}</SectionIndex>
      <h2 data-reveal className="display mt-10 max-w-[14ch] text-[clamp(2.2rem,9vw,6rem)] [font-stretch:100%] md:[font-stretch:125%]">
        {how.title}
      </h2>

      <ol className="mt-16 md:mt-28">
        {how.steps.map((step, i) => (
          <li
            key={step.n}
            data-reveal
            style={{ "--d": i * 120 } as CSSProperties}
            className="group grid gap-6 border-t border-white/12 py-10 md:grid-cols-12 md:items-end md:py-14"
          >
            <span
              aria-hidden
              className="display text-[clamp(6.5rem,32vw,15rem)] leading-[0.78] text-transparent transition-colors duration-700 [-webkit-text-stroke:1px_rgba(238,235,229,0.3)] group-hover:text-signal group-hover:[-webkit-text-stroke-color:transparent] md:col-span-5"
            >
              {step.n}
            </span>
            <div className="md:col-span-6 md:col-start-7">
              <h3 className="display text-[clamp(1.9rem,7vw,3.5rem)]">{step.title}</h3>
              <p className="mt-5 max-w-[38ch] text-lg leading-relaxed text-fog">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p data-reveal="fade" className="mt-6 max-w-xl border-t border-white/12 pt-8 text-sm leading-relaxed text-ash">
        {how.note}
      </p>
    </section>
  );
}
