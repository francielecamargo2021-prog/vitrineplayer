import type { CSSProperties } from "react";
import { media } from "@/content/media";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/Button";
import { MediaSlot } from "./MediaSlot";

/** Área profissional sobre fotografia de arquibancada/observação. */
export function Professionals({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { pros } = dict;
  return (
    <section id="profissionais" className="relative isolate overflow-hidden bg-ink py-24 md:py-40">
      <div aria-hidden className="absolute inset-0 -z-10">
        <MediaSlot slot={media.pros} labelPosition="top" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(5,8,6,0.55),rgba(5,8,6,0.92)_60%)]" />
      </div>

      <div className="gutter">
        <h2 data-reveal="lines" className="display text-[clamp(3.2rem,16vw,11rem)] leading-[0.84]">
          {pros.title.map((line, i) => (
            <span key={line} className="line-mask" style={{ "--d": i * 150 } as CSSProperties}><span>{line}</span></span>
          ))}
        </h2>
        <p className="mt-8 max-w-[44ch] text-[1.05rem] leading-relaxed text-white/85 md:ml-[33%] md:mt-12 md:text-lg">{pros.body}</p>

        <ul className="mt-14 border-t border-white/20 md:ml-[33%] md:mt-20">
          {pros.audiences.map((a) => (
            <li key={a.name} className="group flex items-baseline justify-between gap-6 border-b border-white/20 py-4 md:py-5">
              <span className="display text-[clamp(2.2rem,10vw,4.5rem)] leading-none transition-colors duration-500 group-hover:text-grass">{a.name}</span>
              <span className="hidden text-right text-sm text-white/60 md:block">{a.detail}</span>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex flex-col gap-5 md:ml-[33%] md:flex-row md:items-center md:gap-10">
          <Button href={`/${lang}/profissional`} className="h-16 w-full md:w-auto md:px-10">{pros.cta}</Button>
          <p className="max-w-sm text-sm text-white/60">{pros.note}</p>
        </div>
      </div>
    </section>
  );
}
