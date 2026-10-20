import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { LangSwitch } from "@/components/home/LangSwitch";
import type { Locale } from "@/i18n/config";
import type { PanelDictionary, PortalDictionary } from "@/i18n/get-dictionary";
import type { ProAccount } from "@/lib/portal/data";
import { signOut } from "@/lib/auth/actions";
import { PortalTabs } from "./PortalTabs";

const tabs = [
  ["search", ""],
  ["favorites", "/favoritos"],
  ["lists", "/listas"],
  ["interests", "/interesses"],
] as const;

/** Moldura do portal: marca, organização, abas, idioma e sair. */
export function PortalShell({ lang, p, t, langLabel, name, pro, children }: {
  lang: Locale; p: PanelDictionary; t: PortalDictionary; langLabel: string; name: string; pro: ProAccount; children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-ink">
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-ink/85 backdrop-blur-xl">
        <div className="gutter flex h-16 items-center justify-between">
          <Link href={`/${lang}/portal`} aria-label={t.shell.portal} className="text-bone"><Logo variant="editorial" /></Link>
          <div className="flex items-center gap-5 md:gap-8">
            <span className="hidden text-[0.875rem] text-fog md:inline">{name}{pro.organization ? ` · ${pro.organization.name}` : ""}</span>
            <LangSwitch current={lang} label={langLabel} />
            <form action={signOut.bind(null, lang)}>
              <button className="text-[0.875rem] font-medium text-fog transition-colors hover:text-bone">{p.shell.logout}</button>
            </form>
          </div>
        </div>
        {pro.approved && (
          <PortalTabs base={`/${lang}/portal`} label={t.shell.portal} tabs={tabs.map(([k, href]) => ({ href, label: t.shell.nav[k] }))} />
        )}
      </header>
      {children}
    </div>
  );
}

/** Organização ainda não aprovada (ou recusada/suspensa): nenhum atleta é mostrado. */
export function PendingNotice({ t, pro }: { t: PortalDictionary; pro: ProAccount }) {
  const st = pro.organization?.status ?? "pending";
  const title = st === "rejected" ? t.pending.rejected : st === "suspended" ? t.pending.suspended : t.pending.title;
  return (
    <main className="gutter mx-auto max-w-3xl py-20" data-testid="portal-pendente">
      <h1 className="font-display text-[clamp(2.6rem,10vw,5.5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">
        <span className="block text-[#e6e5de]">{title[0]}</span>
        <span className="block text-transparent [-webkit-text-stroke:0.02em_#efeee8]">{title[1]}</span>
      </h1>
      {pro.organization && <p className="mt-6 text-fog">{t.pending.org}: <span className="text-bone">{pro.organization.name}</span></p>}
      <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-fog">
        {st === "rejected" ? t.pending.rejectedBody : st === "suspended" ? t.pending.suspendedBody : t.pending.body}
      </p>
      {pro.organization?.review_note && <p className="mt-4 border-l-2 border-white/20 pl-4 text-bone">{pro.organization.review_note}</p>}
      <p className="mt-6 text-[0.9rem] text-ash">{t.pending.contact}</p>
    </main>
  );
}
