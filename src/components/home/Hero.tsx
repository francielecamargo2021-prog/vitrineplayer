import type { CSSProperties } from "react";
import { media } from "@/content/media";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/Button";
import { HeroReel } from "./HeroReel";
import { MediaSlot } from "./MediaSlot";

const delay = (ms: number) => ({ "--d": ms }) as CSSProperties;

/**
 * Hero = vídeo real de futebol de base em tela cheia. A marca fica no header;
 * sobre o vídeo, só headline-pôster, uma linha de apoio e o CTA.
 */
export function Hero({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { hero } = dict;
  const { clips, shot } = media.hero;

  return (
    <section className="relative isolate h-[100svh] min-h-[600px] overflow-hidden bg-ink">
      <div aria-hidden className="absolute inset-0 [animation:hero-push_10s_var(--ease-cine)_both]">
        {clips.length > 0 ? <HeroReel clips={clips} /> : <MediaSlot slot={{ src: null, shot: hero.placeholder || shot }} labelPosition="top" />}
      </div>

      {/* Leitura do texto: escurece só a base e o topo (header) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(5,8,6,0.9)_0%,rgba(5,8,6,0.45)_32%,rgba(5,8,6,0)_58%),linear-gradient(to_bottom,rgba(5,8,6,0.55),transparent_20%)]"
      />

      <div className="gutter absolute inset-x-0 bottom-0 pb-8 md:pb-14">
        <h1 className="display text-[clamp(3.6rem,19.5vw,13.5rem)] leading-[0.84] text-bone md:text-[clamp(4rem,11.5vw,13.5rem)]">
          {hero.headline.map((line, i) => (
            <span key={line} className="hero-line -mt-[0.12em] block overflow-hidden pb-[0.03em] pt-[0.12em]" style={delay(450 + i * 130)}>
              <span>{line}</span>
            </span>
          ))}
        </h1>

        <div className="hero-fade mt-6 flex flex-col gap-6 md:mt-10 md:flex-row md:items-center md:justify-between" style={delay(1150)}>
          <p className="max-w-[30ch] text-[1.05rem] leading-snug text-white/85 md:text-lg">{hero.sub}</p>
          <Button href={`/${lang}/cadastro`} className="h-16 w-full text-[1.05rem] md:w-auto md:px-12">
            {hero.cta}
          </Button>
        </div>
      </div>

      <div aria-hidden className="hero-curtain pointer-events-none absolute inset-0 z-10 bg-ink" />
    </section>
  );
}
