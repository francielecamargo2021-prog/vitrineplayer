import type { CSSProperties } from "react";
import { media } from "@/content/media";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/brand/Logo";
import { FootagePlaceholder } from "./FootagePlaceholder";
import { HeroReel } from "./HeroReel";

const delay = (ms: number) => ({ "--d": ms }) as CSSProperties;

/**
 * Hero = vídeo real de futebol de base em 100% do fundo. Sobre ele, apenas:
 * marca, headline, texto curto e CTA — ancorados embaixo, deixando a imagem respirar.
 */
export function Hero({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { hero } = dict;
  const { clips } = media.hero;

  return (
    <section className="relative isolate h-[100svh] min-h-[620px] overflow-hidden bg-ink">
      <div aria-hidden className="absolute inset-0 [animation:hero-push_10s_var(--ease-cine)_both]">
        {clips.length > 0 ? <HeroReel clips={clips} /> : <FootagePlaceholder />}
      </div>

      {/* Gradação mínima: só onde há texto (base) e sob o header (topo) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(7,7,8,0.92)_0%,rgba(7,7,8,0.55)_28%,rgba(7,7,8,0)_55%),linear-gradient(to_bottom,rgba(7,7,8,0.5),transparent_18%)]"
      />

      {clips.length === 0 && (
        <p className="eyebrow gutter absolute inset-x-0 top-20 text-right text-[0.6rem] text-white/30 md:top-24">{hero.placeholder}</p>
      )}

      <div className="gutter absolute inset-x-0 bottom-0 pb-10 md:pb-14">
        <p className="hero-fade mb-6 flex items-center gap-3 md:mb-8" style={delay(900)}>
          <LogoMark className="size-5 text-bone md:size-6" />
          <span className="font-display text-[0.85rem] font-extrabold uppercase tracking-[0.4em] [font-stretch:125%] md:text-[1.05rem]">
            VitrinePlayer
          </span>
        </p>

        <div className="grid gap-8 md:grid-cols-12 md:items-end md:gap-10">
          <h1 className="display text-[clamp(2.7rem,12.2vw,10rem)] leading-[0.86] text-bone [font-stretch:100%] md:col-span-9 md:text-[clamp(3rem,7.6vw,10rem)] md:[font-stretch:115%]">
            {hero.headline.map((line, i) => (
              <span key={line} className="hero-line block overflow-hidden pb-[0.04em]" style={delay(450 + i * 130)}>
                <span>{line}</span>
              </span>
            ))}
          </h1>

          <div className="hero-fade md:col-span-3 md:pb-3" style={delay(1250)}>
            <p className="max-w-[34ch] text-[0.98rem] leading-relaxed text-white/75">{hero.sub}</p>
            <Button href={`/${lang}/cadastro`} className="mt-7 w-full">{hero.cta}</Button>
          </div>
        </div>
      </div>

      {/* Abertura: cortina preta que sobe ao carregar */}
      <div aria-hidden className="hero-curtain pointer-events-none absolute inset-0 z-10 bg-ink" />
    </section>
  );
}
