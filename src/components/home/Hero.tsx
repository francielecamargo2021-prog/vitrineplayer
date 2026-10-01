import type { CSSProperties } from "react";
import { media } from "@/content/media";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/Button";
import { CinematicBackdrop } from "./CinematicBackdrop";

const delay = (ms: number) => ({ "--d": ms }) as CSSProperties;

export function Hero({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const { hero } = dict;
  const { video, videoMobile, poster } = media.hero;

  return (
    <section className="grain relative isolate flex h-[100svh] min-h-[560px] flex-col justify-end overflow-hidden">
      {video ? (
        <video
          className="absolute inset-0 -z-10 size-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster ?? undefined}
          aria-hidden
        >
          {videoMobile && <source src={videoMobile} media="(max-width: 767px)" type="video/mp4" />}
          <source src={video} type="video/mp4" />
        </video>
      ) : (
        <div className="absolute inset-0 -z-10">
          <CinematicBackdrop />
        </div>
      )}

      {/* Gradação para leitura do texto + vinheta */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,rgba(7,7,8,0.92)_0%,rgba(7,7,8,0.45)_35%,transparent_65%,rgba(7,7,8,0.35)_100%)]" />
      <div aria-hidden className="absolute inset-0 -z-10 shadow-[inset_0_0_18vmax_rgba(0,0,0,0.6)]" />

      {/* HUD de enquadramento — o olhar do scout */}
      <div aria-hidden className="hero-fade pointer-events-none absolute inset-4 md:inset-8" style={delay(1600)}>
        <span className="absolute left-0 top-16 size-5 border-l border-t border-white/40 md:top-14" />
        <span className="absolute right-0 top-16 size-5 border-r border-t border-white/40 md:top-14" />
        <span className="absolute bottom-0 left-0 size-5 border-b border-l border-white/40" />
        <span className="absolute bottom-0 right-0 size-5 border-b border-r border-white/40" />
        <p className="eyebrow absolute right-8 top-[4.6rem] hidden items-center gap-2 text-white/60 md:flex">
          <span className="size-1.5 rounded-full bg-signal [animation:rec_1.6s_ease-in-out_infinite]" />
          {hero.feed}
        </p>
        <p className="eyebrow absolute bottom-6 right-8 hidden text-white/50 md:block">{hero.regions}</p>
      </div>

      <div className="gutter relative pb-16 md:pb-24">
        <h1 className="display text-[clamp(2.1rem,8.6vw,9.5rem)] text-bone">
          {hero.headline.map((line, i) => (
            <span key={line} className="hero-line block overflow-hidden pb-[0.04em]" style={delay(250 + i * 140)}>
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

        <div className="mt-8 flex flex-col gap-8 md:mt-12 md:flex-row md:items-end md:justify-between">
          <p className="hero-fade max-w-[30ch] text-base leading-relaxed text-fog md:text-lg" style={delay(1000)}>
            {hero.sub}
          </p>
          <div className="hero-fade flex flex-wrap items-center gap-6" style={delay(1200)}>
            <Button href={`/${lang}/cadastro`}>{hero.cta}</Button>
            <Button href="#profissionais" variant="line">{hero.secondary}</Button>
          </div>
        </div>
      </div>

      <div aria-hidden className="hero-fade absolute bottom-0 left-1/2 hidden h-14 w-px -translate-x-1/2 overflow-hidden bg-white/10 md:block" style={delay(1800)}>
        <span className="absolute inset-0 bg-bone [animation:scroll-cue_2.4s_var(--ease-soft)_infinite]" />
      </div>
    </section>
  );
}
