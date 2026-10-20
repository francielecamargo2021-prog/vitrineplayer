import { notFound, redirect } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getDictionary, getPanelDictionary, getPortalDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { getAccount } from "@/lib/auth/session";
import { completeProSignup, proSignUp } from "@/lib/auth/actions";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { BackendNotice } from "@/components/panel/PanelShell";
import { ProSignupForm } from "@/components/portal/ProSignupForm";

export const metadata = privateMetadata;

/**
 * Cadastro profissional (clube, empresário, agente, olheiro, escolinha, núcleo).
 * Conta logada que ainda não concluiu o cadastro vê só os dados da organização.
 */
export default async function ProSignupPage({ params }: PageProps<"/[lang]/profissional/cadastro">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, p, t, account] = await Promise.all([getDictionary(lang), getPanelDictionary(lang), getPortalDictionary(lang), getAccount()]);
  const pending = account.backend && account.user;
  if (pending && account.profile?.signup_complete) redirect(`/${lang}/painel`);
  if (pending && !account.user!.emailVerified) redirect(`/${lang}/entrar/verificar`);
  return (
    <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={pending ? t.signup.completeTitle : t.signup.title} lead={pending ? t.signup.completeLead : t.signup.lead}>
      {account.backend ? (
        <ProSignupForm
          action={(pending ? completeProSignup : proSignUp).bind(null, lang)}
          t={t.signup} a={p.auth} lang={lang} locale={htmlLang[lang]} select={p.form.select} optional={p.form.optional} withAccount={!pending}
        />
      ) : <BackendNotice p={p} />}
    </AuthLayout>
  );
}
