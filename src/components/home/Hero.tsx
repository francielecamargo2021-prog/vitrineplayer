import type { CSSProperties } from "react";
import { media } from "@/content/media";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/Button";
import { CinematicBackdrop } from "./CinematicBackdrop";
import { HeroReel } from "./HeroReel";

const delay = (ms: number) => ({ "--d": ms }) as CSSProperties;

export function Hero({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { hero } = dict;
  const { clips } = media.hero;
  // Rótulos dos 4 planos da montagem de fallback.
  const fallbackLabels = [hero.chapters[1], hero.chapters[0], hero.chapters[7], hero.feed];

  return (
    <section className="grain relative isolate h-[100svh] min-h-[600px] overflow-hidden bg-ink">
      <div aria-hidden className="absolute inset-0">
        {clips.length > 0 ? (
          <HeroReel clips={clips} chapters={hero.chapters} />
        ) : (
          <>
            <div className="absolute inset-0 [animation:hero-push_9s_var(--ease-cine)_both]">
              <CinematicBackdrop />
            </div>
            <div className="reel-indicator">
              <p className="eyebrow relative h-4 text-white/70">
                {fallbackLabels.map((label, i) => (
                  <span key={label} className="reel-label absolute inset-0 flex items-center gap-3" style={{ "--i": i } as CSSProperties}>
                    <span className="tabular-nums text-bone">0{i + 1}</span>
                    <span className="h-px w-5 bg-white/30" />
                    {label}
                  </span>
                ))}
              </p>
              <div className="flex gap-1.5">
                {fallbackLabels.map((label, i) => (
                  <span key={label} className="relative h-[2px] flex-1 overflow-hidden bg-white/15">
                    <span className="absolute inset-0 origin-left scale-x-0 bg-bone" style={{ animation: `seg-${i} 24s linear infinite` }} />
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Gradação: leitura do texto embaixo, header legível em cima, vinheta */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(7,7,8,0.96)_0%,rgba(7,7,8,0.6)_30%,rgba(7,7,8,0)_62%),linear-gradient(to_bottom,rgba(7,7,8,0.55),transparent_22%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_16vmax_rgba(0,0,0,0.55)]" />

      {/* Cantos de enquadramento da marca (desktop) */}
      <div aria-hidden className="hero-fade pointer-events-none absolute inset-8 hidden md:block" style={delay(1800)}>
        <span className="absolute left-0 top-14 size-5 border-l border-t border-white/35" />
        <span className="absolute right-0 top-14 size-5 border-r border-t border-white/35" />
      </div>

      <div className="gutter absolute inset-x-0 bottom-0 pb-24 md:pb-28">
        <p className="hero-fade eyebrow mb-6 flex items-center gap-3 text-white/70 md:mb-8" style={delay(900)}>
          <span className="size-1.5 bg-signal" />
          VitrinePlayer · {hero.regions}
        </p>
        <h1 className="display text-[clamp(2.6rem,11.8vw,9.5rem)] text-bone [font-stretch:100%] md:text-[clamp(2.6rem,8.4vw,9.5rem)] md:[font-stretch:125%]">
          {hero.headline.map((line, i) => (
            <span key={line} className="hero-line block overflow-hidden pb-[0.04em]" style={delay(500 + i * 140)}>
              <span>
                {i === hero.headline.length - 1 ? (
                  <>
                    {line.replace(/\.$/, "")}
                    <span className="text-signal">.</span>
                  </>
                ) : (
                  line
                )}
              </span>
            </span>
          ))}
        </h1>
        <div className="hero-fade mt-8 md:mt-10" style={delay(1300)}>
          <Button href={`/${lang}/cadastro`} className="w-full sm:w-auto">{hero.cta}</Button>
        </div>
      </div>

      {/* Abertura: cortina preta que sobe ao carregar */}
      <div aria-hidden className="hero-curtain pointer-events-none absolute inset-0 z-10 bg-ink" />
    </section>
  );
}
