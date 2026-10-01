import type { CSSProperties } from "react";
import { media } from "@/content/media";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
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

      {/*
        Composição de pôster: linha de apoio (Archivo largura normal) + palavras-chave
        monumentais (Archivo 62% / 900), filete e base com assinatura + CTA.
        Desktop: chave em uma linha que ocupa a largura; celular: chave empilhada.
      */}
      <div className="gutter absolute inset-x-0 bottom-0 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-12">
        <h1 className="text-bone">
          <span className="hero-line block overflow-hidden pb-[0.35em] md:pb-[0.5em]" style={delay(450)}>
            <span className="font-sans text-[clamp(1.05rem,5.2vw,1.5rem)] font-semibold uppercase leading-[1.1] tracking-[0.03em] md:text-[clamp(1.1rem,1.7vw,2rem)]">
              <span className="block md:inline">{hero.lead[0]}</span> {hero.lead[1]}
            </span>
          </span>
          <span className="hero-line -mt-[0.08em] block overflow-hidden pt-[0.08em]" style={delay(600)}>
            <span className="font-display text-[clamp(3.4rem,21vw,7rem)] font-black uppercase leading-[0.8] tracking-[-0.01em] [font-stretch:62%] md:text-[clamp(4rem,12.4vw,17rem)]">
              <span className="block text-[#e6e5de] md:inline">{hero.key[0]}</span>{" "}
              {/* Contorno: o vídeo aparece por dentro; traço mais grosso no celular, sombra mínima só no traço */}
              <span className="text-transparent [-webkit-text-stroke:0.026em_#efeee8] [filter:drop-shadow(0_1px_1.5px_rgba(5,8,6,0.45))] md:[-webkit-text-stroke:0.016em_#efeee8]">
                {hero.key[1]}
              </span>
            </span>
          </span>
        </h1>

        <div className="hero-fade mt-5 border-t border-white/25 pt-5 md:mt-8 md:flex md:items-end md:justify-between md:gap-10 md:pt-6" style={delay(1100)}>
          <p className="font-display text-[clamp(1.6rem,8.2vw,2.4rem)] font-extrabold uppercase leading-[0.92] [font-stretch:62%] md:text-[clamp(1.6rem,2.3vw,2.6rem)]">
            <span className="block md:inline">{hero.sub[0]}</span> {hero.sub[1]} <span className="text-signal-soft">{hero.sub[2]}</span>
          </p>
          <Link
            href={`/${lang}/cadastro`}
            className="group relative mt-6 flex h-[3.75rem] w-full shrink-0 items-center justify-between overflow-hidden bg-bone px-5 text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal md:mt-0 md:h-16 md:w-auto md:min-w-[18.5rem] md:pl-7 md:pr-6"
          >
            <span aria-hidden className="absolute inset-0 origin-left scale-x-0 bg-signal transition-transform duration-700 ease-[var(--ease-cine)] group-hover:scale-x-100" />
            <span className="relative font-display text-[1.35rem] font-extrabold uppercase leading-none tracking-[0.03em] [font-stretch:62%]">{hero.cta}</span>
            <LogoMark className="relative size-4" />
          </Link>
        </div>
      </div>

      <div aria-hidden className="hero-curtain pointer-events-none absolute inset-0 z-10 bg-ink" />
    </section>
  );
}
