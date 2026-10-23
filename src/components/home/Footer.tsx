import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

export function Footer({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const f = dict.footer;
  return (
    <footer data-cta-hide className="gutter relative overflow-hidden bg-ink pb-10 pt-20 md:pt-28">
      <p aria-hidden className="t-display pointer-events-none select-none text-[clamp(3.5rem,13vw,11rem)] leading-[0.85] text-white/[0.05]">
        VitrinePlayer
      </p>
      <div className="mt-12 flex flex-col gap-10 border-t border-white/10 pt-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm text-fog">{f.tagline}</p>
          <p className="mt-3 text-xs leading-relaxed text-ash">{f.legal}</p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-1 font-sans text-[0.875rem] text-fog [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center">
          <Link href={`/${lang}/privacidade`} className="hover:text-bone">{f.privacy}</Link>
          <Link href={`/${lang}/termos`} className="hover:text-bone">{f.terms}</Link>
          <Link href={`/${lang}/contato`} className="hover:text-bone">{f.contact}</Link>
        </nav>
      </div>
      <p className="mt-10 text-[0.8rem] text-ash">© {new Date().getFullYear()} VITRINEPLAYER. {f.rights}</p>
    </footer>
  );
}
