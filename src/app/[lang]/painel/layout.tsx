import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary, getPanelDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { requireGuardianAccount } from "@/lib/auth/session";
import { getSession } from "@/lib/panel/data";
import { BackendNotice, MigrationNotice, PanelShell } from "@/components/panel/PanelShell";

export const metadata = privateMetadata;

/**
 * Área privada do responsável. Login conferido aqui (e de novo em cada página/ação):
 * sem sessão → Entrar · e-mail não confirmado → código · cadastro incompleto → concluir.
 */
export default async function PanelLayout({ children, params }: LayoutProps<"/[lang]/painel">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, p, account] = await Promise.all([getDictionary(lang), getPanelDictionary(lang), requireGuardianAccount(lang)]);
  const data = account ? (await getSession()).db : null;
  return (
    <PanelShell lang={lang} p={p} langLabel={dict.nav.langLabel} name={account?.profile.full_name}>
      {!account ? <BackendNotice p={p} /> : data ? children : <MigrationNotice p={p} name={account.profile.full_name} />}
    </PanelShell>
  );
}
