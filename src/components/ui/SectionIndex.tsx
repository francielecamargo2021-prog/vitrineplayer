/** Rótulo editorial de seção: "01 — Conceito" com traço. */
export function SectionIndex({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p data-reveal="fade" className={`eyebrow flex items-center gap-4 ${className}`}>
      <span className="h-px w-10 bg-white/25" aria-hidden />
      {children}
    </p>
  );
}
