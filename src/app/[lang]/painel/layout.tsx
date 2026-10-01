import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary, getPanelDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { requireGuardian } from "@/lib/panel/data";
import { BackendNotice, PanelShell } from "@/components/panel/PanelShell";

export const metadata = privateMetadata;

/** Área privada do responsável. Sessão verificada aqui e de novo em cada página/ação. */
export default async function PanelLayout({ children, params }: LayoutProps<"/[lang]/painel">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, p, session] = await Promise.all([getDictionary(lang), getPanelDictionary(lang), requireGuardian(lang)]);
  return (
    <PanelShell lang={lang} p={p} langLabel={dict.nav.langLabel} name={session?.profile.full_name}>
      {session ? children : <BackendNotice p={p} />}
    </PanelShell>
  );
}
