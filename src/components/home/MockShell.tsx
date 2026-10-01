import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { LangSwitch } from "./LangSwitch";

/** Moldura comum aos mockups: deixa claro que é protótipo visual. */
export function MockShell({ lang, dict, children }: { lang: Locale; dict: Dictionary; children: React.ReactNode }) {
  return (
    <div className="min-h-svh">
      <header className="gutter sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/[0.07] bg-ink/80 backdrop-blur-xl">
        <Link href={`/${lang}`} aria-label={dict.mock.back}>
          <Logo />
        </Link>
        <div className="flex items-center gap-5">
          <span className="eyebrow hidden border border-signal/40 px-2.5 py-1 text-signal sm:inline">{dict.mock.badge}</span>
          <LangSwitch current={lang} label={dict.nav.langLabel} />
        </div>
      </header>
      {children}
    </div>
  );
}
