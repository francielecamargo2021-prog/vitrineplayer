import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { LangSwitch } from "@/components/home/LangSwitch";
import type { Locale } from "@/i18n/config";
import type { PanelDictionary } from "@/i18n/get-dictionary";
import { signOut } from "@/lib/auth/actions";

/** Moldura da área privada: marca, nome do responsável, idioma e sair. */
export function PanelShell({ lang, p, name, langLabel, children }: { lang: Locale; p: PanelDictionary; name?: string; langLabel: string; children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-ink">
      <header className="gutter sticky top-0 z-40 flex h-16 items-center justify-between border-b border-white/[0.08] bg-ink/85 backdrop-blur-xl">
        <Link href={`/${lang}/painel`} aria-label={p.shell.panel} className="text-bone">
          <Logo variant="editorial" />
        </Link>
        <div className="flex items-center gap-5 md:gap-8">
          {name && <span className="hidden text-[0.875rem] text-fog md:inline">{name}</span>}
          <LangSwitch current={lang} label={langLabel} />
          {name && (
            <form action={signOut.bind(null, lang)}>
              <button className="text-[0.875rem] font-medium text-fog transition-colors hover:text-bone">{p.shell.logout}</button>
            </form>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}

export function BackendNotice({ p }: { p: PanelDictionary }) {
  return (
    <main className="gutter mx-auto max-w-3xl py-24">
      <h1 className="font-display text-[clamp(2.6rem,9vw,5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">{p.backend.title}</h1>
      <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-fog">{p.backend.body}</p>
    </main>
  );
}

/** Login ativo, mas os dados do painel ainda não migraram (Etapa 3 da migração). */
export function MigrationNotice({ p, name }: { p: PanelDictionary; name: string }) {
  return (
    <main className="gutter mx-auto max-w-3xl py-24" data-testid="painel-migracao">
      <p className="text-[0.95rem] text-fog">{p.auth.signedAs}: <span className="text-bone">{name}</span></p>
      <h1 className="mt-6 font-display text-[clamp(2.6rem,9vw,5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">
        <span className="block text-[#e6e5de]">{p.migration.title[0]}</span>
        <span className="block text-transparent [-webkit-text-stroke:0.02em_#efeee8]">{p.migration.title[1]}</span>
      </h1>
      <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-fog">{p.migration.body}</p>
    </main>
  );
}
