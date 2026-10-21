import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getPanelDictionary } from "@/i18n/get-dictionary";
import { requireGuardianAccount } from "@/lib/auth/session";
import { AccountPanel } from "@/components/panel/AccountPanel";

/** Minha conta: baixar os dados e excluir a conta (LGPD). */
export default async function MyAccount({ params }: PageProps<"/[lang]/painel/conta">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const s = await requireGuardianAccount(lang);
  if (!s) return null;
  const t = (await getPanelDictionary(lang)).account;
  return (
    <main className="gutter mx-auto max-w-4xl py-12 md:py-16">
      <h1 className="font-display text-[clamp(2.6rem,10vw,5.5rem)] font-black uppercase leading-[0.85] [font-stretch:62%]">
        <span className="block text-[#e6e5de]">{t.title[0]}</span>
        <span className="block text-transparent [-webkit-text-stroke:0.02em_#efeee8]">{t.title[1]}</span>
      </h1>
      <p className="mt-4 max-w-[60ch] text-fog">{t.lead}</p>
      <p className="mt-2 text-[0.9rem] text-ash">{s.user.email}</p>
      <div className="mt-10"><AccountPanel lang={lang} t={t} /></div>
    </main>
  );
}
