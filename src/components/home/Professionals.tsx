import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Arrow, Button } from "@/components/ui/Button";

export function Professionals({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { pros } = dict;
  return (
    <section id="profissionais" className="grain relative overflow-hidden bg-bone py-28 text-ink md:py-40">
      <div className="gutter relative">
        <p data-reveal="fade" className="eyebrow flex items-center gap-4 text-ink/60">
          <span className="h-px w-10 bg-ink/30" aria-hidden />
          {pros.index}
        </p>
        <div className="mt-10 flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <h2 data-reveal className="display max-w-[12ch] text-[clamp(2.4rem,7vw,6.5rem)]">{pros.title}</h2>
          <p data-reveal className="max-w-sm leading-relaxed text-ink/70" style={{ "--d": 150 } as CSSProperties}>{pros.body}</p>
        </div>

        <ul className="mt-16 border-t border-ink/15 md:mt-24">
          {pros.audiences.map((a, i) => (
            <li key={a.name} data-reveal style={{ "--d": i * 80 } as CSSProperties} className="group relative border-b border-ink/15">
              <span aria-hidden className="absolute inset-0 origin-bottom scale-y-0 bg-ink transition-transform duration-700 ease-[var(--ease-cine)] group-hover:scale-y-100" />
              <div className="relative flex items-center justify-between gap-6 py-6 transition-colors duration-500 group-hover:text-bone md:py-8">
                <span className="flex items-baseline gap-5 md:gap-10">
                  <span className="font-mono text-xs text-ink/40 transition-colors group-hover:text-signal">0{i + 1}</span>
                  <span className="display text-[clamp(1.8rem,5vw,4.2rem)] transition-transform duration-700 ease-[var(--ease-cine)] md:group-hover:translate-x-4">{a.name}</span>
                </span>
                <span className="hidden items-center gap-4 font-mono text-xs uppercase tracking-[0.16em] text-ink/50 transition-colors group-hover:text-fog md:flex">
                  {a.detail}
                  <Arrow className="size-4 -translate-x-2 opacity-0 transition-all duration-500 group-hover:translate-x-0 group-hover:text-signal group-hover:opacity-100" />
                </span>
              </div>
            </li>
          ))}
        </ul>

        <div data-reveal className="mt-14 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <Button href={`/${lang}/profissional`} variant="dark">{pros.cta}</Button>
          <p className="max-w-sm text-sm text-ink/60">{pros.note}</p>
        </div>
      </div>
    </section>
  );
}
