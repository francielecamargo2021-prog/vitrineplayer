import type { CSSProperties } from "react";
import { media } from "@/content/media";
import type { Dictionary } from "@/i18n/get-dictionary";
import { MediaSlot } from "./MediaSlot";

/**
 * Seção E — Futebol de base. Cena em tela cheia, categorias e países atendidos e
 * indicadores honestos: o zero aparece como zero, explicado (base privada, sem custo).
 */
export function BaseSection({ dict }: { dict: Dictionary }) {
  const k = dict.home.base;
  return (
    <section id="base" className="relative isolate overflow-hidden bg-ink">
      <div data-reveal="frame" className="absolute inset-0 -z-10 overflow-hidden">
        <div className="frame-media absolute inset-0">
          <div data-parallax="0.05" className="absolute inset-[-6%]">
            <MediaSlot slot={media.base} sizes="100vw" />
          </div>
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(to_top,#080d0a_8%,rgba(8,13,10,0.7)_45%,rgba(8,13,10,0.35))]" />
      </div>

      <div className="gutter"><div className="mx-auto flex min-h-[620px] max-w-7xl flex-col justify-end py-16 md:min-h-[86svh] md:py-24">
        <p className="t-kicker">{k.kicker}</p>
        <h2 data-reveal="lines" className="t-display t-h2 mt-5">
          <span className="line-mask"><span>{k.title}</span></span>
        </h2>
        <p className="mt-5 max-w-[48ch] text-[clamp(1rem,1.3vw,1.2rem)] leading-relaxed text-bone/85">{dict.field.caption}</p>

        <dl className="mt-10 grid gap-px border-y border-white/15 bg-white/15 sm:grid-cols-3">
          {k.stats.map((s, i) => (
            <div key={s.label} data-reveal="up" style={{ "--d": i * 120 } as CSSProperties} className="bg-ink/80 py-6 backdrop-blur-sm sm:px-6 sm:first:pl-0">
              <dt className="sr-only">{s.label}</dt>
              <dd>
                <p className="t-display text-[clamp(3rem,6vw,4.75rem)] leading-[0.85] tabular-nums">{s.value}</p>
                <p className="mt-2 text-[0.95rem] font-semibold">{s.label}</p>
                <p className="mt-1 max-w-[30ch] text-[0.85rem] leading-snug text-bone/60">{s.note}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div></div>
    </section>
  );
}
