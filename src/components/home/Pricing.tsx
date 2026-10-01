import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/Button";

/** Preço em verde de campo: número gigante, uma frase, um CTA e o aviso legal. */
export function Pricing({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const p = dict.pricing;
  return (
    <section id="cadastro" data-cta-hide className="gutter relative bg-turf py-24 md:py-40">
      <p className="text-lg font-medium text-white/85">{p.eyebrow}</p>
      <p data-reveal="lines" className="display mt-4 text-[clamp(6rem,38vw,24rem)] leading-[0.8]">
        <span className="line-mask">
          <span className="flex items-start">
            <span className="mr-[0.06em] mt-[0.1em] text-[0.22em]">{p.currency}</span>
            {p.amount}
            <span className="text-[0.4em] leading-[1.1]">{p.cents}</span>
          </span>
        </span>
      </p>
      <p className="display mt-2 text-[clamp(2.4rem,11vw,6rem)] leading-[0.9]">{p.period}</p>

      <div className="mt-12 grid gap-10 md:mt-20 lg:grid-cols-12">
        <ul className="border-t border-white/25 lg:col-span-6">
          {p.includes.map((item) => (
            <li key={item} className="border-b border-white/25 py-3.5 text-[1.02rem]">{item}</li>
          ))}
        </ul>
        <div className="flex flex-col justify-between gap-8 lg:col-span-5 lg:col-start-8">
          <p className="text-white/85">{p.noFee}</p>
          <Button href={`/${lang}/cadastro`} className="h-16 w-full text-[1.05rem]">{p.cta}</Button>
          <p className="text-sm leading-relaxed text-white/70">{p.disclaimer}</p>
        </div>
      </div>
    </section>
  );
}
