import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { LangSwitch } from "./LangSwitch";

export function Header({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  return (
    <header className="site-header gutter fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between md:h-20">
      <Link href={`/${lang}`} aria-label="VitrinePlayer" className="header-logo text-bone">
        <Logo />
      </Link>
      <div className="flex items-center gap-6 md:gap-10">
        <nav className="hidden items-center gap-8 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-fog lg:flex">
          <a href="#como-funciona" className="transition-colors hover:text-bone">{dict.nav.how}</a>
          <a href="#perfil" className="transition-colors hover:text-bone">{dict.nav.profile}</a>
          <a href="#profissionais" className="transition-colors hover:text-bone">{dict.nav.pros}</a>
        </nav>
        <LangSwitch current={lang} label={dict.nav.langLabel} />
        <Link
          href={`/${lang}/cadastro`}
          className="header-cta hidden h-10 items-center border border-white/20 px-4 font-mono text-[0.68rem] uppercase tracking-[0.2em] transition-colors duration-500 hover:border-bone hover:bg-bone hover:text-ink sm:inline-flex"
        >
          {dict.nav.cta}
        </Link>
      </div>
    </header>
  );
}
