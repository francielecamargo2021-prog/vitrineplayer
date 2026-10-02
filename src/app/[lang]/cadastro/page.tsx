import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { hasLocale, htmlLang } from "@/i18n/config";
import { getDictionary, getPanelDictionary } from "@/i18n/get-dictionary";
import { privateMetadata } from "@/lib/seo";
import { getSession } from "@/lib/panel/data";
import { signUp } from "@/lib/panel/actions";
import { AuthLayout } from "@/components/panel/AuthLayout";
import { SignupForm } from "@/components/panel/AuthForms";
import { BackendNotice } from "@/components/panel/PanelShell";

export const metadata = privateMetadata;

/** Cadastro real do responsável legal (conta + consentimentos). */
export default async function SignupPage({ params }: PageProps<"/[lang]/cadastro">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const [dict, p, session] = await Promise.all([getDictionary(lang), getPanelDictionary(lang), getSession()]);
  if (session.user) redirect(`/${lang}/painel`);
  return (
    <AuthLayout lang={lang} langLabel={dict.nav.langLabel} title={p.auth.signupTitle} lead={p.auth.signupLead}>
      {session.supabase ? <SignupForm action={signUp.bind(null, lang)} a={p.auth} loginHref={`/${lang}/entrar`} locale={htmlLang[lang]} select={p.form.select} /> : <BackendNotice p={p} />}
    </AuthLayout>
  );
}
