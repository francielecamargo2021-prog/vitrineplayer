import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary, getPanelDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { getAccount } from "@/lib/auth/session";
import { requestPasswordReset, resetPassword } from "@/lib/auth/actions";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { ForgotForm, ResetForm } from "@/components/panel/AuthForms";
import { BackendNotice } from "@/components/panel/PanelShell";

export const metadata = privateMetadata;

/** Recuperação de senha por código: 1) e-mail · 2) código + nova senha. */
export default async function RecoverPage({ params, searchParams }: PageProps<"/[lang]/entrar/recuperar">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const sp = await searchParams;
  const [dict, p, account] = await Promise.all([getDictionary(lang), getPanelDictionary(lang), getAccount()]);
  const email = typeof sp.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sp.email) ? sp.email.slice(0, 254) : "";
  const base = `/${lang}/entrar`;
  return (
    <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={p.auth.resetTitle} lead={email ? p.auth.resetCodeLead : p.auth.resetLead}>
      {!account.backend ? <BackendNotice p={p} /> : email ? (
        <ResetForm action={resetPassword.bind(null, lang)} a={p.auth} email={email} loginHref={base} otherHref={`${base}/recuperar`} />
      ) : (
        <ForgotForm action={requestPasswordReset.bind(null, lang)} a={p.auth} loginHref={base} />
      )}
    </AuthLayout>
  );
}
