import { media } from "@/content/media";
import type { Dictionary } from "@/i18n/get-dictionary";
import { MediaSlot } from "./MediaSlot";

/** Três passos com fotografia. No celular, carrossel com snap (gesto nativo). */
export function HowItWorks({ dict }: { dict: Dictionary }) {
  const { how } = dict;
  return (
    <section id="como-funciona" className="relative bg-pitch py-24 md:py-36">
      <h2 data-reveal="lines" className="gutter display text-[clamp(3rem,15vw,10rem)] leading-[0.86]">
        <span className="line-mask"><span>{how.title}</span></span>
      </h2>

      <ol className="mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:none] md:mt-20 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-10 xl:px-16">
        {how.steps.map((step, i) => (
          <li key={step.n} className="group w-[82vw] shrink-0 snap-start md:w-auto">
            <div data-reveal="frame" className="relative aspect-[4/5] overflow-hidden">
              <div className="frame-media absolute inset-0 transition-transform duration-1000 ease-[var(--ease-cine)] group-hover:scale-[1.04]">
                <MediaSlot slot={media.steps[i]} sizes="(min-width: 768px) 33vw, 82vw" />
              </div>
              <span className="display absolute left-4 top-3 text-[5.5rem] leading-none text-bone md:left-6 md:top-4 md:text-[7rem]">{step.n}</span>
            </div>
            <h3 className="display mt-6 text-[2.4rem] leading-[0.9] md:text-[3rem]">{step.title}</h3>
            <p className="mt-3 max-w-[36ch] text-[1.02rem] leading-relaxed text-fog">{step.body}</p>
          </li>
        ))}
      </ol>

      <p className="gutter mt-10 max-w-2xl text-sm leading-relaxed text-white/60">{how.note}</p>
    </section>
  );
}
