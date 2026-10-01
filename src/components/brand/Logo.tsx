/**
 * Marca provisória: dois cantos de enquadramento — o olhar do scout que
 * "enquadra" o talento — envolvendo a palavra VITRINE.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M2 9V2h7" stroke="currentColor" strokeWidth="2.2" />
      <path d="M22 15v7h-7" stroke="currentColor" strokeWidth="2.2" />
      <rect x="9.5" y="9.5" width="5" height="5" fill="var(--color-signal)" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className="size-5" />
      <span className="font-display text-[0.95rem] font-extrabold uppercase tracking-[0.34em] [font-stretch:125%]">
        Vitrine
      </span>
    </span>
  );
}
