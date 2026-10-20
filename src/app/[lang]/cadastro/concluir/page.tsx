import { notFound, redirect } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import Link from "next/link";
import { getDictionary, getPanelDictionary, getPortalDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { getAccount } from "@/lib/auth/session";
import { completeSignup } from "@/lib/auth/actions";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { CompleteSignupForm } from "@/components/panel/AuthForms";
import { BackendNotice } from "@/components/panel/PanelShell";

export const metadata = privateMetadata;

/** Passo 2 do cadastro para contas que ainda não registraram WhatsApp, país e consentimentos. */
export default async function CompleteSignupPage({ params }: PageProps<"/[lang]/cadastro/concluir">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, p, t, account] = await Promise.all([getDictionary(lang), getPanelDictionary(lang), getPortalDictionary(lang), getAccount()]);
  if (account.backend) {
    if (!account.user) redirect(`/${lang}/entrar`);
    if (!account.user.emailVerified) redirect(`/${lang}/entrar/verificar`);
    if (account.profile?.signup_complete) redirect(`/${lang}/painel`);
  }
  return (
    <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={p.auth.completeTitle} lead={p.auth.completeLead}>
      {account.backend ? (
        <>
          <CompleteSignupForm action={completeSignup.bind(null, lang)} a={p.auth} locale={htmlLang[lang]} select={p.form.select} />
          <p className="mt-8 border-t border-white/10 pt-6 text-[0.9rem] text-ash">
            {t.cta.title} <Link href={`/${lang}/profissional/cadastro`} className="text-bone underline-offset-4 hover:underline">{t.cta.signup}</Link>
          </p>
        </>
      ) : <BackendNotice p={p} />}
    </AuthLayout>
  );
}
