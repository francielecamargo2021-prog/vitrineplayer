import type { CSSProperties } from "react";

/**
 * Placeholder NEUTRO para vídeo/foto real: simula uma tomada noturna fora de
 * foco (bokeh de refletores, piso escuro, leve pan de câmera). Não é parte da
 * identidade — some assim que `media.ts` recebe o material licenciado.
 */
const layouts = [
  [[8, 30, 9, 0.55], [21, 26, 5, 0.4], [34, 33, 12, 0.35], [52, 24, 7, 0.5], [66, 31, 10, 0.4], [80, 27, 6, 0.55], [93, 32, 11, 0.35]],
  [[12, 40, 11, 0.4], [30, 36, 6, 0.5], [47, 44, 14, 0.3], [63, 38, 8, 0.45], [78, 42, 12, 0.35], [90, 37, 5, 0.5]],
] as const;

export function FootagePlaceholder({ seed = 0 }: { seed?: number }) {
  const lights = layouts[seed % layouts.length];
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-[#0a0a0b]">
      {/* pan lento de câmera */}
      <div className="absolute inset-y-0 -left-[8%] w-[116%] [animation:pan_22s_var(--ease-soft)_infinite_alternate]">
        {/* céu / arquibancada */}
        <div className="absolute inset-0 bg-[radial-gradient(90%_55%_at_50%_28%,#2a2724_0%,#141312_45%,#0a0a0b_75%)]" />
        {/* bokeh de refletores */}
        {lights.map(([x, y, s, o], i) => (
          <span
            key={i}
            className="absolute rounded-full blur-2xl [animation:breathe_7s_ease-in-out_infinite]"
            style={
              {
                left: `${x}%`,
                top: `${y}%`,
                width: `${s}vmax`,
                height: `${s}vmax`,
                opacity: o,
                transform: "translate(-50%,-50%)",
                background: "radial-gradient(circle, #fff3df 0%, rgba(255,232,200,0.5) 35%, transparent 70%)",
                animationDelay: `${i * -1.3}s`,
              } as CSSProperties
            }
          />
        ))}
        {/* piso desfocado */}
        <div className="absolute inset-x-0 bottom-0 h-[52%] bg-[linear-gradient(to_bottom,rgba(40,40,38,0.0),#121212_35%,#0b0b0b)]" />
        <div className="absolute inset-x-0 top-[47%] h-[8%] bg-[radial-gradient(60%_100%_at_50%_50%,rgba(255,236,210,0.12),transparent)] blur-xl" />
      </div>
      <div className="grain absolute inset-0" />
    </div>
  );
}
