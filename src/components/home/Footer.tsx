import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";

export function Footer({ lang, dict }: { lang: Locale; dict: Dictionary }) {
  const f = dict.footer;
  return (
    <footer data-cta-hide className="gutter relative overflow-hidden pb-10 pt-24 md:pt-32">
      <p aria-hidden data-reveal="fade" className="display pointer-events-none select-none text-center text-[6.6vw] leading-[0.8] text-transparent [-webkit-text-stroke:1px_rgba(238,235,229,0.12)]">
        VitrinePlayer
      </p>
      <div className="mt-16 flex flex-col gap-10 border-t border-white/10 pt-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm text-fog">{f.tagline}</p>
          <p className="mt-3 text-xs leading-relaxed text-ash">{f.legal}</p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-3 font-sans text-[0.875rem] text-fog">
          <Link href={`/${lang}`} className="hover:text-bone">{f.privacy}</Link>
          <Link href={`/${lang}`} className="hover:text-bone">{f.terms}</Link>
          <Link href={`/${lang}`} className="hover:text-bone">{f.contact}</Link>
        </nav>
      </div>
      <p className="eyebrow mt-10">© {new Date().getFullYear()} VITRINEPLAYER. {f.rights}</p>
    </footer>
  );
}
