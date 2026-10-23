import type { CSSProperties } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/Button";

/**
 * Seção F — Cadastro. Valor e condições EXATAMENTE como no dicionário (hoje: cadastro
 * gratuito, sem mensalidade). Benefícios organizados, avisos legais sempre visíveis.
 */
export function Pricing({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const p = dict.pricing;
  const k = dict.home.pricing;
  return (
    <section id="cadastro" data-cta-hide className="gutter relative overflow-hidden bg-ink py-20 md:py-28">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-12 lg:gap-12">
        {/* Valor */}
        <div data-reveal="up" className="relative overflow-hidden bg-turf p-7 md:p-10 lg:col-span-5">
          <div aria-hidden className="pitch-lines pointer-events-none absolute inset-0 opacity-70" />
          <span aria-hidden className="pitch-circle pointer-events-none absolute -right-24 -top-24 size-72" />
          <div className="relative">
            <p className="t-kicker !text-bone/85">{k.kicker}</p>
            <p className="mt-2 text-[1rem] text-bone/85">{p.eyebrow}</p>
            <p className="t-display mt-6 flex items-start text-[clamp(5rem,12vw,8.5rem)] leading-[0.85]">
              <span className="mr-2 mt-[0.12em] text-[0.28em]">{p.currency}</span>
              {p.amount}
              {p.cents && <span className="text-[0.4em] leading-[1.1]">{p.cents}</span>}
            </p>
            <p className="t-display mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-none">{p.period}</p>
            <p className="mt-6 max-w-[40ch] text-[0.95rem] leading-relaxed text-bone/85">{p.noFee}</p>
            <Button href={`/${lang}/cadastro`} className="mt-8 h-14 w-full text-[1.02rem]">{p.cta}</Button>
          </div>
        </div>

        {/* Benefícios e avisos */}
        <div className="flex flex-col lg:col-span-7">
          <p className="t-kicker">{k.includesTitle}</p>
          <ul className="mt-5 border-t border-white/12">
            {p.includes.map((item, i) => (
              <li key={item} data-reveal="up" style={{ "--d": i * 80 } as CSSProperties} className="flex items-center gap-4 border-b border-white/12 py-4 text-[1.02rem]">
                <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 text-grass"><path d="M2.5 8.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.8" fill="none" /></svg>
                {item}
              </li>
            ))}
          </ul>
          <p role="note" className="mt-8 border-l-2 border-grass pl-4 text-[0.95rem] leading-relaxed text-bone/80">{p.disclaimer}</p>
          <p className="mt-4 text-[0.85rem] leading-relaxed text-bone/55">{dict.how.note}</p>
        </div>
      </div>
    </section>
  );
}
