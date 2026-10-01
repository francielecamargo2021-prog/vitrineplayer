"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locales, type Locale } from "@/i18n/config";

export function LangSwitch({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const rest = pathname.split("/").slice(2).join("/");
  return (
    <nav aria-label={label} className="flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.2em]">
      {locales.map((l, i) => (
        <span key={l} className="flex items-center gap-2">
          {i > 0 && <span className="text-white/20">/</span>}
          <Link
            href={`/${l}${rest ? `/${rest}` : ""}`}
            aria-current={l === current ? "true" : undefined}
            className={l === current ? "text-bone" : "text-ash transition-colors hover:text-bone"}
          >
            {l}
          </Link>
        </span>
      ))}
    </nav>
  );
}
