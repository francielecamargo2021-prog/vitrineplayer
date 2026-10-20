import { notFound, redirect } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getDictionary, getPanelDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { getAccount } from "@/lib/auth/session";
import { signUp } from "@/lib/auth/actions";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { SignupForm } from "@/components/panel/AuthForms";
import { BackendNotice } from "@/components/panel/PanelShell";

export const metadata = privateMetadata;

/** Cadastro do responsável legal: conta (Neon Auth) + WhatsApp, país e consentimentos (banco). */
export default async function SignupPage({ params }: PageProps<"/[lang]/cadastro">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, p, account] = await Promise.all([getDictionary(lang), getPanelDictionary(lang), getAccount()]);
  if (account.user) redirect(`/${lang}/painel`);
  return (
    <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={p.auth.signupTitle} lead={p.auth.signupLead}>
      {account.backend ? (
        <SignupForm action={signUp.bind(null, lang)} a={p.auth} loginHref={`/${lang}/entrar`} locale={htmlLang[lang]} select={p.form.select} />
      ) : <BackendNotice p={p} />}
    </AuthLayout>
  );
}
