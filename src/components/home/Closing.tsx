import type { CSSProperties } from "react";
import { media } from "@/content/media";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/Button";
import { MediaSlot } from "./MediaSlot";

/** Seção G — Encerramento emocional sobre uma cena de jogo, com a chamada final. */
export function Closing({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const c = dict.home.closing;
  return (
    <section data-cta-hide className="relative isolate overflow-hidden bg-ink">
      <div data-reveal="frame" className="absolute inset-0 -z-10 overflow-hidden">
        <div className="frame-media absolute inset-0">
          <div data-parallax="0.06" className="absolute inset-[-6%]">
            <MediaSlot slot={media.next} sizes="100vw" />
          </div>
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(to_top,#080d0a_5%,rgba(8,13,10,0.55)_50%,rgba(8,13,10,0.4)),linear-gradient(to_right,rgba(8,13,10,0.6),transparent_70%)]" />
      </div>
      <div className="gutter"><div className="mx-auto flex min-h-[560px] max-w-7xl flex-col justify-end py-16 md:min-h-[80svh] md:py-24">
        <h2 data-reveal="lines" className="t-display text-[clamp(2.8rem,8.5vw,7rem)] leading-[0.92]">
          {c.title.map((line, i) => (
            <span key={line} className={`line-mask ${i === 1 ? "text-grass" : ""}`} style={{ "--d": i * 160 } as CSSProperties}><span>{line}</span></span>
          ))}
        </h2>
        <div className="mt-8 flex flex-col gap-6 border-t border-white/20 pt-6 md:flex-row md:items-center md:justify-between">
          <p className="max-w-[44ch] text-[clamp(1rem,1.3vw,1.15rem)] leading-relaxed text-bone/85">{c.body}</p>
          <Button href={`/${lang}/cadastro`} className="h-14 w-full shrink-0 md:w-auto md:px-10">{c.cta}</Button>
        </div>
      </div></div>
    </section>
  );
}
