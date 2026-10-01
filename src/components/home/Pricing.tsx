import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { SectionIndex } from "@/components/ui/SectionIndex";
import { Button } from "@/components/ui/Button";

export function Pricing({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const p = dict.pricing;
  return (
    <section id="cadastro" data-cta-hide className="gutter relative py-28 md:py-44">
      <SectionIndex>{p.index}</SectionIndex>
      <div className="mt-14 grid gap-14 md:mt-20 lg:grid-cols-12 lg:gap-10">
        <div data-reveal className="lg:col-span-7">
          <p className="eyebrow text-bone">{p.eyebrow}</p>
          <p className="display mt-6 flex items-start text-[clamp(5.5rem,30vw,16rem)] leading-[0.8] [font-stretch:100%] md:[font-stretch:125%]">
            <span className="mr-3 mt-[0.12em] font-mono text-[0.16em] font-normal tracking-normal text-ash">{p.currency}</span>
            {p.amount}
            <span className="text-[0.42em] leading-[1.15] text-signal">{p.cents}</span>
          </p>
          <p className="serif-accent mt-6 text-3xl text-fog md:text-4xl">{p.period}</p>
          <p className="mt-4 max-w-md text-fog">{p.noFee}</p>
        </div>

        <div data-reveal className="flex flex-col justify-end lg:col-span-5" style={{ "--d": 200 } as React.CSSProperties}>
          <ul className="border-t border-white/12">
            {p.includes.map((item) => (
              <li key={item} className="flex items-start gap-4 border-b border-white/12 py-4">
                <svg viewBox="0 0 16 16" className="mt-1 size-3.5 shrink-0 text-signal" fill="none" aria-hidden>
                  <path d="M2 8.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" />
                </svg>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Button href={`/${lang}/cadastro`} className="mt-10 w-full">{p.cta}</Button>
        </div>
      </div>

      <p data-reveal="fade" className="mt-10 max-w-3xl border-l-2 border-signal pl-5 text-sm leading-relaxed text-fog">
        {p.disclaimer}
      </p>
    </section>
  );
}
