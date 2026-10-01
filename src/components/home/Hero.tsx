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

      {/* Leitura do texto: base e topo (header); no desktop também o lado do texto */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(5,8,6,0.88)_0%,rgba(5,8,6,0.5)_38%,rgba(5,8,6,0)_64%),linear-gradient(to_bottom,rgba(5,8,6,0.5),transparent_18%)] md:bg-[linear-gradient(to_top,rgba(5,8,6,0.8)_0%,rgba(5,8,6,0.3)_40%,rgba(5,8,6,0)_62%),linear-gradient(to_right,rgba(5,8,6,0.6)_0%,rgba(5,8,6,0.28)_45%,rgba(5,8,6,0)_72%),linear-gradient(to_bottom,rgba(5,8,6,0.5),transparent_18%)]"
      />

      <div className="gutter absolute inset-x-0 bottom-0 pb-8 md:pb-14">
        {/* Quebras próprias: 3 linhas no desktop, 4 no celular (só uma versão é exibida/lida). */}
        <h1 className="display text-[clamp(2.9rem,15vw,13.5rem)] leading-[0.84] text-bone md:text-[clamp(4rem,8.6vw,11rem)]">
          {[
            { lines: hero.headlineMobile, cls: "md:hidden" },
            { lines: hero.headline, cls: "hidden md:block" },
          ].map(({ lines, cls }) => (
            <span key={cls} className={cls}>
              {lines.map((line, i) => (
                <span key={line} className="hero-line -mt-[0.12em] block overflow-hidden pb-[0.03em] pt-[0.12em]" style={delay(450 + i * 130)}>
                  <span>{line}</span>
                </span>
              ))}
            </span>
          ))}
        </h1>

        <div className="hero-fade mt-6 flex flex-col gap-6 md:mt-10 md:flex-row md:items-center md:justify-between" style={delay(1150)}>
          <p className="display text-[clamp(1.6rem,7.4vw,3.4rem)] leading-[0.9] text-bone/90 md:text-[clamp(1.8rem,3.1vw,3.4rem)]">
            {hero.sub.map((part) => (
              <span key={part} className="block md:inline md:after:content-['_']">
                {part}
              </span>
            ))}
          </p>
          <Button href={`/${lang}/cadastro`} className="h-16 w-full text-[1.05rem] md:w-auto md:px-12">
            {hero.cta}
          </Button>
        </div>
      </div>

      <div aria-hidden className="hero-curtain pointer-events-none absolute inset-0 z-10 bg-ink" />
    </section>
  );
}
