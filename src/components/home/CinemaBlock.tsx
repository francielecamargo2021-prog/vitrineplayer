import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Bloco fotográfico em tela cheia entre seções. A imagem é revelada por uma
 * "cortina" que abre e um zoom-out lento; a legenda entra em seguida.
 * Sem foto licenciada, usa um plano da montagem cinematográfica (`fallback`).
 */
export function CinemaBlock({
  src,
  fallback,
  kicker,
  title,
}: {
  src: string | null;
  fallback: ReactNode;
  kicker: string;
  title: string[];
}) {
  return (
    <section className="relative h-[88svh] min-h-[520px] overflow-hidden bg-ink md:h-[100svh]">
      <div data-reveal="frame" className="absolute inset-0 overflow-hidden">
        <div className="frame-media absolute inset-0">
          <div data-parallax="0.06" className="absolute inset-[-8%]">
            {src ? <Image src={src} alt="" fill sizes="100vw" className="object-cover" /> : fallback}
          </div>
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(7,7,8,0.9),rgba(7,7,8,0.1)_55%,rgba(7,7,8,0.5))]" />
        <div className="grain absolute inset-0" />
      </div>
      <div className="gutter absolute inset-x-0 bottom-0 pb-14 md:pb-20">
        <p data-reveal="fade" className="eyebrow mb-6 flex items-center gap-3 text-white/70" style={{ "--d": 500 } as React.CSSProperties}>
          <span className="size-1.5 bg-bone" />
          {kicker}
        </p>
        <h2 data-reveal="lines">
          {title.map((line, i) => (
            <span key={line} className="line-mask" style={{ "--d": 600 + i * 150 } as React.CSSProperties}>
              <span className={i === 0 ? "display text-[clamp(2.4rem,9vw,8rem)] [font-stretch:100%] md:[font-stretch:125%]" : "serif-accent text-[clamp(2.6rem,9.5vw,8.5rem)] leading-[0.95] text-fog"}>
                {line}
              </span>
            </span>
          ))}
        </h2>
      </div>
    </section>
  );
}
