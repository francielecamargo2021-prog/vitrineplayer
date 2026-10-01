import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { LangSwitch } from "@/components/home/LangSwitch";
import type { Locale } from "@/i18n/config";

/** Cadastro/login: fotografia do hero à esquerda (desktop), formulário à direita. */
export function AuthLayout({ lang, langLabel, title, lead, children }: { lang: Locale; langLabel: string; title: string[]; lead: string; children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-ink lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative h-[34svh] min-h-[220px] overflow-hidden lg:sticky lg:top-0 lg:h-svh">
        <Image src="/media/hero/hero.jpg" alt="" fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover object-[60%_50%]" />
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_top,rgba(5,8,6,0.95),rgba(5,8,6,0.2)_60%),linear-gradient(to_bottom,rgba(5,8,6,0.6),transparent_30%)]" />
        <div className="gutter absolute inset-x-0 top-0 flex h-16 items-center justify-between">
          <Link href={`/${lang}`} className="text-bone"><Logo variant="editorial" /></Link>
          <span className="lg:hidden"><LangSwitch current={lang} label={langLabel} /></span>
        </div>
        <h1 className="gutter absolute inset-x-0 bottom-0 pb-6 font-display text-[clamp(2.8rem,13vw,4rem)] font-black uppercase leading-[0.84] [font-stretch:62%] lg:pb-14 lg:text-[clamp(4rem,7vw,7.5rem)]">
          {title.map((t, i) => (
            <span key={t} className={`block ${i > 0 ? "text-transparent [-webkit-text-stroke:0.02em_#efeee8]" : "text-[#e6e5de]"}`}>{t}</span>
          ))}
        </h1>
      </aside>
      <main className="gutter flex flex-col py-10 lg:px-16 lg:py-0">
        <div className="hidden h-16 items-center justify-end lg:flex"><LangSwitch current={lang} label={langLabel} /></div>
        <div className="mx-auto w-full max-w-xl lg:my-auto lg:py-16">
          <p className="mb-10 max-w-[44ch] text-[1.05rem] leading-relaxed text-fog">{lead}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
