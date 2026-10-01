import type { CSSProperties } from "react";

/**
 * Montagem cinematográfica gerada em CSS/SVG — substituta do vídeo do hero
 * enquanto o material licenciado não existe. Quatro "planos" de 6 s em
 * crossfade com Ken Burns: refletores, túnel, gramado e leitura de scout.
 * Zero requisições externas; roda só com GPU (opacity/transform).
 */
export function CinematicBackdrop() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-ink">
      <Scene i={0}><Floodlights /></Scene>
      <Scene i={1}><Tunnel /></Scene>
      <Scene i={2}><Pitch /></Scene>
      <Scene i={3}><ScoutRead /></Scene>
    </div>
  );
}

function Scene({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <div className="scene" style={{ "--i": i } as CSSProperties}>
      <div className="kb">{children}</div>
    </div>
  );
}

/* Plano 1 — Arquibancada na noite, torres de refletores e feixes na névoa. */
function Floodlights() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,#1b1d24_0%,#0b0b0e_55%,#050506_100%)]">
      {[18, 82].map((x) => (
        <div key={x} className="absolute top-[16%]" style={{ left: `${x}%` }}>
          <div className="absolute -left-[22vmax] -top-[22vmax] size-[44vmax] rounded-full bg-[radial-gradient(circle,rgba(255,244,225,0.55)_0%,rgba(255,236,210,0.14)_28%,transparent_62%)]" />
          <div className="relative grid -translate-x-1/2 grid-cols-4 gap-[3px]">
            {Array.from({ length: 12 }).map((_, k) => (
              <span key={k} className="size-[7px] rounded-[1px] bg-[#fff8ec] shadow-[0_0_14px_4px_rgba(255,240,215,0.7)]" />
            ))}
          </div>
          <div
            className="absolute left-0 top-0 h-[120vh] w-[60vw] origin-top -translate-x-1/2 blur-2xl [animation:beam_6s_ease-in-out_infinite]"
            style={{
              background: "conic-gradient(from 168deg at 50% 0%, transparent 0deg, rgba(255,240,220,0.28) 12deg, transparent 24deg)",
              transform: `translateX(-50%) rotate(${x < 50 ? -14 : 14}deg)`,
            }}
          />
        </div>
      ))}
      {/* partículas na luz */}
      <div className="absolute inset-[-20%] opacity-40 [animation:drift_14s_linear_infinite] [background-image:radial-gradient(rgba(255,245,230,0.5)_1px,transparent_1.5px)] [background-size:90px_70px]" />
      {/* anel da arquibancada */}
      <div className="absolute inset-x-[-10%] bottom-[-30%] h-[70%] rounded-[50%] bg-[#0a0a0c] shadow-[0_-40px_120px_rgba(0,0,0,0.9)]">
        <div className="absolute inset-x-[12%] top-[7%] h-[14%] opacity-50 [background-image:radial-gradient(rgba(255,230,200,0.6)_1px,transparent_1.6px)] [background-size:14px_10px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      </div>
    </div>
  );
}

/* Plano 2 — Túnel de acesso: o atleta entrando em campo, em contraluz. */
function Tunnel() {
  return (
    <div className="absolute inset-0 bg-[#060607]">
      <div className="absolute inset-0 [perspective:600px]">
        {Array.from({ length: 9 }).map((_, k) => (
          <div
            key={k}
            className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 border border-white/[0.06]"
            style={{
              width: `${100 - k * 9}vmax`,
              height: `${70 - k * 6}vmax`,
              borderRadius: `${40 - k * 3.6}vmax ${40 - k * 3.6}vmax 0 0`,
              background: k === 8 ? "radial-gradient(circle at 50% 70%, #fff7ea 0%, #f1dcc0 35%, #c9a77f 70%)" : "transparent",
              boxShadow: k === 8 ? "0 0 120px 50px rgba(255,236,206,0.35)" : undefined,
            }}
          />
        ))}
      </div>
      {/* reflexo no piso */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_top,rgba(255,236,206,0.10),transparent_70%)]" />
      <div className="absolute bottom-[8%] left-1/2 h-[38%] w-[3vmax] -translate-x-1/2 bg-[linear-gradient(to_top,transparent,rgba(255,236,206,0.25))] blur-xl" />
      {/* silhueta */}
      <svg viewBox="0 0 40 100" className="absolute left-1/2 top-[calc(46%-6vmax)] h-[17vmax] -translate-x-1/2" fill="#050505">
        <circle cx="20" cy="9" r="6.2" />
        <path d="M10 18h20l3 30-4 1-2-20-1 30 3 39h-6l-3-34-3 34H11l3-39-1-30-2 20-4-1z" />
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,transparent,rgba(0,0,0,0.85))]" />
    </div>
  );
}

