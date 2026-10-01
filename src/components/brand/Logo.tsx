/**
 * Marca provisória: dois cantos de enquadramento — o olhar do scout que
 * "enquadra" o talento — ao lado do wordmark VITRINEPLAYER.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M2 9V2h7" stroke="currentColor" strokeWidth="2.2" />
      <path d="M22 15v7h-7" stroke="currentColor" strokeWidth="2.2" />
      <rect x="9.5" y="9.5" width="5" height="5" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="size-5" />
      <span className="font-display text-[1.35rem] uppercase leading-none tracking-[0.02em] [font-stretch:72%] md:text-[1.55rem]">
        <span className="font-extrabold">Vitrine</span>
        <span className="font-extrabold text-grass">Player</span>
      </span>
    </span>
  );
}
