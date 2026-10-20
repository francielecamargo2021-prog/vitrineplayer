import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary, getPanelDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { getAccount } from "@/lib/auth/session";
import { resendVerification, verifyEmail } from "@/lib/auth/actions";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { VerifyForm } from "@/components/panel/AuthForms";
import { BackendNotice } from "@/components/panel/PanelShell";

export const metadata = privateMetadata;

/** Confirmação do e-mail por código de 6 dígitos (passo obrigatório antes do painel). */
export default async function VerifyPage({ params, searchParams }: PageProps<"/[lang]/entrar/verificar">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const sp = await searchParams;
  const [dict, p, account] = await Promise.all([getDictionary(lang), getPanelDictionary(lang), getAccount()]);
  if (account.user?.emailVerified) redirect(`/${lang}/painel`);
  const fromQuery = typeof sp.email === "string" ? sp.email.slice(0, 254) : "";
  const email = account.user?.email ?? fromQuery;
  return (
    <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={p.auth.verifyTitle} lead={p.auth.verifyLead}>
      {account.backend ? (
        <VerifyForm verify={verifyEmail.bind(null, lang)} resend={resendVerification.bind(null, lang)} a={p.auth} email={email} askEmail={!account.user} />
      ) : <BackendNotice p={p} />}
    </AuthLayout>
  );
}