/* Plano 3 — Gramado em perspectiva (atrás do gol), cortado por um feixe de luz. */
const VY = 150; // ponto de fuga
const yAt = (z: number) => VY + 950 / z; // profundidade → y na tela
const halfW = (y: number) => (y - VY) * 1.95;
const band = (z0: number, z1: number) => {
  const a = yAt(z0), b = yAt(z1);
  return `${800 - halfW(a)},${a} ${800 + halfW(a)},${a} ${800 + halfW(b)},${b} ${800 - halfW(b)},${b}`;
};
const pitchBands = Array.from({ length: 12 }, (_, i) => [1 + i * 0.26, 1 + (i + 1) * 0.26]);

function Pitch() {
  const far = yAt(4.12), mid = yAt(2.2), near = yAt(1);
  return (
    <div className="absolute inset-0 bg-[#060707]">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        {pitchBands.map(([z0, z1], i) => (
          <polygon key={i} points={band(z0, z1)} fill={i % 2 ? "#1a231e" : "#151d19"} />
        ))}
        <g fill="none" stroke="rgba(240,240,230,0.55)" strokeWidth="2.5">
          <polygon points={band(1, 4.12)} />
          <line x1={800 - halfW(mid)} y1={mid} x2={800 + halfW(mid)} y2={mid} />
          <ellipse cx="800" cy={mid} rx={halfW(mid) * 0.2} ry={halfW(mid) * 0.045} />
          <polygon points={`${800 - halfW(far) * 0.4},${far} ${800 + halfW(far) * 0.4},${far} ${800 + halfW(yAt(3.6)) * 0.4},${yAt(3.6)} ${800 - halfW(yAt(3.6)) * 0.4},${yAt(3.6)}`} />
        </g>
        <rect x="0" y={near - 1} width="1600" height="10" fill="#060707" />
      </svg>
      <div className="absolute inset-y-0 left-0 w-[40%] bg-[linear-gradient(90deg,transparent,rgba(255,240,220,0.12),transparent)] [animation:sweep_6s_var(--ease-soft)_infinite]" />
      <div className="absolute inset-x-0 top-0 h-[42%] bg-[linear-gradient(to_bottom,#050506_55%,transparent)]" />
      <div className="absolute inset-x-0 top-[26%] h-[22%] bg-[radial-gradient(50%_100%_at_50%_50%,rgba(255,240,220,0.10),transparent)] blur-2xl" />
    </div>
  );
}

/* Plano 4 — Leitura de scout: pontos no campo, mira que trava em um talento. */
function ScoutRead() {
  const dots = [
    [22, 30], [30, 62], [38, 44], [46, 72], [52, 28], [58, 54], [66, 38], [72, 70], [80, 48], [34, 82], [62, 82], [86, 26],
  ];
  return (
    <div className="absolute inset-0 bg-[#08080a]">
      <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:8vmax_8vmax] [mask-image:radial-gradient(70%_60%_at_50%_50%,black,transparent)]" />
      {dots.map(([x, y], k) => (
        <span
          key={k}
          className="absolute size-2 -translate-1/2 rounded-full bg-white/40"
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      ))}
      <span className="absolute left-[58%] top-[54%] size-3 -translate-1/2 rounded-full bg-signal shadow-[0_0_30px_8px_rgba(255,91,35,0.45)]" />
      <div className="absolute left-[58%] top-[54%] size-[14vmax] -translate-1/2">
        <span className="absolute inset-0 rounded-full border border-signal/50" />
        <span className="absolute inset-[30%] rounded-full border border-signal/30" />
        <span className="absolute left-1/2 top-[-20%] h-[30%] w-px bg-signal/50" />
        <span className="absolute bottom-[-20%] left-1/2 h-[30%] w-px bg-signal/50" />
        <span className="absolute left-[-20%] top-1/2 h-px w-[30%] bg-signal/50" />
        <span className="absolute right-[-20%] top-1/2 h-px w-[30%] bg-signal/50" />
      </div>
      <p className="absolute left-[calc(58%+9vmax)] top-[calc(54%-1rem)] hidden font-mono text-[0.65rem] uppercase leading-relaxed tracking-[0.2em] text-signal/80 md:block">
        2011 · MD · L
        <br />
        <span className="text-white/40">1,62 m · BR</span>
      </p>
    </div>
  );
}
