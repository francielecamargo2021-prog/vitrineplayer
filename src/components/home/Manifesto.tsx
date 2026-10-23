import type { CSSProperties } from "react";
import { media } from "@/content/media";
import type { Dictionary } from "@/i18n/get-dictionary";
import { MediaSlot } from "./MediaSlot";

/**
 * Seção A — "O futebol começa em todo lugar". Quebra de contraste em off-white:
 * texto editorial à esquerda, composição de duas cenas à direita (atmosfera, não atletas
 * cadastrados) e três pontos que explicam o que a plataforma organiza.
 */
export function Manifesto({ dict }: { dict: Dictionary }) {
  const s = dict.home.story;
  return (
    <section id="plataforma" className="gutter relative overflow-hidden bg-bone py-20 text-ink md:py-28 lg:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-6 lg:pt-6">
          <p className="t-kicker !text-turf">{s.kicker}</p>
          <h2 data-reveal="lines" className="t-display t-h2 mt-5">
            {s.lines.map((line, i) => (
              <span key={line} className={`line-mask ${i === 1 ? "mt-2 text-turf" : ""}`} style={{ "--d": i * 160 } as CSSProperties}>
                <span>{line}</span>
              </span>
            ))}
          </h2>
          <p className="mt-8 max-w-[52ch] text-[clamp(1rem,1.2vw,1.125rem)] leading-relaxed text-ink/75">{s.body}</p>
          <ul className="mt-10 grid gap-px border-y border-ink/10 bg-ink/10 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {s.points.map((p, i) => (
              <li key={p.t} data-reveal="up" style={{ "--d": i * 120 } as CSSProperties} className="bg-bone py-5 sm:px-4 lg:px-0 xl:px-4 xl:first:pl-0">
                <p className="t-display text-[1.35rem] leading-none text-ink">{p.t}</p>
                <p className="mt-2 text-[0.92rem] leading-relaxed text-ink/70">{p.d}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Duas cenas em composição editorial */}
        <div className="relative lg:col-span-6" aria-hidden>
          <div className="grid grid-cols-6 gap-3 md:gap-4">
            <div data-reveal="frame" className="relative col-span-4 aspect-[4/5] overflow-hidden bg-pitch">
              <div className="frame-media absolute inset-0">
                <div data-parallax="0.04" className="absolute inset-[-5%]">
                  <MediaSlot slot={media.scenes.bootBall} sizes="(min-width: 1024px) 34vw, 66vw" />
                </div>
              </div>
            </div>
            <div className="col-span-2 flex flex-col justify-end gap-3 md:gap-4">
              <div data-reveal="frame" className="relative aspect-[3/4] overflow-hidden bg-pitch">
                <div className="frame-media absolute inset-0"><MediaSlot slot={media.scenes.duel} sizes="(min-width: 1024px) 17vw, 33vw" className="object-[70%_50%]" /></div>
              </div>
              <div className="relative aspect-square overflow-hidden bg-pitch pitch-lines">
                <span className="absolute inset-[22%] pitch-circle" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mx-auto mt-6 max-w-7xl text-right text-[0.72rem] text-ink/45">{s.credit}</p>
    </section>
  );
}
