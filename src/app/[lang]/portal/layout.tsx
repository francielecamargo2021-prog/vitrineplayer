import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary, getPanelDictionary, getPortalDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { requirePro } from "@/lib/portal/data";
import { BackendNotice } from "@/components/panel/PanelShell";
import { PortalShell } from "@/components/portal/PortalShell";

export const metadata = privateMetadata;

/**
 * Portal dos profissionais. Sessão e papel conferidos aqui (e de novo em cada página
 * e ação). Cada página de atletas mostra o aviso de verificação se a organização não
 * estiver aprovada; "Minha conta" fica sempre acessível.
 */
export default async function PortalLayout({ children, params }: LayoutProps<"/[lang]/portal">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, p, t, s] = await Promise.all([getDictionary(lang), getPanelDictionary(lang), getPortalDictionary(lang), requirePro(lang)]);
  if (!s) return <BackendNotice p={p} />;
  return (
    <PortalShell lang={lang} p={p} t={t} langLabel={dict.nav.langLabel} name={s.profile.full_name} pro={s.pro}>
      {children}
    </PortalShell>
  );
}
