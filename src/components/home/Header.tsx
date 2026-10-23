import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { LangSwitch } from "./LangSwitch";
import { MobileMenu } from "./MobileMenu";

/** Menu fixo: transparente sobre o vídeo, fundo escuro ao rolar; menu próprio no celular. */
export function Header({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const links = [
    { href: "#como-funciona", label: dict.nav.how },
    { href: "#perfil", label: dict.nav.profile },
    { href: "#profissionais", label: dict.nav.pros },
    { href: "#cadastro", label: dict.home.pricing.kicker },
  ];
  return (
    <header className="site-header gutter fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between md:h-20">
      <Link href={`/${lang}`} aria-label="VitrinePlayer" className="text-bone">
        <Logo variant="editorial" />
      </Link>
      <div className="flex items-center gap-3 md:gap-8">
        <nav className="hidden items-center gap-8 text-[0.875rem] font-medium text-bone/80 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="relative py-2 transition-colors hover:text-bone after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-grass after:transition-transform after:duration-500 hover:after:scale-x-100">
              {l.label}
            </a>
          ))}
        </nav>
        <LangSwitch current={lang} label={dict.nav.langLabel} />
        <Link
          href={`/${lang}/cadastro`}
          className="header-cta hidden h-10 items-center bg-bone px-4 text-[0.875rem] font-semibold text-ink transition-colors duration-500 hover:bg-grass sm:inline-flex"
        >
          {dict.nav.cta}
        </Link>
        <MobileMenu
          links={links}
          signup={{ href: `/${lang}/cadastro`, label: dict.home.menu.signup }}
          pro={{ href: `/${lang}/profissional`, label: dict.home.menu.pro }}
          labels={{ open: dict.home.menu.open, close: dict.home.menu.close }}
        />
      </div>
    </header>
  );
}
