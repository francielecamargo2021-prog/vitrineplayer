import type { CSSProperties } from "react";
import { media } from "@/content/media";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/Button";
import { MediaSlot } from "./MediaSlot";

/**
 * Seção D — Para profissionais. Os mesmos públicos e o mesmo processo de verificação,
 * em cards sobre uma cena escurecida; o acesso privado à base continua explícito.
 */
export function Professionals({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { pros } = dict;
  const k = dict.home.pros;
  return (
    <section id="profissionais" className="gutter relative isolate overflow-hidden bg-ink py-20 md:py-28">
      <div aria-hidden className="absolute inset-0 -z-10">
        <div data-parallax="0.05" className="absolute inset-[-6%]">
          <MediaSlot slot={media.pros} sizes="100vw" />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(8,13,10,0.78),rgba(8,13,10,0.94)_45%,#080d0a)]" />
      </div>

      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 md:grid-cols-12 md:items-end">
          <div className="md:col-span-7">
            <p className="t-kicker">{k.kicker}</p>
            <h2 data-reveal="lines" className="t-display t-h2 mt-5">
              {pros.title.map((line, i) => (
                <span key={line} className="line-mask" style={{ "--d": i * 150 } as CSSProperties}><span>{line}</span></span>
              ))}
            </h2>
          </div>
          <p className="t-body max-w-[46ch] md:col-span-5">{pros.body}</p>
        </div>

        <ul className="mt-12 grid gap-3 sm:grid-cols-2 md:mt-16 lg:grid-cols-5">
          {pros.audiences.map((a, i) => (
            <li
              key={a.name}
              data-reveal="up"
              style={{ "--d": i * 90 } as CSSProperties}
              className="lift group relative flex items-center gap-4 border border-white/12 bg-ink/55 px-5 py-4 backdrop-blur-sm sm:min-h-[8.5rem] sm:flex-col sm:items-start sm:justify-between sm:gap-0 sm:py-5"
            >
              <span aria-hidden className="block h-8 w-0.5 shrink-0 bg-grass transition-all duration-700 ease-[var(--ease-cine)] sm:h-0.5 sm:w-8 sm:group-hover:w-14" />
              <div>
                <p className="t-display text-[1.65rem] leading-[0.95] [overflow-wrap:anywhere]">{a.name}</p>
                <p className="mt-2 text-[0.88rem] leading-snug text-bone/65">{a.detail}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-14 grid gap-10 border-t border-white/12 pt-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="t-kicker !text-bone/60">{k.access}</p>
            <ol className="mt-5 grid gap-4 sm:grid-cols-3">
              {k.steps.map((s, i) => (
                <li key={s} data-reveal="up" style={{ "--d": i * 120 } as CSSProperties} className="flex gap-3 sm:block">
                  <span className="t-display text-[1.6rem] leading-none text-grass">{String(i + 1).padStart(2, "0")}</span>
                  <p className="text-[0.95rem] leading-snug text-bone/80 sm:mt-2">{s}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-4 lg:col-span-5 lg:items-start">
            <Button href={`/${lang}/profissional`} className="h-14 w-full sm:w-auto">{pros.cta}</Button>
            <p className="max-w-[42ch] text-[0.88rem] leading-relaxed text-bone/60">{pros.note}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
