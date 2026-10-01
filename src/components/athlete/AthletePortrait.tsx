import Image from "next/image";
import { media } from "@/content/media";

/**
 * Retrato do atleta. Usa a foto licenciada quando existir; senão, um retrato
 * editorial em contraluz (silhueta + número) para o protótipo.
 */
/** Matizes de contraluz usadas nos retratos de placeholder (sem verdes). */
export const portraitHues = [18, 210, 32, 350, 200, 40, 230, 8];

export function AthletePortrait({
  number,
  hue = 18,
  className = "",
  priority = false,
  showNumber = true,
}: {
  number?: string;
  hue?: number;
  className?: string;
  priority?: boolean;
  showNumber?: boolean;
}) {
  if (media.athlete.src) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image src={media.athlete.src} alt="" fill priority={priority} sizes="(min-width: 768px) 45vw, 100vw" className="object-cover" />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={`relative overflow-hidden bg-[#0d0d10] ${className}`}
      style={{
        backgroundImage: `radial-gradient(80% 60% at 70% 20%, hsl(${hue} 70% 55% / 0.35), transparent 60%), radial-gradient(70% 50% at 20% 100%, hsl(${hue + 200} 30% 40% / 0.25), transparent 70%)`,
      }}
    >
      {showNumber && number && (
        <span className="display absolute -right-[4%] top-[2%] text-[clamp(9rem,26vw,22rem)] leading-none text-transparent [-webkit-text-stroke:1px_rgba(238,235,229,0.18)]">
          {number}
        </span>
      )}
      <svg viewBox="0 0 200 240" className="absolute bottom-0 left-1/2 h-[82%] -translate-x-1/2" preserveAspectRatio="xMidYMax meet">
        <defs>
          <linearGradient id={`rim-${hue}`} x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor={`hsl(${hue} 80% 70%)`} stopOpacity="0.55" />
            <stop offset="0.18" stopColor="#0a0a0c" />
          </linearGradient>
        </defs>
        <path
          fill={`url(#rim-${hue})`}
          d="M100 30c19 0 33 15 33 37 0 15-6 28-15 35l-1 9c3 6 9 10 20 13 26 7 45 18 52 40l11 76H0l11-76c7-22 26-33 52-40 11-3 17-7 20-13l-1-9c-9-7-15-20-15-35 0-22 14-37 33-37z"
        />
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(7,7,8,0.85),transparent_45%)]" />
      <div className="grain absolute inset-0" />
    </div>
  );
}
