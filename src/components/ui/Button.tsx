import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "dark" | "ghost" | "line";

const base =
  "group relative inline-flex items-center justify-center gap-3 overflow-hidden font-sans text-[0.98rem] font-semibold tracking-[-0.005em] transition-colors duration-500 ease-[var(--ease-cine)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal";

const variants: Record<Variant, string> = {
  primary: "h-14 px-7 bg-bone text-ink",
  dark: "h-14 px-7 bg-ink text-bone hover:text-ink",
  ghost: "h-14 px-7 border border-white/20 text-bone hover:border-white/60",
  line: "h-10 text-bone",
};

/** CTA com preenchimento "cortina" no hover e seta que avança. */
export function Button({
  variant = "primary",
  className = "",
  children,
  arrow = false,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; arrow?: boolean }) {
  return (
    <Link className={`${base} ${variants[variant]} ${className}`} {...props}>
      {(variant === "primary" || variant === "dark") && (
        <span
          aria-hidden
          className="absolute inset-0 origin-left scale-x-0 bg-signal transition-transform duration-700 ease-[var(--ease-cine)] group-hover:scale-x-100"
        />
      )}
      {variant === "line" && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-1.5 h-px origin-right scale-x-100 bg-current transition-transform duration-700 ease-[var(--ease-cine)] group-hover:origin-left group-hover:scale-x-0"
        />
      )}
      <span className="relative">{children}</span>
      {arrow && <Arrow className="relative size-3.5 transition-transform duration-700 ease-[var(--ease-cine)] group-hover:translate-x-1" />}
    </Link>
  );
}

export function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path d="M1 8h13M9 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
