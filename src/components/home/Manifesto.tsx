import type { CSSProperties } from "react";
import type { Dictionary } from "@/i18n/get-dictionary";

/** Manifesto em off-white: quebra de contraste depois do vídeo, tipografia-pôster. */
export function Manifesto({ dict }: { dict: Dictionary }) {
  const m = dict.manifesto;
  return (
    <section id="manifesto" className="gutter relative bg-bone py-24 text-ink md:py-40">
      <h2 data-reveal="lines" className="display text-[clamp(2.9rem,13.5vw,9.5rem)] leading-[0.86]">
        {m.lines.map((line, i) => (
          <span key={line} className={`line-mask ${i === 1 ? "mt-4 text-turf md:mt-6" : ""}`} style={{ "--d": i * 180 } as CSSProperties}>
            <span>{line}</span>
          </span>
        ))}
      </h2>
      <p data-words className="mt-14 max-w-[34ch] text-[clamp(1.25rem,4.6vw,2rem)] font-medium leading-[1.2] tracking-[-0.01em] md:ml-[33%] md:mt-24">
        {m.body.split(" ").map((w, i) => (
          <span key={i} className="w">{w} </span>
        ))}
      </p>
    </section>
  );
}
