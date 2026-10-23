import type { CSSProperties } from "react";
import Link from "next/link";
import { media } from "@/content/media";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { LogoMark } from "@/components/brand/Logo";
import { HeroReel } from "./HeroReel";
import { MediaSlot } from "./MediaSlot";

const delay = (ms: number) => ({ "--d": ms }) as CSSProperties;

/**
 * Hero cinematográfico. O VÍDEO É O MESMO de antes (HeroReel + media.hero, mesmo
 * comportamento de reprodução); muda só a composição por cima: gradientes discretos
 * na base e na lateral, título proporcional, texto de apoio, dois CTAs e indicador
 * de rolagem. O conteúdo começa abaixo do menu fixo (pt-24) para nunca ficar coberto.
 */
export function Hero({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const h = dict.home.hero;
  const { clips, shot } = media.hero;

  return (
    <section className="relative isolate flex min-h-[640px] flex-col justify-end overflow-hidden bg-ink pt-24 [height:100svh]">
      <div aria-hidden className="absolute inset-0 -z-20 [animation:hero-push_10s_var(--ease-cine)_both]">
        {clips.length > 0 ? <HeroReel clips={clips} /> : <MediaSlot slot={{ src: null, shot: dict.hero.placeholder || shot }} labelPosition="top" />}
      </div>

      {/* Leitura: topo (menu), base (texto) e lateral esquerda no desktop; transição para a próxima seção */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgba(8,13,10,0.55),transparent_22%),linear-gradient(to_top,#080d0a_0%,rgba(8,13,10,0.82)_22%,rgba(8,13,10,0.35)_52%,rgba(8,13,10,0)_72%)] md:bg-[linear-gradient(to_bottom,rgba(8,13,10,0.5),transparent_20%),linear-gradient(to_top,#080d0a_0%,rgba(8,13,10,0.7)_20%,rgba(8,13,10,0)_58%),linear-gradient(to_right,rgba(8,13,10,0.72)_0%,rgba(8,13,10,0.25)_48%,rgba(8,13,10,0)_70%)]"
      />

      <div className="gutter relative pb-[max(2rem,env(safe-area-inset-bottom))] md:pb-14 xl:pb-28">
        <h1 className="text-bone">
          <span className="hero-line block overflow-hidden pb-2" style={delay(400)}>
            <span className="block text-[clamp(0.95rem,2.2vw,1.35rem)] font-semibold uppercase tracking-[0.12em] text-bone/90">{h.lead}</span>
          </span>
          <span className="hero-line block overflow-hidden pt-1" style={delay(560)}>
            <span className="t-display block text-[clamp(3.4rem,11.5vw,9.25rem)] leading-[0.9]">{h.key}</span>
          </span>
          <span className="hero-line block overflow-hidden pt-2" style={delay(720)}>
            <span className="t-display block text-[clamp(1.45rem,3.4vw,2.6rem)] leading-none text-grass">{h.line}</span>
          </span>
        </h1>

        <div className="hero-fade mt-6 grid gap-6 border-t border-white/20 pt-6 md:mt-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-10" style={delay(1000)}>
          <p className="max-w-[46ch] text-[clamp(0.98rem,1.25vw,1.125rem)] leading-relaxed text-bone/85">{h.body}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/${lang}/cadastro`}
              className="group relative flex h-14 items-center justify-between gap-6 overflow-hidden bg-bone px-6 text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-grass sm:min-w-[15.5rem]"
            >
              <span aria-hidden className="absolute inset-0 origin-left scale-x-0 bg-grass transition-transform duration-700 ease-[var(--ease-cine)] group-hover:scale-x-100" />
              <span className="t-display relative text-[1.3rem] tracking-[0.03em]">{h.cta}</span>
              <LogoMark className="relative size-4" />
            </Link>
            <a
              href="#plataforma"
              className="t-display flex h-14 items-center justify-center border border-white/35 px-6 text-[1.3rem] tracking-[0.03em] text-bone backdrop-blur-sm transition-colors duration-500 hover:border-bone hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-grass"
            >
              {h.cta2}
            </a>
          </div>
        </div>
      </div>

      <a href="#plataforma" className="hero-fade scroll-cue absolute bottom-5 left-1/2 hidden -translate-x-1/2 text-center text-[0.72rem] font-medium uppercase tracking-[0.16em] text-bone/70 xl:block" style={delay(1500)}>
        {h.scroll}
      </a>

      <div aria-hidden className="hero-curtain pointer-events-none absolute inset-0 z-10 bg-ink" />
    </section>
  );
}
