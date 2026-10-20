"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Abas do portal com a aba atual marcada (aria-current). */
export function PortalTabs({ base, label, tabs }: { base: string; label: string; tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="gutter flex gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const full = base + t.href;
        const current = t.href === "" ? path === base || path.startsWith(`${base}/atleta`) : path.startsWith(full);
        return (
          <Link key={t.href} href={full} aria-current={current ? "page" : undefined}
            className="whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-[0.9rem] text-fog transition-colors hover:text-bone aria-[current=page]:border-grass aria-[current=page]:text-bone">
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
