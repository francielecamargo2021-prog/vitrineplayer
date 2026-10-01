import type { CSSProperties } from "react";
import type { MediaSlotData } from "@/content/media";
import { MediaSlot } from "./MediaSlot";

/**
 * Foto/vídeo em tela cheia com título-pôster por cima. A imagem abre como
 * cortina ao entrar na tela; números opcionais entram sobre a cena.
 */
export function FullBleed({
  slot,
  title,
  caption,
  stats,
  id,
}: {
  slot: MediaSlotData;
  title: string[];
  caption?: string;
  stats?: { value: number; label: string }[];
  id?: string;
}) {
  return (
    <section id={id} className="relative h-[92svh] min-h-[560px] overflow-hidden bg-ink md:h-[100svh]">
      <div data-reveal="frame" className="absolute inset-0 overflow-hidden">
        <div className="frame-media absolute inset-0">
          <div data-parallax="0.05" className="absolute inset-[-6%]">
            <MediaSlot slot={slot} labelPosition="top" />
          </div>
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(5,8,6,0.88),rgba(5,8,6,0.15)_50%,rgba(5,8,6,0.35))]" />
      </div>

      <div className="gutter absolute inset-x-0 bottom-0 pb-10 md:pb-16">
        <h2 data-reveal="lines" className="display text-[clamp(3.4rem,17vw,13rem)] leading-[0.84]">
          {title.map((line, i) => (
            <span key={line} className="line-mask" style={{ "--d": 300 + i * 150 } as CSSProperties}>
              <span>{line}</span>
            </span>
          ))}
        </h2>
        {(caption || stats) && (
          <div className="mt-8 grid gap-8 border-t border-white/25 pt-6 md:mt-12 md:grid-cols-12 md:items-end">
            {caption && <p className="max-w-[36ch] text-[1.05rem] leading-snug text-white/85 md:col-span-5">{caption}</p>}
            {stats && (
              <div className="grid grid-cols-3 gap-4 md:col-span-6 md:col-start-7">
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="display text-[clamp(3rem,13vw,7rem)] leading-[0.85] tabular-nums">
                      <span data-count={s.value}>{s.value}</span>
                    </p>
                    <p className="mt-2 text-[0.8rem] leading-tight text-white/75 md:text-sm">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
