import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/i18n/config";
import { getDictionary, getPanelDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { getAccount } from "@/lib/auth/session";
import { signIn } from "@/lib/auth/actions";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { LoginForm } from "@/components/panel/AuthForms";
import { BackendNotice } from "@/components/panel/PanelShell";

export const metadata = privateMetadata;

export default async function LoginPage({ params }: PageProps<"/[lang]/entrar">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, p, account] = await Promise.all([getDictionary(lang), getPanelDictionary(lang), getAccount()]);
  if (account.user) redirect(`/${lang}/painel`);
  return (
    <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={p.auth.loginTitle} lead={p.auth.loginLead}>
      {account.backend ? (
        <LoginForm action={signIn.bind(null, lang)} a={p.auth} signupHref={`/${lang}/cadastro`} forgotHref={`/${lang}/entrar/recuperar`} />
      ) : <BackendNotice p={p} />}
    </AuthLayout>
  );
}
